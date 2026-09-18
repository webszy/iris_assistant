// 全局类型声明：与 @cloudflare/workers-types 中的 `Cloudflare.Env` 合并，
// 使 `cloudflare:test` 导出的 `env` 携带本项目绑定与测试专用 migrations。
//
// 注意：本文件不能出现顶层 import/export，否则会变成模块，命名空间将无法合并；
// 因此这里用 `import("...")` 类型查询而不是顶层 import。
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
