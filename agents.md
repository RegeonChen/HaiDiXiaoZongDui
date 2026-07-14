# 项目规范与约束

本文件是 Coding Agent 和团队成员共同使用的持久项目上下文。修改项目之前，必须先阅读 `INIT.md`、本文件以及 `PLAN.md` 中与当前任务相关的部分。本文件应保持简洁，并在项目级决策、当前状态或已知问题发生变化时及时更新。

## 项目目标

开发一款支持 Windows、macOS 和 Linux 的跨平台、本地优先桌面 RSS 阅读器"聚合拾遗"，提供 AI 辅助阅读和来源可追溯的专题简报。

## 架构

- 使用 Electron，并分离 Main 进程、preload 安全桥和 React Renderer。
- 操作系统能力、网络请求、SQLite 访问、文件操作和凭证存储必须位于 Renderer 之外。
- 只通过规模小、类型明确且经过参数验证的 IPC API 向 Renderer 提供本地能力。
- 共享领域类型和 IPC 协议独立于 UI 组件及具体服务实现，定义在 `shared/types.ts` 和 `shared/ipc.ts` 中。
- 项目按以下三个主要职责区域组织：
  - 界面：Electron 外壳、React 视图、交互状态、多语言和面向用户的错误提示。
  - 内容管线：Feed/OPML 解析、同步、正文提取、安全清洗以及 HTML/Markdown 转换。
  - 数据与智能：SQLite 持久化、LLM Provider、AI Agent、专题匹配、文章分组和简报生成。
- 内容管线必须保留原始来源，同时生成标准化文章信息、Cleaned HTML 和 Cleaned Markdown。
- AI 结果必须保存来源引用，使摘要、标签、翻译和专题简报均可追溯。
- 不同职责区域之间优先通过清晰的模块接口协作，避免直接引用对方的内部实现。

## 技术栈

- 运行时：Node.js LTS
- 桌面框架：Electron
- Renderer：React + TypeScript
- 本地数据库：SQLite
- AI 接入：用户可配置的 OpenAI-compatible Provider
- 团队协作：Git 和 GitHub
- 目标平台：Windows、macOS、Linux

包管理器、具体依赖版本、UI 组件库、测试框架和构建工具尚未最终确定。项目脚手架通过验收后，应在此记录正式选择。

- SQLite 驱动：**sql.js**（1.14.1，WASM 版本），无需 node-gyp / Visual Studio C++ 编译，跨平台兼容性好。数据库为内存态 + 磁盘持久化模式。

## 核心功能

- RSS、Atom、JSON Feed 和 OPML 解析
- 手动和定时 Feed 同步
- 文章列表、阅读视图、已读/未读、星标、搜索和筛选
- 正文提取、HTML 安全清洗、Cleaned HTML 和 Cleaned Markdown
- 可配置的 Summary Agent 和 Translation Agent
- 手动标签、标签筛选、Tag Agent 和标签管理
- 文章摘录、Markdown 笔记、单篇导出和多篇文摘导出
- 中文和英文界面
- 本地日志、日志导出和调试工具
- 专题创建、文章匹配、报道分组、时间线、来源比较和带来源引用的专题简报

## 编码约定

- 启用 TypeScript strict 模式。除非有明确记录的理由，否则不得引入 `any`。
- 代码标识符、文件名、API 名称、数据库字段和 Git Commit 标题使用英文。
- 面向用户的文字必须放入多语言资源中，不得直接硬编码在组件里。
- React 组件只负责界面呈现和交互；持久化、网络请求、解析和 AI 逻辑应放入服务层。
- 不得向 Renderer 提供不受限制的 Node.js、文件系统、Shell 或数据库访问能力。
- 每个 IPC 请求都必须在 Main 进程中验证，并返回结构化的成功或错误结果。
- Feed 内容和外部 HTML 均视为不可信输入，显示前必须进行安全清洗。
- 不得在源码或普通日志中写入 API Key、凭证、个人路径或文章内容。
- 初始数据库结构确定后，所有 Schema 变更都必须通过数据库迁移完成。
- 为 Feed/OPML 解析、内容清洗、数据库操作、AI 响应处理和专题分析编写有针对性的测试。
- 面向用户的流程必须处理加载、空数据、成功、部分失败和错误状态。
- 避免无关重构。每次修改应限制在 `PLAN.md` 指定的任务和模块范围内。
- 不得静默修改共享类型或 IPC 协议。修改前应进行协调，同时更新所有调用方和相关文档。

## 团队与 Git 约定

- 张晨阳负责 Electron 和界面模块。
- 张宇凡负责 Feed、OPML、同步和内容清洗模块。
- 陈冠中负责数据库、AI Agent 和专题分析模块。
- 共享类型、IPC 协议和集成代码由三人共同负责。
- 每名成员必须使用自己的 Git 身份提交代码，以便清楚展示个人贡献。
- 未经团队同意，不得重写、压缩或将其他成员的 Commit 归到自己名下。
- 每个 Commit 只处理一个明确目的，避免无必要地混合格式化、重构和功能开发。
- 向其他成员交接工作前，应说明修改范围、已完成的验证和遗留问题。
- 涉及多个模块的修改应通过约定接口完成，不得在未沟通的情况下修改其他成员模块的内部实现。

## Agent 工作规则

- 修改代码前，先阅读 `INIT.md`、`AGENTS.md` 以及 `PLAN.md` 中当前执行的任务。
- 先确认仓库的真实状态，不得假设文件或依赖已经存在。
- 遵守 `PLAN.md` 中规定的负责人和影响模块边界。
- 当某项选择会改变产品范围、共享协议、安全性、存储数据或跨平台行为时，必须交由团队确认。
- 如果实现选择只影响已确认任务的内部细节，且不会改变共享行为，Agent 可以作出合理决定并继续执行。
- 报告任务完成前，必须运行当前环境中最相关的检查。
- 未证明任务的 `Verification` 验收条件之前，不得将任务或阶段标记为完成。
- 当修改对项目产生实质影响时，更新“当前状态”“近期记录”和“已知问题”。
- 将有价值的 Coding Agent 决策保存在项目文档和 Git 历史中，但不要记录普通对话和无关过程细节。

## 当前状态

截至 2026-07-14：

- `INIT.md` 已定义产品范围、功能要求、技术方向和约束。
- `PLAN.md` 已定义五个开发阶段和张晨阳/张宇凡/陈冠中的职责分工。
- `shared/types.ts` 和 `shared/ipc.ts` 已建立（Task 1.2 完成），定义了核心领域类型和 IPC 通道协议。
- **Task 1.1（Application Scaffold）已完成**：Electron 31 + electron-vite + React 18 + TypeScript strict，main/preload/renderer 三段式构建。
- **Task 2.3（Local Database）进行中**：
  - **2.3.1 完成**：SQLite 驱动选型 `sql.js`（WASM 版本，无需 node-gyp 原生编译），已安装 `sql.js` + `@types/sql.js`。
  - **2.3.2 完成**：`electron/main/db/connection.ts` — 单例连接管理，数据库文件 `{userData}/juhe-shivi.db`，启动时自动加载/创建，每次写操作后存盘，will-quit 时优雅关闭，WAL 模式 + foreign_keys ON。
  - **2.3.3 完成**：`electron/main/db/migration.ts` — 版本化迁移机制（db_version 表驱动），v1 定义 feeds 表（url 索引）、articles 表（guid UNIQUE 索引保证去重 + feed/published 复合索引 + is_read/is_starred 索引），已接入主进程 `initDatabase()` 之后自动执行。
  - **2.3.4 完成**：`electron/main/db/feed-repository.ts` — FeedRepository，实现 list/getById/create/update/delete/recordSync/findByUrl，url 去重忽略末尾 / 和 www. 前缀，幂等创建。
  - **2.3.5 完成**：`electron/main/db/article-repository.ts` — ArticleRepository，实现 list（分页+筛选）、getById、insertBatch（INSERT OR IGNORE 走 guid 唯一索引导入去重）、markRead/markStarred/batchMarkRead、getExistingGuidsForFeed。
  - **2.3.6 完成**：同步状态记录已内置在 `FeedRepository.recordSync()`（更新 feeds 表的 lastSyncAt/lastSyncSuccess/lastSyncError），通过 `sync:feed` IPC 通道即可调用。
  - **2.3.7 完成**：IPC handler 全部注册 — feed:*（5 个通道）、article:*（5 个通道）、sync:*（3 个占位通道，`sync:feed` 已对接 recordSync）、settings:*（2 个通道）。preload 升级为类型安全的 `invoke<>` 封装，暴露 `window.api.feed./article./sync./settings.` 方法。
  - **2.3.8 完成**：`scripts/smoke-2.3.cjs` 验证脚本，通过 `npm run smoke:db` 运行。验证项：createFeed / listFeeds / dupFeed (幂等) / getFeed / listArticlesEmpty / settings / updateFeed / deleteFeed — 全部 8 项通过。
- **Task 2.3（Local Database）已完成。**
- 当前活动里程碑：Phase 2 - Core Reading Workflow（Task 2.1 / 2.2 / 2.3 并行开发中）。

## 设计决策

- 已确定使用 Electron + React + TypeScript 开发跨平台应用。
- 已确定使用 SQLite 作为本地持久化层。
- 应用采用本地优先设计，不要求自有账号或自有云服务。
- AI Provider 由用户配置，并通过统一的 Provider 接口访问。
- 只有在用户启用相关 AI 功能时，才可以将文章内容发送给用户配置的模型服务。
- 外部文章内容必须经过正文提取和安全清洗后才能显示。
- Renderer 不得获得不受限制的 Node.js 访问能力。
- 专题追踪和带来源引用的多源简报是项目的核心差异化功能。
- AI 结论必须保留支持该结论的原始文章引用。
- 开发过程按照 `PLAN.md` 中的阶段和验收节点进行。
- 共享领域类型和 IPC 协议的权威定义位于 `shared/types.ts` 和 `shared/ipc.ts`。`agents.md` 仅做引用，不重复类型细节。跨模块接口变更时，必须同步更新 `shared/` 下的对应文件并通知其他成员。

## 近期记录

- 团队确定了三条并行职责线：界面、内容管线、数据与 AI 分析。
- Phase 1.1 可以在 Phase 1.2 完成前开始，但第一版共享协议通过确认前不得进入 Phase 2。
- `PLAN.md` 中的成员姓名已替换为张晨阳、张宇凡、陈冠中。
- **2026-07-13**：Task 1.2 完成。`shared/types.ts` 定义了 Feed、Article、Tag、Note、Digest、Topic、AIProvider、AISummary、AITranslation、AITagSuggestion、SyncResult、AppSettings、LogEntry 等核心领域类型以及默认设置常量。`shared/ipc.ts` 定义了统一的 `IpcResult<T>` 响应格式、40+ 个 IPC 通道常量（按 domain:action 命名）以及完整的请求/响应类型映射 `IpcRequestMap`。三个模块可以基于同一组类型和通道协议独立开发。
- **2026-07-13**：为 `shared/types.ts` 关键字段补充了格式规范注释，涵盖 cleanedMarkdown（GFM 规范、代码块语言标注、表格对齐、列表缩进等）、cleanedHtml（白名单标签/属性、安全清洗要求）、rawHtml（不可信输入警告）、guid（生成与去重策略）、Briefing.content（结论序号、来源引用、表格对比格式）、Note.markdownContent（导出格式）、LogEntry.level/module/detail（日志级别定义、模块命名、脱敏要求）、AppSettings 的 Prompt 模板（占位符变量列表）、Feed.url/FeedCreateInput.url（URL 去重规则）、IsoTimestamp（UTC 格式）、Tag.color（CSS 颜色）、Topic.keywords（小写匹配）、AIProvider.baseUrl（API 拼接约定）等。
- **2026-07-14**：Task 1.1 完成（Application Scaffold）。技术选型落地：
  - 构建工具 **electron-vite**（main / preload / renderer 三段式，HMR 开箱即用）
  - 包管理器 **npm**（已确认 PowerShell 执行策略限制下 `npm.cmd` 可用）
  - 渲染层 **React 18 + TypeScript strict**（分 `tsconfig.node.json` 与 `tsconfig.web.json` 两份）
  - 进程安全：`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`
  - **preload 强制 CJS 输出**（`out/preload/index.cjs`）—— Electron sandbox 上下文不支持 ESM preload
  - IPC 风格：Main handler 直接返回 `IpcResult<T>`，preload 透传 `IpcResponse<C>`，Renderer 端通过 `window.api.*` 访问
  - 提供 `scripts/smoke-1.1.cjs` 无头烟雾测试：起 Electron、加载 production 产物、注入 JS 探测 `require/process/module/Buffer` 是否泄漏、走一次 `settings.get` IPC 校验主进程 handler，headless 环境也能验收
  - 修了 `shared/ipc.ts` 的一个 dead import（`TagSuggestion`），**未改动任何类型或通道定义**
- **2026-07-14**：Task 2.3.2-2.3.5 完成（数据库 Schema + Repository 层）：
  - Schema v1：`feeds`（url 索引）、`articles`（guid UNIQUE 索引 + feed/published 复合索引 + is_read/is_starred 索引），`db_version` 版本化迁移
  - FeedRepository：幂等 create（url 去重忽略末尾 / 和 www.），完整 CRUD + recordSync
  - ArticleRepository：分页查询 + 筛选（feedId/isRead/isStarred/search）+ insertBatch（INSERT OR IGNORE 基于 guid 唯一索引去重）+ 已读/星标读写
  - 设计决策：`better-sqlite3` 因需要 Visual Studio C++ 编译且环境探测失败而放弃，改为 `sql.js`（WASM），纯 JavaScript 跨平台零编译
  - 数据库持久化模式：内存态操作 + 每次写后 `.export()` 到磁盘，`will-quit` 时最后存盘
- **2026-07-14**：Task 2.3.6-2.3.8 完成（IPC handler + 验证）：
  - 注册了 15 个 IPC handler：feed CRUD（5 个）、article 查询+状态（5 个）、sync 占位（3 个）、settings（2 个）
  - 所有 handler 统一 `ok<T>()` / `fail()` 返回 `IpcResult<T>`，含入参校验
  - preload 从手动枚举升级为 `invoke<C>(channel, args)` / `invokeVoid<C>(channel)` 泛型封装
  - `npm run smoke:db` 无头烟雾测试全 8 项通过（创建/列表/去重/获取/更新/删除/文章/设置）
- 具体实现选择应在项目脚手架和共享协议建立后再补充记录。

## 路线图

1. Phase 1：创建应用脚手架并确定共享协议。
2. Phase 2：完成订阅、同步、持久化和阅读的核心流程。
3. Phase 3：完成课程要求的 AI、笔记、标签、多语言、日志和导出功能。
4. Phase 4：在专题追踪流程中集成三个职责区域。
5. Phase 5：在 Windows、macOS 和 Linux 上进行验证并准备课程交付。

详细任务和验收标准位于 `PLAN.md`，本文件不重复记录任务级进度。

## 已知问题

- UI 组件库、单元/E2E 测试框架、CI 流水线、跨平台打包工具（electron-builder / electron-forge）尚未确定。
- Feed 解析、Readability、HTML 安全清洗和 Markdown 转换使用的具体依赖尚未确定。
- 不同 OpenAI-compatible Provider 在 Endpoint、流式响应和用量信息方面可能存在差异，需要进行兼容性测试。
- 专题匹配和相似报道分组的实现方案尚未确定。
- 尚未进行跨平台行为测试。
- 尚未选定一组固定且具有代表性的 Feed、HTML、OPML 和 AI 测试样本。
- electron-builder / electron-forge 等打包方案未引入；`npm run build` 当前只产出 unpacked 三段产物，不含可分发的安装包（Phase 5 验收前需补齐）。
