import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = resolve(PROJECT_ROOT, "..", "iris-memory");
const DEFAULT_INSTANCE_NAME = "Iris";

function lines(values: string[]): string {
  return `${values.join("\n")}\n`;
}

function memoryConfig(instanceName: string): string {
  return lines([
    "version: 1",
    "type: iris-memory",
    "",
    "instance:",
    `  name: ${JSON.stringify(instanceName)}`,
  ]);
}

function repositoryFiles(instanceName: string): ReadonlyMap<string, string> {
  return new Map([
    [
      ".gitignore",
      lines([
        ".env",
        ".env.*",
        "!.env.example",
        "",
        "*.key",
        "*.pem",
        "",
        "credentials.*",
        "secrets.*",
        "",
        ".DS_Store",
      ]),
    ],
    [".iris/memory.yaml", memoryConfig(instanceName)],
    [
      ".iris/MEMORY_RULES.md",
      lines([
        "# Iris Memory Rules",
        "",
        "## 1. 状态与内容的边界",
        "",
        "D1 保存 Project、Task、Resource 等业务记录与运行状态。Git 保存长期记忆、规格、研究、产物、知识和可复用能力。",
        "不把数据库状态、当前项目、当前任务、任务进度或数据库导出镜像写成 Markdown。",
        "项目 README 可以描述长期目标与背景，但不得成为运行状态的第二份来源。",
        "",
        "## 2. 项目路径",
        "",
        "项目专属内容必须放在 `projects/<project-id>/`，ID 必须来自真实 Project 记录。",
        "不得使用 name 或 slug 替代 ID，也不得把文档中的示例 UUID 当成真实项目。",
        "推荐子目录为 `specs/`、`research/`、`artifacts/`，按实际内容需要创建。",
        "项目改名或修改 slug 时保留原路径。",
        "",
        "## 3. Resource 与 Git",
        "",
        "Git 可以包含未注册为 Iris Resource 的文件。创建文件并不自动代表 Resource 已注册。",
        "Resource 的 repository 与 path 共同定位持久内容；注册行为应通过 Iris 支持的接口完成。",
        "Skill 是目录 Resource，独立 Script 是文件 Resource。",
        "",
        "已被 Resource 引用的路径是持久地址。不得静默移动、重命名或删除引用目标。",
        "确需调整时，先确认引用及迁移方案，再协调文件与 Resource 更新并验证读取结果。",
        "将内容移入 `archive/` 同样属于路径变更，必须遵守上述规则。",
        "",
        "## 4. 内容放置",
        "",
        "- `projects/`：单个项目的长期内容。",
        "- `skills/`：以 `SKILL.md` 为入口的可复用能力及其 references、scripts。",
        "- `scripts/`：可独立使用的脚本。",
        "- `prompts/`：可复用提示词。",
        "- `references/`：跨项目参考资料。",
        "- `knowledge/`：经整理的长期知识。",
        "- `identity/`：Personality、偏好与行为原则。",
        "- `archive/`：不再活跃但需要保留的内容。",
        "",
        "不为尚未实现的能力编造接口、命令或完成状态。原始对话日志默认不作为长期记忆保存；",
        "提炼有持续价值的决策、事实与依据，避免无必要的个人信息。",
        "",
        "## 5. 配置与凭据",
        "",
        "`.iris/memory.yaml` v1 仅包含 version、type、instance.name。",
        "不得添加 user_id、api_token、github_token、current_project、current_task 或 database state。",
        "",
        "仓库中永远不得存放真实 Secret，包括 Token、私钥、密码、凭据文件，以及正文、示例或历史提交中的凭据。",
        "`.gitignore` 只是辅助，不是安全边界；已跟踪文件不会因忽略规则自动消失。",
        "若发现凭据泄露，立即停止传播并通知负责人吊销或轮换；仅删除当前文件不足以消除 Git 历史中的泄露。",
        "",
        "v0.1 的 `GITHUB_TOKEN` 放在 Cloudflare Worker Secret，不放入 D1 的 users 表。",
        "未来如有多用户凭据需求，使用独立的 user-scoped credential 模型；数据库只保存应用层加密后的密文，",
        "加密密钥保存在 Worker Secret。GitHub App 可作为后续方案，本版不实现凭据存储或连接管理。",
        "",
        "## 6. 编辑与历史",
        "",
        "编辑前读取现有内容，优先最小修改，保留有价值的上下文与 Git 历史。",
        "提交使用能说明内容变化及目的的信息。避免无关重排、整篇重写和未经授权的历史重写。",
        "写入后核对内容和路径；只有实际执行过的验证才能标记完成。",
      ]),
    ],
    [
      "AGENTS.md",
      lines([
        "# Iris Memory Agent Rules",
        "",
        "1. D1 stores operational state; Git stores durable memory and content.",
        "2. Project-specific content lives under `projects/<project-id>/`.",
        "3. Git may contain files that are not registered as Iris Resources.",
        "4. Resource paths are durable addresses. Do not move referenced files silently.",
        "5. Skills are directory Resources; standalone Scripts are file Resources.",
        "6. Never store secrets in this repository.",
        "7. Prefer minimal edits over whole-document rewrites.",
        "8. Preserve Git history and use meaningful commits.",
        "9. Do not mirror Task/Project runtime state into Markdown.",
        "10. Do not store raw conversation logs as long-term memory by default.",
        "",
        "Read `.iris/MEMORY_RULES.md` before editing repository content.",
      ]),
    ],
    [
      "README.md",
      lines([
        "# iris-memory",
        "",
        "Iris 的持久记忆与内容仓库（v0.1）。D1 保存运行状态，Git 保存长期内容及其历史。",
        "",
        "## 目录",
        "",
        "```text",
        "iris-memory/",
        "├── README.md",
        "├── AGENTS.md",
        "├── .gitignore",
        "├── .iris/",
        "│   ├── memory.yaml",
        "│   └── MEMORY_RULES.md",
        "├── projects/          # 按真实 Project ID 存放项目内容",
        "├── skills/",
        "│   └── iris/",
        "│       ├── SKILL.md",
        "│       ├── references/",
        "│       └── scripts/",
        "├── scripts/           # 独立脚本",
        "├── prompts/           # 可复用提示词",
        "├── references/        # 跨项目参考资料",
        "├── knowledge/         # 长期知识",
        "├── identity/          # Personality、偏好与行为原则",
        "└── archive/           # 不再活跃的内容",
        "```",
        "",
        "空目录使用 `.gitkeep` 保留。新增实际内容时可移除对应占位文件。",
        "",
        "## 项目存储身份",
        "",
        "项目路径固定为 `projects/<project-id>/`，使用 D1 中的真实 Project ID，不使用 slug。",
        "为项目创建目录时，可包含 `README.md`、`specs/`、`research/`、`artifacts/`。",
        "",
        "Project ID 是稳定存储身份；name 和 slug 面向人使用。项目改名或修改 slug 不改变 Git 路径。",
        "Git 文件不必全部注册为 Resource；Skill 注册为目录 Resource，独立 Script 注册为文件 Resource。",
        "",
        "## 使用规则",
        "",
        "编辑前阅读 [AGENTS.md](AGENTS.md) 和 [完整 Memory 规则](.iris/MEMORY_RULES.md)。",
        "`.iris/memory.yaml` 只保存仓库类型、版本与实例名称，不保存用户身份、凭据或运行状态。",
        "",
        "## GitHub 接入（后续配置）",
        "",
        "v0.1 使用 Cloudflare Worker Secret `GITHUB_TOKEN`；不向 D1 的 `users` 表添加 Token 字段。",
        "创建 fine-grained PAT 时，仅授权本仓库，授予 `Contents: Read and write`。",
        "通过 Worker 的 Secret 配置入口保存凭据，真实值不得出现在本仓库、聊天、日志或命令示例中。",
        "",
        "仓库文件创建完成不代表 GitHub 远端、Worker Secret 或 Markdown CREATE / READ / UPDATE 已配置或验证。",
        "后续在远端与 Secret 配置完成后，使用专门的测试文件验证创建、读取和更新，再检查 Git 历史。",
      ]),
    ],
    [
      "projects/README.md",
      lines([
        "# Projects",
        "",
        "每个项目使用 D1 中真实的 Project ID 作为目录名，不使用 slug 或 name。",
        "",
        "```text",
        "projects/<project-id>/",
        "├── README.md",
        "├── specs/",
        "├── research/",
        "└── artifacts/",
        "```",
        "",
        "`<project-id>` 是文档占位符，不能作为实际目录名。取得真实 ID 后按需创建目录。",
        "项目 README 记录长期背景与内容索引，不镜像 Task/Project 运行状态。",
      ]),
    ],
    [
      "skills/iris/SKILL.md",
      lines([
        "---",
        "name: iris",
        "description: Organize durable Iris memory in this repository, including project documents and reusable knowledge. Use when creating or updating content in iris-memory.",
        "---",
        "",
        "# Iris Memory",
        "",
        "本 Skill 是 v0.1 仓库内容维护入口；不包含 Iris API 调用或 GitHub 同步实现。",
        "",
        "1. 阅读仓库根目录 `AGENTS.md` 和 `.iris/MEMORY_RULES.md`。",
        "2. 确认内容属于项目文档、共享知识、身份原则或可复用能力。",
        "3. 项目内容使用真实 Project ID 定位 `projects/<project-id>/`；没有 ID 时先取得 ID，不猜测或使用 slug。",
        "4. 读取现有文件并进行最小修改；新文件不自动视为已注册 Resource。",
        "5. 保持已有 Resource 路径稳定；迁移前确认引用及更新方案。",
        "6. 检查内容不含 Secret、运行状态镜像或默认保存的原始对话日志。",
        "7. 核对写入结果，报告实际变更和验证情况。",
        "",
        "`references/` 留给后续参考资料，`scripts/` 留给后续必要的辅助脚本；仅在有实际实现时添加。",
      ]),
    ],
    ["archive/.gitkeep", ""],
    ["identity/.gitkeep", ""],
    ["knowledge/.gitkeep", ""],
    ["prompts/.gitkeep", ""],
    ["references/.gitkeep", ""],
    ["scripts/.gitkeep", ""],
    ["skills/iris/references/.gitkeep", ""],
    ["skills/iris/scripts/.gitkeep", ""],
  ]);
}

function writeRepository(root: string, instanceName: string): void {
  for (const [relativePath, content] of repositoryFiles(instanceName)) {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content, "utf8");
  }
}

function initializeGit(root: string): void {
  execFileSync("git", ["init", "--initial-branch=main", root], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main(): void {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      "instance-name": { type: "string", default: DEFAULT_INSTANCE_NAME },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(
      "用法：pnpm memory:init -- [--target <目录>] [--instance-name Iris]\n" +
      `默认目录：${DEFAULT_TARGET}\n` +
      "创建标准 Iris Memory 目录和本地 Git 仓库；不创建远端、不提交、不推送。\n" +
      "目标路径必须不存在，脚本不会覆盖已有目录或文件。\n",
    );
    return;
  }

  const target = resolve(values.target ?? DEFAULT_TARGET);
  const instanceName = values["instance-name"].trim();
  if (!instanceName || instanceName.length > 100 || /[\x00-\x1f\x7f]/.test(instanceName)) {
    throw new Error("--instance-name 必须为 1–100 个字符，且不能包含控制字符。");
  }
  if (existsSync(target)) {
    throw new Error(`目标路径已存在，未修改任何内容：${target}`);
  }

  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${basename(target)}-`));
  let published = false;
  try {
    writeRepository(staging, instanceName);
    initializeGit(staging);
    renameSync(staging, target);
    published = true;
  } finally {
    if (!published) rmSync(staging, { recursive: true, force: true });
  }

  process.stdout.write(
    `Iris Memory 仓库已创建：${target}\n` +
    `Instance：${instanceName}\n` +
    "Git 默认分支：main（尚未提交，也未配置远端）\n",
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`创建 Iris Memory 仓库失败：${message}\n`);
  process.exitCode = 1;
}
