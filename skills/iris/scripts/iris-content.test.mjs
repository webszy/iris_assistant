import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createClient, cacheKey, defaultCacheDir, normalizeURL, main } from './iris-content.mjs';

async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'iris-content-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let time = Date.parse('2026-09-22T00:00:00Z');
  const calls = [];
  let response = () => new Response(JSON.stringify({ success: true, data: {
    resourceId: 'r', content: '# PRD\r\n你好', revision: 'revision-1',
    sizeBytes: Buffer.byteLength('# PRD\r\n你好'), repository: 'memory', path: 'server-path',
    contentType: 'text/markdown',
  } }), { status: 200 });
  const env = { IRIS_API_URL: 'https://iris.example', IRIS_API_TOKEN: 'test-secret-never-cache', IRIS_CACHE_DIR: root, ...overrides.env };
  const options = { env, now: () => time, warn: () => {},
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); return response(); }, ...overrides };
  options.env = env;
  const file = path.join(root, 'content', cacheKey(env.IRIS_API_URL, 'p', 'r') + '.json');
  return { root, file, calls, env, client: createClient(options),
    advance: ms => { time += ms; },
    respond: fn => { response = fn; },
    error: (code, status) => { response = () => new Response(JSON.stringify({ success: false, error: { code, message: 'unsafe upstream detail' } }), { status }); },
    exists: async () => fs.access(file).then(() => true, () => false),
  };
}

test('first GET caches, second GET uses the same snapshot without API', async t => {
  const f = await fixture(t);
  const first = await f.client.get('p', 'r');
  assert.equal(await f.exists(), true);
  assert.deepEqual(await f.client.get('p', 'r'), first);
  assert.equal(f.calls.length, 1);
  const entry = JSON.parse(await fs.readFile(f.file, 'utf8'));
  assert.equal(Date.parse(entry.expiresAt) - Date.parse(entry.cachedAt), 300000);
  assert.deepEqual(Object.keys(entry).sort(), ['version', 'projectId', 'resourceId', 'content', 'revision', 'sizeBytes', 'cachedAt', 'expiresAt'].sort());
  assert.equal(JSON.stringify(entry).includes(f.env.IRIS_API_TOKEN), false);
  assert.equal(JSON.stringify(entry).includes('Authorization'), false);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(f.file)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.dirname(f.file))).mode & 0o777, 0o700);
  }
});
test('TTL expiration and explicit refresh both fetch', async t => {
  const f = await fixture(t);
  await f.client.get('p', 'r');
  await f.client.get('p', 'r', { refresh: true });
  assert.equal(f.calls.length, 2);
  f.advance(300001);
  await f.client.get('p', 'r');
  assert.equal(f.calls.length, 3);
});
for (const corruption of ['json', 'version', 'identity', 'size', 'expiration']) {
  test(`invalid ${corruption} cache falls back to API`, async t => {
    const f = await fixture(t); await f.client.get('p', 'r');
    const entry = JSON.parse(await fs.readFile(f.file, 'utf8'));
    if (corruption === 'version') entry.version = 2;
    if (corruption === 'identity') entry.projectId = 'other';
    if (corruption === 'size') entry.sizeBytes++;
    if (corruption === 'expiration') entry.expiresAt = 'not-a-date';
    await fs.writeFile(f.file, corruption === 'json' ? '{bad' : JSON.stringify(entry));
    await f.client.get('p', 'r'); assert.equal(f.calls.length, 2);
  });
}
test('successful PUT calls server with supplied revision and invalidates without write-through', async t => {
  const f = await fixture(t); await f.client.get('p', 'r');
  const body = { content: '# changed', expected_revision: 'user-supplied-stale-revision' };
  f.respond(() => new Response(JSON.stringify({ success: true, data: { resourceId: 'r', revision: 'new' } })));
  await f.client.put('p', 'r', body);
  assert.equal(f.calls[1].method, 'PUT');
  assert.deepEqual(JSON.parse(f.calls[1].body), body);
  assert.equal(await f.exists(), false);
});
test('CONTENT_CONFLICT invalidates; a later refresh reads server', async t => {
  const f = await fixture(t); await f.client.get('p', 'r');
  f.error('CONTENT_CONFLICT', 409);
  await assert.rejects(f.client.put('p', 'r', { content: 'x', expected_revision: 'revision-1' }), { code: 'CONTENT_CONFLICT' });
  assert.equal(await f.exists(), false);
  assert.equal(f.calls.length, 2); // no automatic retry
  f.respond(() => new Response(JSON.stringify({ success: true, data: { resourceId: 'r', content: 'new', revision: 'new', sizeBytes: 3 } })));
  assert.equal((await f.client.get('p', 'r', { refresh: true })).data.revision, 'new');
});
for (const [code, status] of [['CONTENT_NOT_FOUND', 404], ['RESOURCE_CONTENT_UNSUPPORTED', 422], ['CONTENT_TOO_LARGE', 413], ['CONTENT_PROVIDER_ERROR', 502]]) {
  test(`${code} on refresh removes cache and reports failure`, async t => {
    const f = await fixture(t); await f.client.get('p', 'r'); f.error(code, status);
    await assert.rejects(f.client.get('p', 'r', { refresh: true }), { code });
    assert.equal(await f.exists(), false);
  });
}
test('expired content never masks network errors', async t => {
  const f = await fixture(t); await f.client.get('p', 'r'); f.advance(300001);
  f.respond(() => { throw new Error('private URL and credentials'); });
  await assert.rejects(f.client.get('p', 'r'), { code: 'NETWORK_ERROR' });
  assert.equal(await f.exists(), false);
});
for (const field of ['kind', 'repository', 'path']) {
  test(`PATCH ${field} invalidates cache`, async t => {
    const f = await fixture(t); await f.client.get('p', 'r');
    await f.client.patch('p', 'r', { [field]: 'new-value' });
    assert.equal(f.calls.at(-1).method, 'PATCH'); assert.equal(await f.exists(), false);
  });
}
test('name-only PATCH leaves content cache; DELETE invalidates', async t => {
  const f = await fixture(t); await f.client.get('p', 'r');
  await f.client.patch('p', 'r', { name: 'new-name' }); assert.equal(await f.exists(), true);
  f.respond(() => new Response(null, { status: 204 }));
  await f.client.delete('p', 'r'); assert.equal(await f.exists(), false);
});
test('CREATE invalidates returned Resource without populating cache', async t => {
  const f = await fixture(t); await f.client.get('p', 'r');
  f.respond(() => new Response(JSON.stringify({ success: true, data: { resource: { id: 'r' }, content: { revision: 'new' } } }), { status: 201 }));
  await f.client.create('p', { name: 'README.md', path: 'README.md', role: 'context', content: '# P' });
  assert.match(f.calls.at(-1).url, /\/resources\/markdown$/);
  assert.equal(await f.exists(), false);
});
for (const operation of ['readFile', 'writeFile', 'mkdir', 'rename', 'chmod']) {
  test(`cache ${operation} failure does not fail GET`, async t => {
    const io = { ...fs, [operation]: async () => { throw Object.assign(new Error(), { code: 'EACCES' }); } };
    const f = await fixture(t, { io });
    assert.equal((await f.client.get('p', 'r')).success, true);
    await f.client.get('p', 'r');
    assert.equal(f.calls.length, operation === 'chmod' ? 1 : 2);
  });
}
test('failed unlink cannot reuse cache in the same client', async t => {
  const f = await fixture(t, { io: { ...fs, unlink: async () => { throw Object.assign(new Error(), { code: 'EACCES' }); } } });
  await f.client.get('p', 'r'); await f.client.invalidate('p', 'r');
  await f.client.get('p', 'r'); assert.equal(f.calls.length, 2);
});
test('cleanup removes expired and malformed entries, preserves unrelated files', async t => {
  const f = await fixture(t); await f.client.get('p', 'r'); f.advance(300001);
  const malformed = path.join(f.root, 'content', 'a'.repeat(64) + '.json');
  await fs.writeFile(malformed, '{bad');
  const unrelated = path.join(f.root, 'content', 'keep.txt'); await fs.writeFile(unrelated, 'keep');
  await f.client.cleanup();
  assert.equal(await f.exists(), false);
  await assert.rejects(fs.access(malformed)); assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep');
});
test('clear-cache and invalidate remove only managed entries', async t => {
  const f = await fixture(t); await f.client.get('p', 'r');
  await f.client.invalidate('p', 'r'); assert.equal(await f.exists(), false);
  await f.client.get('p', 'r'); await f.client.clear(); assert.equal(await f.exists(), false);
});
test('cache keys isolate servers, normalize trailing slash and resist traversal/delimiter collisions', () => {
  assert.notEqual(cacheKey('https://a.example', 'p', 'r'), cacheKey('https://b.example', 'p', 'r'));
  assert.equal(cacheKey('https://A.example/', 'p', 'r'), cacheKey('https://a.example', 'p', 'r'));
  assert.match(cacheKey('https://a.example', '../../p', '../r'), /^[a-f0-9]{64}$/);
  assert.notEqual(cacheKey('https://a.example', 'a|b', 'c'), cacheKey('https://a.example', 'a', 'b|c'));
  assert.throws(() => normalizeURL('https://user:secret@a.example'), { code: 'INVALID_CONFIGURATION' });
  assert.equal(defaultCacheDir({}, 'darwin', '/Users/test'), '/Users/test/Library/Caches/Iris');
});
for (const ttl of ['bad', '-1', '0', 'Infinity', '1.5']) {
  test(`invalid TTL ${ttl} defaults to 300 seconds`, async t => {
    const f = await fixture(t, { env: { IRIS_CACHE_TTL_SECONDS: ttl } }); await f.client.get('p', 'r');
    const e = JSON.parse(await fs.readFile(f.file, 'utf8')); assert.equal(Date.parse(e.expiresAt) - Date.parse(e.cachedAt), 300000);
  });
}
test('custom TTL is respected', async t => {
  const f = await fixture(t, { env: { IRIS_CACHE_TTL_SECONDS: '10' } }); await f.client.get('p', 'r');
  f.advance(10001); await f.client.get('p', 'r'); assert.equal(f.calls.length, 2);
});

// Exercise the CLI parser/output without opening sockets or using actual credentials.
test('CLI --refresh bypasses cache and stdout remains JSON', async t => {
  const f = await fixture(t);
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch, oldWrite = process.stdout.write;
  let calls = 0, output = '';
  try {
    Object.assign(process.env, f.env);
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ success: true,
      data: { resourceId: 'r', content: 'cli', revision: 'cli-1', sizeBytes: 3 } })); };
    process.stdout.write = chunk => { output += chunk; return true; };
    await main(['get', '--project', 'p', '--resource', 'r']);
    await main(['get', '--project', 'p', '--resource', 'r']);
    await main(['get', '--project', 'p', '--resource', 'r', '--refresh']);
    assert.equal(calls, 2);
    assert.equal(output.trim().split('\n').length, 3);
    for (const line of output.trim().split('\n')) assert.equal(JSON.parse(line).success, true);
    assert.equal(output.includes(f.env.IRIS_API_TOKEN), false);
    await assert.rejects(main(['get', '--project', 'p', '--resource', 'r', '--unknown']), { code: 'INVALID_ARGUMENTS' });
  } finally {
    globalThis.fetch = oldFetch; process.stdout.write = oldWrite;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
