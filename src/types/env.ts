/** Cloudflare Workers 运行时绑定。 */
export interface Env {
  DB: D1Database;
  // Optional so the metadata API remains usable without the content provider.
  IRIS_MEMORY_REPOSITORY?: string;
  IRIS_MEMORY_GITHUB_OWNER?: string;
  IRIS_MEMORY_GITHUB_REPO?: string;
  IRIS_MEMORY_GITHUB_BRANCH?: string;
  GITHUB_TOKEN?: string;
}

/** 对外暴露的用户表示；时间字段统一为 ISO 8601 UTC 字符串。 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 认证成功后写入 Hono Context 的身份契约。
 * 受保护路由只能读取这里的身份，绝不读取客户端传入的 user_id。
 */
export interface AppVariables {
  user: AuthenticatedUser;
  apiTokenId: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
