#!/usr/bin/env node
// Node 18+; no dependencies. See ../references/local-cache.md.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 5 * 1024 * 1024;
const HASH_FILE = /^[a-f0-9]{64}\.json$/;
const CODES = new Set(['BAD_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND', 'INTERNAL_ERROR',
  'PROJECT_NOT_FOUND', 'MILESTONE_NOT_FOUND', 'TASK_NOT_FOUND', 'RESOURCE_NOT_FOUND',
  'INVALID_RESOURCE_SCOPE', 'INVALID_RESOURCE_LOCATION', 'INVALID_CAPABILITY_RESOURCE_KIND',
  'RESOURCE_IN_USE', 'CONTENT_ALREADY_EXISTS', 'CONTENT_NOT_FOUND', 'CONTENT_CONFLICT',
  'CONTENT_TOO_LARGE', 'RESOURCE_CONTENT_UNSUPPORTED', 'CONTENT_PROVIDER_ERROR']);
export class ClientError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
export function normalizeURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new ClientError('INVALID_CONFIGURATION'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ClientError('INVALID_CONFIGURATION');
  }
  return url.href.replace(/\/+$/, '');
}
export function defaultCacheDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.IRIS_CACHE_DIR) return env.IRIS_CACHE_DIR;
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'Iris');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Iris', 'Cache');
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'iris');
}
export function cacheKey(base, projectId, resourceId) {
  // Tuple encoding avoids delimiter collisions; credentials are never part of the key.
  return createHash('sha256').update(JSON.stringify([normalizeURL(base), projectId, resourceId])).digest('hex');
}
function snapshot(data, resourceId) {
  if (!data || data.resourceId !== resourceId || typeof data.content !== 'string' ||
      typeof data.revision !== 'string' || !data.revision || !Number.isInteger(data.sizeBytes) ||
      data.sizeBytes < 0 || data.sizeBytes > MAX_BYTES || Buffer.byteLength(data.content, 'utf8') !== data.sizeBytes) {
    return null;
  }
  return { resourceId, content: data.content, revision: data.revision, sizeBytes: data.sizeBytes };
}
function validEntry(entry, now) {
  return entry?.version === 1 && typeof entry.projectId === 'string' && entry.projectId.length > 0 &&
    typeof entry.resourceId === 'string' && entry.resourceId.length > 0 && snapshot(entry, entry.resourceId) &&
    Number.isFinite(Date.parse(entry.cachedAt)) && Date.parse(entry.cachedAt) <= now &&
    Date.parse(entry.expiresAt) > now && Date.parse(entry.expiresAt) > Date.parse(entry.cachedAt);
}

export function createClient({ env = process.env, fetchImpl = globalThis.fetch, io = fs,
  now = Date.now, warn = () => process.stderr.write('Iris local cache unavailable; using API where needed.\n') } = {}) {
  const base = env.IRIS_API_URL ? normalizeURL(env.IRIS_API_URL) : null;
  const token = env.IRIS_API_TOKEN;
  const rawTTL = Number(env.IRIS_CACHE_TTL_SECONDS);
  const ttl = Number.isSafeInteger(rawTTL) && rawTTL > 0 && rawTTL <= 2147483647 ? rawTTL : 300;
  const root = defaultCacheDir(env);
  const dir = path.join(root, 'content');
  const blocked = new Set();
  const generations = new Map();
  let usable = true;
  let initialized = false;
  const fileFor = (p, r) => path.join(dir, `${cacheKey(base, p, r)}.json`);
  async function remove(file) {
    try { await io.unlink(file); return true; }
    catch (e) { if (e.code === 'ENOENT') return true; warn(); return false; }
  }
  async function readEntry(file) {
    // Never follow a cache-file symlink or load arbitrarily large cache files.
    const info = await io.lstat(file);
    if (!info.isFile() || info.size > MAX_BYTES * 6 + 8192) return null;
    return JSON.parse(await io.readFile(file, 'utf8'));
  }
  async function cleanup() {
    if (!usable) return;
    try {
      for (const name of await io.readdir(dir)) {
        if (!HASH_FILE.test(name)) continue;
        const file = path.join(dir, name);
        try { if (validEntry(await readEntry(file), now())) continue; } catch { /* invalid */ }
        await remove(file);
      }
    } catch (e) { if (e.code !== 'ENOENT') warn(); }
  }
  async function init() {
    if (initialized) return;
    initialized = true;
    try {
      if (!path.isAbsolute(root)) throw new Error('cache must be absolute');
      // Refuse cache roots inside a Git checkout, the current directory, or the Skill.
      const skill = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
      if (path.resolve(root) === process.cwd()) throw new Error('cache is cwd');
      for (const forbidden of [skill]) {
        const relative = path.relative(forbidden, root);
        if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('unsafe cache root');
      }
      for (let parent = root; ; parent = path.dirname(parent)) {
        try { await io.lstat(path.join(parent, '.git')); throw new ClientError('UNSAFE_CACHE_DIRECTORY'); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (path.dirname(parent) === parent) break;
      }
      await io.mkdir(dir, { recursive: true, mode: 0o700 });
      for (const folder of [root, dir]) {
        if ((await io.lstat(folder)).isSymbolicLink()) throw new Error('symlink cache directory');
        try { await io.chmod(folder, 0o700); } catch { warn(); }
      }
    } catch { usable = false; warn(); }
    await cleanup();
  }
  async function invalidate(p, r) {
    await init();
    const file = fileFor(p, r);
    generations.set(file, (generations.get(file) || 0) + 1);
    blocked.add(file); // A failed unlink must not permit reuse in this process.
    if (usable) await remove(file);
  }
  async function save(p, r, data, generation) {
    if (!usable) return;
    const file = fileFor(p, r);
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      const time = now();
      const entry = { version: 1, projectId: p, ...data,
        cachedAt: new Date(time).toISOString(), expiresAt: new Date(time + ttl * 1000).toISOString() };
      await io.writeFile(temp, JSON.stringify(entry), { flag: 'wx', mode: 0o600 });
      if ((generations.get(file) || 0) !== generation) { await remove(temp); return; }
      await io.rename(temp, file);
      if ((generations.get(file) || 0) !== generation) { await remove(file); return; }
      blocked.delete(file);
    } catch { warn(); await remove(temp); }
  }
  async function request(method, endpoint, body) {
    if (!base) throw new ClientError('INVALID_CONFIGURATION');
    if (!token) throw new ClientError('MISSING_IRIS_API_TOKEN');
    let response;
    try {
      response = await fetchImpl(base + endpoint, { method, redirect: 'error',
        signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json',
          'User-Agent': 'iris-content/1.0', Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new ClientError('NETWORK_ERROR'); }
    if (response.status === 204 && method === 'DELETE') return { success: true, data: null };
    let result;
    try { result = await response.json(); } catch { throw new ClientError('INVALID_API_RESPONSE', response.status); }
    if (!response.ok || result?.success !== true) {
      const code = CODES.has(result?.error?.code) ? result.error.code : 'API_ERROR';
      // Never print arbitrary upstream error messages, URLs, headers or credentials.
      throw new ClientError(code, response.status);
    }
    return result;
  }
  function resourcePath(p, r) {
    if (typeof p !== 'string' || !p || (r !== undefined && (typeof r !== 'string' || !r))) throw new ClientError('INVALID_INPUT');
    return `/api/v1/projects/${encodeURIComponent(p)}/resources${r === undefined ? '' : '/' + encodeURIComponent(r)}`;
  }
  async function get(p, r, { refresh = false } = {}) {
    const endpoint = resourcePath(p, r) + '/content';
    if (!token) throw new ClientError('MISSING_IRIS_API_TOKEN');
    await init();
    const file = fileFor(p, r);
    if (refresh) await invalidate(p, r);
    if (usable && !refresh && !blocked.has(file)) {
      try {
        const entry = await readEntry(file);
        if (validEntry(entry, now()) && entry.projectId === p && entry.resourceId === r) {
          return { success: true, data: snapshot(entry, r) };
        }
      } catch (e) { if (e.code !== 'ENOENT') warn(); }
      await invalidate(p, r);
    }
    const generation = generations.get(file) || 0;
    try {
      const result = await request('GET', endpoint);
      const data = snapshot(result.data, r);
      if (!data) throw new ClientError('INVALID_API_RESPONSE');
      if ((generations.get(file) || 0) === generation) await save(p, r, data, generation);
      return { success: true, data };
    } catch (error) { await invalidate(p, r); throw error; }
  }
  async function mutate(method, p, r, body) {
    const endpoint = resourcePath(p, r) + (method === 'POST' ? '/markdown' : method === 'PUT' ? '/content' : '');
    await init();
    // Pre-invalidation also handles lost responses; writes always reach the server.
    const changesContent = method === 'PUT' || method === 'DELETE' ||
      (method === 'PATCH' && ['kind', 'repository', 'path'].some(k => Object.hasOwn(body, k)));
    if (changesContent) await invalidate(p, r);
    try {
      const result = await request(method, endpoint, body);
      if (changesContent) await invalidate(p, r);
      if (method === 'POST' && typeof result.data?.resource?.id === 'string') await invalidate(p, result.data.resource.id);
      return result;
    } catch (error) {
      if (changesContent || error.code === 'CONTENT_CONFLICT') await invalidate(p, r);
      throw error;
    }
  }
  return { get, invalidate, cleanup: async () => { await init(); await cleanup(); },
    put: (p, r, body) => mutate('PUT', p, r, body),
    create: (p, body) => mutate('POST', p, undefined, body),
    patch: (p, r, body) => mutate('PATCH', p, r, body),
    delete: (p, r) => mutate('DELETE', p, r),
    clear: async () => {
      await init();
      if (!usable) return;
      try { for (const name of await io.readdir(dir)) if (HASH_FILE.test(name)) {
        const file = path.join(dir, name);
        generations.set(file, (generations.get(file) || 0) + 1);
        blocked.add(file); await remove(file);
      } } catch (e) { if (e.code !== 'ENOENT') warn(); }
    } };
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const allowed = {
    get: ['project', 'resource', 'refresh'], put: ['project', 'resource', 'input'],
    create: ['project', 'input'], patch: ['project', 'resource', 'input'],
    delete: ['project', 'resource'], invalidate: ['project', 'resource'], 'clear-cache': [],
  };
  if (!Object.hasOwn(allowed, command || '')) throw new ClientError('INVALID_COMMAND');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!allowed[command].includes(name) || Object.hasOwn(options, name)) throw new ClientError('INVALID_ARGUMENTS');
    if (name === 'refresh') options[name] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new ClientError('INVALID_ARGUMENTS');
      options[name] = args[++i];
    }
  }
  for (const name of allowed[command].filter(k => k !== 'refresh')) if (!options[name]) throw new ClientError('MISSING_ARGUMENT');
  let body;
  if (options.input) {
    try {
      let input;
      if (options.input === '-') {
        const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
        input = Buffer.concat(chunks).toString('utf8');
      } else input = await fs.readFile(options.input, 'utf8');
      body = JSON.parse(input);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { throw new ClientError('INVALID_INPUT'); }
  }
  const client = createClient();
  const p = options.project, r = options.resource;
  let result;
  if (command === 'get') result = await client.get(p, r, { refresh: options.refresh });
  else if (command === 'create') result = await client.create(p, body);
  else if (command === 'put' || command === 'patch') result = await client[command](p, r, body);
  else if (command === 'delete') result = await client.delete(p, r);
  else {
    if (command === 'invalidate') await client.invalidate(p, r); else await client.clear();
    result = { success: true, data: { cacheAction: command, bestEffort: true } };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ success: false, error: {
      code: error instanceof ClientError ? error.code : 'CLIENT_ERROR',
      status: error instanceof ClientError ? error.status : 0,
    } }) + '\n');
    process.exitCode = 1;
  });
}
