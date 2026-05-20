<div align="center">

# CLI-JAW

### 你的个人 AI 助手。2 行安装。7 个 AI 引擎，一个仪表盘。

[![npm](https://img.shields.io/npm/v/cli-jaw)](https://npmjs.com/package/cli-jaw)
[![Version](https://img.shields.io/badge/v2.0.0-GA-brightgreen)](https://github.com/lidge-jun/cli-jaw/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%3E%3D22-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED?logo=docker&logoColor=white)](#docker)

[English](README.md) / [한국어](README.ko.md) / **中文** / [日本語](README.ja.md)

</div>

## 安装

<details>
<summary><b>安全安装</b> — 面向现有用户，最小改动</summary>

```bash
# macOS / Linux
JAW_SAFE=1 npm install -g cli-jaw    # skips optional tool/runtime setup
jaw init                              # 准备好后再交互式配置
```

Windows 用户应使用下方的 WSL 安装路径。原生 PowerShell 不是 CLI-JAW 支持的安装目标。

</details>

```bash
# macOS / Linux / WSL，已安装 Node.js 22+
npm install -g cli-jaw
jaw dashboard
```

完成。打开 **http://localhost:3457** 即可拥有你的个人 AI 助手。需要 [Node.js 22+](https://nodejs.org)。

> **第一次用？** 默认 npm 安装会初始化 CLI-JAW，并尝试配置原生 Claude。其他 AI CLI 是可选项；在 macOS/Linux 上如需安装全部工具，可运行 `CLI_JAW_INSTALL_CLI_TOOLS=1 npm install -g cli-jaw`。Windows 请使用下方 WSL 安装路径。

<details>
<summary><b>macOS 一键安装</b> — 没有 Node.js？用这个</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/install.sh | bash
source "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null || true
bash "$(npm root -g)/cli-jaw/scripts/verify-fresh-install.sh"
```

</details>

<details>
<summary><b>Windows（WSL — Windows 子系统 Linux）</b> — 从零一键安装</summary>

```powershell
# 1. 安装 WSL（以管理员身份运行 PowerShell）
wsl --install
```

重启后打开 **Ubuntu**，然后：

```bash
# 2. 安装 CLI-JAW + 所有依赖
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/install-wsl.sh | bash
source ~/.bashrc
jaw dashboard
bash "$(npm root -g)/cli-jaw/scripts/verify-fresh-install.sh"
```

从 Windows PowerShell 进入 WSL 时，请通过 login shell 运行命令，以便加载 WSL profile PATH：

```powershell
wsl.exe -d Ubuntu -- bash -lc "jaw dashboard"
```

</details>

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up -d       # → http://localhost:3457
```

</details>

---

## CLI-JAW 是什么？

CLI-JAW 是一个开源平台，将你已经在用的 AI 编码 CLI — Claude、Codex、Gemini、Grok、OpenCode、Copilot — 统一成**一个助手、一份记忆、一个仪表盘**。

你的主 CLI（Boss）调度其他 CLI 作为"员工"。不用在各种应用之间来回切换，直接在一个地方下达指令。

- **无需 API 密钥** — 通过你已有的订阅路由
- **无按 token 计费** — 和你现在的月费一样
- **本地运行** — 代码不会离开你的机器

<div align="center">

![CLI-JAW Manager Dashboard](docs/screenshots/manager-dashboard-light.png)

</div>

---

## 认证

只需一个。选择你已经订阅的服务：

```bash
# 免费选项（无需信用卡）
copilot login        # GitHub Copilot（有免费层）
opencode             # OpenCode — 有免费模型

# 付费（你已经在付的月订阅）
claude auth login    # Anthropic Claude Max
codex login          # OpenAI ChatGPT Pro
gemini               # Google Gemini Advanced
grok login --oauth   # xAI Grok / Grok Heavy
```

一次性检查全部：`jaw doctor`

<details>
<summary>jaw doctor 输出示例</summary>

```
🦈 CLI-JAW Doctor — 12 checks

 ✅ Node.js        v22.15.0
 ✅ Claude CLI      installed
 ✅ Codex CLI       installed
 ⚠️ Gemini CLI      not found (optional)
 ✅ OpenCode CLI    installed
 ✅ Copilot CLI     installed
 ✅ Database        jaw.db OK
 ✅ Skills          32 active, 194 reference
 ✅ MCP（插件）      3 servers configured
 ✅ Memory          structured/ exists
 ✅ Server          port 3457 available
```

</details>

---

## 仪表盘

仪表盘是你的指挥中心——一个运行在 `http://localhost:3457` 的本地 Web 应用。

### 实例管理器

查看每个正在运行的 AI 实例——一键启动、停止、重启。在仪表盘中直接预览实时 Web UI。

<div align="center">

![Dashboard Navigator](docs/screenshots/dashboard-navigator.png)

</div>

### 看板

将实例卡片拖入泳道（Backlog → Ready → In Progress → Review → Done）。跟踪每个 AI 会话正在做什么。

<div align="center">

![看板](docs/screenshots/dashboard-kanban.png)

</div>

### 优先级矩阵

艾森豪威尔矩阵管理你的任务和提醒。优先处理重要的事。

<div align="center">

![优先级矩阵](docs/screenshots/priority-matrix.png)

</div>

### 笔记

仪表盘内的迷你 Obsidian。文件夹、可视化（WYSIWYG）+ 源码 + 分屏编辑、KaTeX（数学公式渲染）、Mermaid（图表即代码）、语法高亮代码块。

<div align="center">

![笔记编辑器](docs/screenshots/notes-wysiwyg.png)

</div>

### 代理状态

一目了然地监控每个 AI 引擎的健康状况和使用情况。

<div align="center">

![Claude 状态](docs/screenshots/claude-status-widget.png)

</div>

---

## 员工系统的工作原理

核心理念：**你的主 CLI 调用其他 CLI 作为工作者。**

你和一个 AI（Boss）对话。当它需要专业工作时，会向员工分派任务——每个员工运行自己的 CLI 和模型：

```
你："修复前端样式，并更新 API 端点"

Boss（Claude）思考中...
  ├── 分派到 Frontend 员工（OpenCode）→ "修复 dashboard.tsx 中的 CSS grid 布局"
  ├── 分派到 Backend 员工（Codex）     → "更新 /api/users 以返回分页元数据"
  └── 综合两方结果返回给你
```

```bash
# 底层就是一条命令：
jaw dispatch --agent "Frontend" --task "修复 dashboard.tsx 中的 CSS grid 布局"
```

员工是在你的设置中配置的其他 AI CLI。每个有自己的会话、模型和上下文。Boss 审核它们的输出后再呈现给你。

### 员工 vs 子代理

这是两个不同的东西：

| | 员工 | 子代理 |
|---|---|---|
| **是什么** | 配置为工作者的其他 AI CLI（Codex、OpenCode 等） | 单个 CLI 内置的并行任务工具 |
| **何时用** | 跨不同代码库或领域的多专家协作 | 内部研究、文件读取、并行分析 |
| **如何用** | `jaw dispatch --agent "Name" --task "..."` | 自动——CLI 在内部生成 |

员工用于"Frontend 做 CSS，Backend 做 API"。子代理用于"做决定前并行读取 5 个文件"。

---

## AI 运行时

无按 token 的 API 计费。通过你已有的订阅路由。

| CLI | 默认模型 | 认证 | 费用 |
|---|---|---|---|
| **Claude** | `opus-4-6` | `claude auth login` | Claude Max 订阅 |
| **Codex** | `gpt-5.5` | `codex login` | ChatGPT Pro 订阅 |
| **Codex App** | `gpt-5.4` | `codex login` | ChatGPT Pro 订阅 |
| **Gemini** | `gemini-3.1-pro-preview` | `gemini` | Gemini Advanced 订阅 |
| **Grok** | `grok-build` | `grok login --oauth` | Grok 订阅；配额仅限认证/状态 |
| **OpenCode** | `minimax-m2.7` | `opencode` | 有免费模型 |
| **Copilot** | `gpt-5-mini` | `copilot login` | 有免费层 |

**回退链**：当一个引擎被限速时，下一个自动接上。用 `/fallback [cli1 cli2...]` 配置。

**OpenCode 通配符**：连接任意模型端点——OpenRouter、本地 LLM（大语言模型）、任何 OpenAI 兼容 API。

> 切换引擎：`/cli codex`。切换模型：`/model gpt-5.5`。Web、终端、Telegram 或 Discord 均可。

---

## PABCD 编排（Plan → Audit → Build → Check → Done）

对于复杂任务，CLI-JAW 使用结构化的 5 阶段工作流。每次转换都需要你的批准——没有你的确认什么都不会发布。

```
P (Plan) → A (Audit) → B (Build) → C (Check) → D (Done) → IDLE
   ⛔          ⛔          ⛔         auto        auto
```

| 阶段 | 发生什么 |
|---|---|
| **P — Plan** | Boss AI 编写 diff 级别的计划。停下等你审查 |
| **A — Audit** | 只读工作者验证计划是否可行（imports 存在、签名匹配） |
| **B — Build** | Boss 实现。只读工作者验证结果 |
| **C — Check** | 类型检查（`tsc --noEmit`）、文档更新、一致性检查 |
| **D — Done** | 汇总所有变更。返回空闲状态 |

状态持久化在数据库中，服务器重启后仍然保留。工作者不能修改文件——只能验证。用 `jaw orchestrate`、`/orchestrate` 或 `/pabcd` 启动。

---

## 记忆

三个层次，各覆盖不同的回忆范围。

| 层 | 存储内容 | 工作方式 |
|---|---|---|
| **History Block** | 近期会话上下文 | 最近 10 个会话，最多 8000 字符，按工作目录限定范围。注入到提示开头 |
| **Memory Flush** | 从对话中提取的结构化知识 | 达到阈值后触发（默认 10 轮）。提取为事件记录、每日日志、语义笔记，保存为 markdown |
| **Soul + Task Snapshot** | 身份和语义检索 | 核心价值观、语调、边界。全文搜索索引每次提示返回最多 4 条语义相关结果 |

三层全部自动注入系统提示。记忆可搜索：

```bash
jaw memory search "我们是怎么设置 API 认证的？"
```

---

## 技能

230+ 技能覆盖开发工作流、办公文档、自动化和媒体。

| 分类 | 技能 | 覆盖范围 |
|---|---|---|
| **办公** | `pdf`, `docx`, `xlsx`, `pptx`, `hwp` | 读取、创建、编辑文档。HWP/HWPX（韩国文字处理器格式）原生支持 |
| **自动化** | `browser`, `vision-click`, `screen-capture`, `desktop-control` | Chrome DevTools Protocol（CDP）浏览器控制、AI 坐标点击、macOS 截屏、Computer Use |
| **媒体** | `video`, `imagegen`, `lecture-stt`, `tts` | Remotion 视频、OpenAI 图像生成、讲座转录、文字转语音 |
| **集成** | `github`, `notion`, `telegram-send`, `memory` | Issues/PRs/CI、Notion 页面、Telegram 媒体发送、持久记忆 |
| **可视化** | `diagram` | 在聊天中渲染 SVG 图表、图形、交互式可视化 |
| **开发指南** | `dev`, `dev-frontend`, `dev-backend`, `dev-data`, `dev-testing`, `dev-pabcd` | 注入代理提示的工程指南 |

参考技能位于 `skills_ref/`，按需安装到活跃运行时。

```bash
jaw skill install <name>    # 激活参考技能
jaw skill list              # 查看可用技能
```

---

## 浏览器和桌面自动化

| 功能 | 工作方式 |
|---|---|
| **Chrome DevTools Protocol** | 导航、点击、输入、截屏、执行 JS、滚动、按键——Chrome 的远程控制 |
| **Vision-click** | 截屏 → AI 提取目标坐标 → 点击。`jaw browser vision-click "Login button"` |
| **Computer Use** | 通过 Codex Computer Use 自动化桌面应用。用 Safari 访问 localhost，体验如同 Codex 应用 |
| **Web-AI 供应商** | `jaw browser web-ai --vendor chatgpt\|gemini\|grok`——会话生命周期、诊断、源码审计支持 |
| **Diagram 技能** | 生成 SVG 图表和交互式可视化，在聊天中内联渲染 |

Computer Use 让你用自然语言控制任何 macOS 应用——Finder、Safari、系统设置、Xcode。

---

## 消息

### Telegram

```
📱 Telegram ←→ 🦈 CLI-JAW ←→ 🤖 AI Engines
```

文字聊天、语音消息（通过多供应商 STT——语音转文字 自动转录）、文件/照片上传、斜杠命令（`/cli`、`/model`、`/status`）、定时任务（`every`/`cron`——循环计划）结果自动送达。

<details>
<summary>设置（3 步）</summary>

1. 给 [@BotFather](https://t.me/BotFather) 发消息 → `/newbot` → 复制 token
2. `jaw init --telegram-token YOUR_TOKEN` 或在 Web UI 设置中输入
3. 给 bot 发送任意消息。Chat ID 首次消息时自动保存

</details>

### Discord

与 Telegram 功能相同——文字、文件、命令。频道/线程路由、规范 `/api/channel/send`、代理结果广播转发器。通过 Web UI 设置配置。

### 语音 & STT

语音输入支持 Web（麦克风按钮）、Telegram（语音消息）和 Discord。供应商：OpenAI 兼容、Google Vertex AI 或任意自定义端点。

---

## MCP（Model Context Protocol）

[MCP](https://modelcontextprotocol.io) 是一个让 AI 工具共享能力的标准——就像 AI 代理的插件。CLI-JAW 用一个文件管理所有引擎的 MCP 配置。

```bash
jaw mcp install @anthropic/context7
# → 同步到 Claude、Codex、Gemini、OpenCode、Copilot 的配置文件
```

不用再分别编辑多个 JSON 文件。安装一次，每个 MCP 感知引擎都会获得配置。Grok CLI 是标准运行时，但在 Grok 暴露兼容配置面之前不计为 MCP 同步对象。

```bash
jaw mcp sync       # 手动编辑后重新同步
```

---

## CLI 命令

```bash
# 核心
jaw dashboard                     # 启动管理仪表盘
jaw serve                         # 启动服务器（http://localhost:3457）
jaw chat                          # 终端聊天 UI
jaw doctor                        # 12 项诊断

# 实例
jaw clone ~/project               # 克隆实例到新目录
jaw --home ~/project serve --port 3458  # 运行第二个实例
jaw service install               # 开机自启

# AI 和编排
jaw dispatch --agent "Backend" --task "..."  # 分派员工
jaw orchestrate                   # 进入/控制 PABCD 工作流

# 技能和 MCP
jaw skill install <name>          # 激活技能
jaw skill list                    # 列出可用技能
jaw mcp install <package>         # 安装 MCP → 同步支持的 MCP 感知引擎
jaw mcp sync                      # 重新同步 MCP 配置

# 记忆
jaw memory search <query>         # 跨所有记忆层搜索
jaw memory save <file> <content>  # 保存到结构化记忆

# 浏览器
jaw browser start                 # 启动 Chrome 自动化
jaw browser fetch "https://example.com" --json --trace  # 自适应 URL 读取
jaw browser snapshot              # 捕获页面状态
jaw browser vision-click "Login"  # AI 驱动的点击

# 维护
jaw reset                         # 完全重置
```

---

## 多实例

运行互相隔离的独立实例，各有独立的设置、记忆和数据库：

```bash
jaw clone ~/my-project
jaw --home ~/my-project serve --port 3458
```

每个实例完全独立——不同的工作目录、记忆、MCP 配置。管理仪表盘可以看到全部。

---

## 开发

```bash
npm run build          # tsc → dist/
npm run dev            # tsx server.ts（热重载）
npm test               # Node.js 原生测试运行器
npm run gate:all       # 发布/文档一致性门禁
```

架构详情：[ARCHITECTURE.md](docs/ARCHITECTURE.md) · 测试覆盖：[TESTS.md](TESTS.md) · 内部结构文档：[structure/](structure/)

---

## 对比

| | CLI-JAW 2.0 | Hermes Agent | Claude Code |
|---|---|---|---|
| **模型接入** | Claude、Codex、Codex App、Gemini、Grok、OpenCode 和 Copilot（通过厂商认证） | API 密钥（OpenRouter 200+、Nous Portal） | 仅 Anthropic |
| **费用模型** | 你已经在付的月订阅 | 按 token API 计费 | Anthropic 订阅 |
| **主 UI** | 管理仪表盘 + Web 应用 + Mac 应用 + 终端 UI | 仅终端 | CLI + IDE 插件 |
| **仪表盘** | 多实例管理器、看板、笔记工作区 | 无 | 无 |
| **消息** | Telegram（语音）+ Discord | Telegram/Discord/Slack/WhatsApp/Signal | 无 |
| **记忆** | 3 层（History/Flush/Soul）+ 全文搜索 | 自我改进循环 + Honcho | 文件型自动记忆 |
| **多代理** | 员工系统（分派其他 CLI）+ PABCD | 子代理生成 | Task 工具 |
| **浏览器自动化** | Chrome DevTools + vision-click + Computer Use | 有限 | 通过 MCP |
| **运行环境** | 本地 + Docker | 本地/Docker/SSH/Daytona/Modal | 本地 |
| **技能** | 230+ 内置 | 自动创建 + agentskills.io | 用户配置 |
| **多语言** | 英语、韩语、中文、日语 | 英语 | 英语 |

---

## 故障排查

| 问题 | 解决办法 |
|---|---|
| `cli-jaw: command not found` | 重新运行 `npm install -g cli-jaw`。macOS/Linux/WSL：检查 `~/.local/bin` 或 `npm prefix -g` + `/bin` 是否在 `$PATH` 中。从 Windows PowerShell 运行时，请通过 WSL login shell：`wsl.exe -d Ubuntu -- bash -lc "jaw dashboard"` |
| `Error: node version` | 升级到 Node.js 22+：`nvm install 22` |
| `NODE_MODULE_VERSION` mismatch | `npm run ensure:native`（自动重编译原生模块） |
| `EADDRINUSE: port 3457` | 另一个实例正在运行。使用 `--port 3458` 或先停止 |
| Telegram / Discord 认证失败 | 运行 `jaw doctor`，检查 token，重启 `jaw serve` |
| 浏览器命令失败 | 安装 Chrome/Chromium。先运行 `jaw browser start` |
| 员工分派挂起 | 确保员工 CLI 已认证（`jaw doctor`） |
| Computer Use 不工作 | 仅限 macOS。需要 Codex CLI。在系统设置中检查自动化权限 |

---

## 参与贡献

1. 从 `master` Fork 并创建分支
2. `npm run build && npm test`
3. 提交 PR

Bug 报告和功能建议：[Open an issue](https://github.com/lidge-jun/cli-jaw/issues)

---

<div align="center">

**[MIT License](LICENSE)** · 由受够了在 AI 应用间切换标签的开发者们打造。

</div>
