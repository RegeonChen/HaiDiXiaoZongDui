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
- 包管理器：npm
- 桌面框架：Electron
- Renderer：React + TypeScript
- 自动化测试：Vitest
- 本地数据库：SQLite
- AI 接入：用户可配置的 OpenAI-compatible Provider
- 团队协作：Git 和 GitHub
- 目标平台：Windows、macOS、Linux

UI 组件库和尚未进入当前阶段的功能依赖继续按任务确认；已确定的依赖和版本记录在 `package.json` 与锁文件中。

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

截至 2026-07-15：

- `INIT.md` 已定义产品范围、功能要求、技术方向和约束。
- `PLAN.md` 已定义五个开发阶段和张晨阳/张宇凡/陈冠中的职责分工。
- `shared/types.ts` 和 `shared/ipc.ts` 已建立（Task 1.2 完成），定义了核心领域类型和 IPC 通道协议。
- **Task 1.1（Application Scaffold）已完成**：Electron 31 + electron-vite + React 18 + TypeScript strict，main/preload/renderer 三段式构建，预加载脚本强制 CJS（sandbox 兼容），安全基线 `contextIsolation + sandbox + nodeIntegration: false` 已通过无头烟雾测试验证（`npm run smoke`）。
- **Task 2.2（Feed, OPML and Cleaning Pipeline）已完成并接入数据库**：支持 RSS/Atom/JSON Feed、受限 HTTP 抓取、按需正文提取与安全清洗、GFM Markdown、手动同步编排、OPML 导入导出；同步、正文和 OPML IPC 已注册。
- **Task 2.3（Local Database）已完成**：
  - **2.3.1 完成**：SQLite 驱动选型 `sql.js`（WASM 版本，无需 node-gyp 原生编译），已安装 `sql.js` + `@types/sql.js`。
  - **2.3.2 完成**：`electron/main/db/connection.ts` — 单例连接管理，数据库文件 `{userData}/juhe-shivi.db`，启动时自动加载/创建，每次写操作后存盘，will-quit 时优雅关闭，foreign_keys ON。
  - **2.3.3 完成**：`electron/main/db/migration.ts` — 版本化、事务化迁移机制；v1 建立 feeds/articles，v2 增加按需正文缓存字段，并将文章唯一键调整为 `(feed_id, guid)`。
  - **2.3.4 完成**：`electron/main/db/feed-repository.ts` — FeedRepository，实现 list/getById/create/update/delete/recordSync/findByUrl，url 去重忽略末尾 / 和 www. 前缀，幂等创建。
  - **2.3.5 完成**：`electron/main/db/article-repository.ts` — ArticleRepository，实现 list（分页+筛选）、getById、insertBatch（按 Feed + guid 去重并准确返回新增数）、markRead/markStarred/batchMarkRead、getExistingGuidsForFeed。
  - **2.3.6 完成**：`SqliteContentPipelineStore` 实现 Feed 同步、按需正文和 OPML 三个存储接口，并保存同步成功/失败状态。
  - **2.3.7 完成**：feed/article/settings 及真实 sync/content/opml IPC 均已注册；preload 通过类型安全封装暴露对应 API。
  - **2.3.8 完成**：`scripts/smoke-2.3.cjs` 验证脚本，通过 `npm run smoke:db` 运行。使用隔离的临时 userData，验证 createFeed / listFeeds / dupFeed（幂等）/ getFeed / listArticlesEmpty / settings / updateFeed / deleteFeed，并通过二次启动确认数据持久化。
- **Task 2.1（Electron UI and Reader Shell）已完成**（张晨阳）：三栏 layout（订阅源侧栏 / 文章列表 / 阅读区）、主题切换、文章选择、已读/星标交互、同步按钮及 Loading/Empty/Error 状态已实现；`npm run smoke:ui` 7 项通过。当前仍通过 `MockDataSource` 展示演示数据。
- **Phase 2 集成完成**：
  - **P0**（UI 切真 IPC）完成：写 `IpcDataSource` + `createDataSource` 工厂（URL `?mock=1` 选 mock），`ArticleReader` 按需调 `getCleanedHtml`。新增 `scripts/smoke-2.4-ui-ipc.cjs`。
  - **P1**（添加订阅源 UI）完成：header 加 `+ 添加订阅源` 按钮 + `AddFeedDialog` 组件，调 `feed.create` + `sync.feed`，成功后自动刷新侧栏 + 切到新 feed。
  - **P2**（OPML UI）完成：header 加 `↓ 导入 OPML` / `↑ 导出 OPML` 按钮（`OpmlButtons` 组件），调 `window.api.opml.import / export`，结果用底部 `Toast` 提示。
  - 5/5 smoke 全过：`smoke` (1.1) / `smoke:ui` (2.1 mock) / `smoke:db` (2.3) / `smoke:phase2` (后端 9/9) / `smoke:ui-ipc` (UI + P1/P2 9/9)。
  - FeedList 侧栏展示已改为 `f.siteTitle || f.title`，同步后自动显示站点名称。
  - 同步完成后增加 `refreshFeeds()` 调用，确保 siteTitle 更新即时反映。
  - `FeedRepository.create()` 在 title 为空时用 URL hostname 兜底。
- **Phase 2.5.1 三个 UI 子任务 + Mercury 风格重塑已完成**（张晨阳）：
  - **a) 删除订阅源**：右栏订阅源右键弹 `ContextMenu`（删除 / 复制 URL），删除走 `ConfirmDialog`（forwardRef + Promise）+ `window.api.feed.delete` + `juhe:refresh` 事件。
  - **b) OPML 导入自动同步**：导入成功后 `handleOpmlImport` 对 `lastSyncAt === null || !lastSyncSuccess` 的 feed 调 `syncFeed`，避免重复同步已成功的源。
  - **c) 三栏拖拽 resize**：`ResizeHandle`（4px 宽，hover 变 2px accent，mousedown 锁 body cursor），`usePaneWidths` hook 持久化到 localStorage（先本地，后续 2.5.3 切到 settings 字段）。
  - **Mercury（antirez.com）风格重塑**：顶栏 height 44px（紧凑），左栏 tab 切换（订阅源 / 标签占位），左栏底部状态栏（X 源 / X 篇文章 / X 未读），文章列表 4 列网格（dot / title / feed / time），阅读区 serif 标题 + 顶部 URL monospace + 底部摘要折叠。`<html data-theme="light|dark">` + CSS 变量，localStorage 持久化。
  - 新增组件：`ConfirmDialog`（forwardRef + useImperativeHandle + Promise open）、`ContextMenu`（单例 externalShow）、`ResizeHandle`（CSS 变量驱动）、`usePaneWidths`。
  - **6/6 smoke 全过**：`smoke` (1.1) / `smoke:ui` (2.1 mock) / `smoke:db` (2.3) / `smoke:phase2` (后端 9/9) / `smoke:ui-ipc` (UI + P1/P2 + 2.5.1) / `smoke:phase2.5` (新增，2.5.1 端到端 14 项基础 + 4 项子任务)。
  - smoke 探针 fixed sleep → waitFor 轮询；React 端加 `juhe:refresh` 事件，smoke 探针 dispatch 触发 feeds/articles 重拉；探针匹配 `siteTitle || title` 兼容 sync 后的渲染。
- 当前活动里程碑：**Phase 3.4.1 + 3.4.4（7 项 UI 端工作）已完成并通过 8/8 smoke 验证**。Phase 4 Topic Tracking 待张晨阳/张宇凡/陈冠中协同开发。
- **Phase 3.4 Bug Fix & UX Polish**（张晨阳）已完成：
  - **3.4.1.1 未读列表不同步**：`App.handleSelectArticle` 标记已读时同步更新 `articlesState` + `allArticlesState`，列表实时移除该文章。
  - **3.4.1.2 未读/星标计数不更新**：`handleToggleStar` 用同一个 `updateList` 闭包同步刷两个 state；`FeedList` 侧栏底部状态栏始终从 `allArticles` 计算 unread/starred 计数。
  - **3.4.1.3 AI 结果区文章切换不消失**：`ArticleReader` 切换 `article.id` 时无条件 reset `summary/translationParagraphs/tagSuggestions/activePanel/noteMarkdown`，即使 `article.cleanedHtml` 已存在也要先清空（之前有 bug：`if (cleanedHtml) return;` 提前 return 跳过了 AI 字段 reset）。
  - **3.4.1.4/.5 翻译/摘要结果不渲染 Markdown**：自写 `src/utils/markdown.ts`（不引 marked），`renderMarkdown(input)` = escape HTML → INLINE_RULES（链接/行内代码/加粗/斜体，URL scheme 仅允许 http/https/mailto/#/）→ 双换行分段 → 单换行 `<br>`；`ArticleReader` 用 `dangerouslySetInnerHTML={{ __html: renderMarkdown(s) }}` 替换纯文本 `<div>`。
  - **3.4.1.6 删除订阅源提示数量始终为 0**：`handleDeleteFeed` 改用 `allArticles.filter(a => a.feedId === feed.id).length` 统计（之前用 `articles`，受当前筛选影响）。
  - **3.4.4.1 6 page 返回按钮 + 当前页标题**：`Layout.tsx` 在 `.app-page` 容器顶部加 `.app-page__header`（back 按钮 + 当前 page title），通过 `navItems.find(n => n.id === currentPage)?.label` 取标题。
  - **3.4.4.2 纸质 + 深色统一**：`useAppearance` 改为接收 `effectiveTheme: 'light' | 'dark'` 参数（从 `useTheme` 取 `effective`）；`applyToHtml` 只在 `visualTheme === 'paper' && effectiveTheme === 'light'` 时写暖黄变量；深色 + paper 时清掉所有 paper 变量 → 走 useTheme dark 调色板，与经典深色完全一致。
  - **3.4.4.3 顶栏搜索框**：`src/components/SearchBar/SearchBar.tsx` 300ms 防抖 + 下拉浮层 + 8 条上限 + 失焦/Esc 关闭 + 点击结果跳到 reader（`selectFeed(target.feedId) → selectArticle(id) → setCurrentPage('reader')`）；`IpcDataSource.articles({ search })` 透传（陈冠中 3.4.3 已实现）。
  - **3.4.4.4 通用设置弹窗 + AI 设置子页面**：
    - 新组件 `src/components/GeneralSettingsModal/`（语言/字体/视觉/字号/阅读宽度 + 即时生效 + IPC 持久化）
    - `SettingsPage` 拆为 AI only（Provider + AI 默认值）
    - Layout nav 7 项：`general`(弹窗) / `ai`(子页) / tags / notes / digests / topics / logs；App.tsx 拦截 'general' → `setGeneralModalOpen(true) + setCurrentPage('reader')`
  - **3.4.4.5 ArticleList 空态**：`filterHint` prop 三态（`'暂无星标文章'` / `'所有文章都已读完'` / `'暂无匹配文章'`），用 `EmptyView` 组件统一渲染。
  - **smoke-3.4-integration 探针适配**：nav 7 项后索引全部 +1（general 走弹窗不占索引，ai=1, tags=2, ..., logs=6）；字体/视觉主题入口从 `.settings-page__font-card` 改为 `.general-modal__font-card`（点 navBtn[0] general 触发弹窗再验证），测试完后点 backdrop 关闭弹窗。
  - **8/8 smoke 全过**：smoke / smoke:ui / smoke:db / smoke:phase2 / smoke:ui-ipc / smoke:phase2.5 / smoke:task33 / smoke:integration。integration 探针：navBtnCount=7、fontThemeCount=3、visualThemeCount=2、fontBefore→hei、visualBefore→paper、6 page 全部 rendered、tag/note CRUD、回到 reader 5 AI 按钮（实际 7：含星标/原文）。
- **Phase 3 Integration（张晨阳）**：
  - **6 个 pages**（`src/pages/`）：SettingsPage（Provider CRUD + 字体/视觉主题 + 多语言 + AI 默认值 + 字号/阅读宽度）、TagsPage（标签 CRUD）、NotesPage（按文章选 + markdown 笔记 CRUD）、DigestsPage（文摘 CRUD + Markdown/HTML 导出）、TopicsPage（Phase 4 占位，stub handler 返回 NOT_IMPLEMENTED）、LogsPage（同占位）。
  - **顶栏 6 入口**（Layout 顶栏新增 nav 按钮组）：⚙ 设置 / # 标签 / ✎ 笔记 / ☷ 文摘 / ★ 专题 / 📋 日志；点击切换 `currentPage` state；非 reader 模式渲染对应 page slot，reader 模式保持三栏 layout。
  - **IpcDataSource 扩展**（`src/data/ipcDataSource.ts`）：新增 tag/note/digest/topic/aiProvider/aiOperations/settings/log/opml/getCleanedMarkdown 全量 IPC 包装；`MockDataSource` 同步补全（mock 模式所有方法可调，AI 不可用时返回明确错误）。
  - **useAppearance hook**（`src/hooks/useAppearance.ts`）：从 IPC 读 fontTheme/visualTheme/language，写 `<html data-font-theme data-visual-theme data-lang>` 属性和 CSS 变量（`--font-body` 字体栈 / 经典 vs 纸质的 `--bg` `--fg` 等）；切换通过 `settings:update` 持久化。
  - **ArticleReader AI 工具栏**（`src/components/ArticleReader/ArticleReader.tsx`）：5 按钮 + 折叠结果区
    - ✨ 摘要：`aiGenerateSummary` → `aiGetSummary`（带缓存）
    - 🌐 翻译：`aiGenerateTranslation` → `aiGetTranslation`（双语对照）
    - 🏷 标签建议：`aiSuggestTags` → `aiGetTagSuggestions`（含置信度 + 理由）
    - ✎ 笔记：textarea → `noteCreate`（GFM markdown）
    - ★ 专题：`topicCreate`（Phase 4 stub，会显示 NOT_IMPLEMENTED）
  - **Topic/Log 主进程 handler 占位 stub**（`electron/main/index.ts`）：12 个 topic + 2 个 log handler 全部注册并返回 `NOT_IMPLEMENTED`，等 Phase 4 陈冠中接入。
  - **smoke-3.4-integration 端到端探针**（`scripts/smoke-3.4-integration.cjs` + `electron/main/index.ts` probe）：21 项校验（6 nav / 6 page 渲染 / 3 字体 + 2 视觉主题 / 字体视觉切换 verified / 标签 CRUD verified / 笔记创建 verified / 6 占位 / 5 AI 按钮 / 回到 reader 验证）。
  - **8/8 smoke 全过**：smoke / smoke:ui / smoke:db / smoke:phase2 / smoke:ui-ipc / smoke:phase2.5 / smoke:task33 / smoke:integration。
  - 修过 `scripts/smoke-2.1.cjs` 的 paneWidths 容差从 2px 调到 10px（fr 单位 1px 舍入 + 两个 4px ResizeHandle 是固有行为）。

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
- **2026-07-14**：Phase 2 Integration 完成验收：
  - 补齐 DataSource 接口的 `createFeed` 方法（IpcDataSource + MockDataSource 双实现）
  - 在 FeedList 顶部添加「新增订阅源」输入框（URL 输入 + 提交按钮）
  - `node scripts/smoke-phase2.cjs` 9/9 通过（后端全链路）
  - `node scripts/smoke-2.4-ui-ipc.cjs` 6/6 通过（UI 端到端 IPC：ipcSeed/listHasData/clickWorks/contentLoaded）
  - Phase 2 "添加订阅源 → 同步 → 阅读 → 已读/星标" 完整闭环可演示

- **2026-07-14**：修复侧栏空白名称 bug（Issue: 添加订阅源后侧栏不立即显示名称，需重启才出现）：
  - 根因1：`FeedRepository.create()` 在用户未填 title 时将 `title` 设为空字符串
  - 根因2：`App.handleSync()` 同步完成后只刷新 articles 不刷新 feeds，导致 sync 写入的 siteTitle 未反映到侧栏
  - 修复1：`FeedRepository.create()` 在 title 为空时用 URL hostname 兜底（如 sspai.com/feed → 显示 "sspai.com"）
  - 修复2：`App.handleSync()` 同步完成后增加 `refreshFeeds()` 调用，自动更新侧栏 siteTitle
  - `npm run build` + `node scripts/test-real-feed.cjs https://sspai.com/feed` 7/7 通过
- **2026-07-14**：Task 2.2 首版实现位于 `feat/task-2.2-feed-pipeline`：
  - 使用 `rss-parser` 统一 RSS/Atom，原生校验 JSON Feed 1/1.1；
  - 使用 `@mozilla/readability` + `jsdom` 提取正文，`sanitize-html` 白名单清洗，`turndown` + GFM 插件转换 Markdown；
  - HTTP 抓取具备协议校验、超时、有限重试、HTTP 状态和响应大小限制；
  - Feed 同步只保存条目和 Feed 自带内容；Reader/AI 首次请求正文时才抓取文章页并运行 Readability，之后复用持久化的 source HTML、cleaned HTML 和 Markdown；
  - 提供 `SyncService`、`ArticleContentService`、OPML 解析/去重/原子导出，以及与数据库解耦的 `FeedSyncStore`、`ArticleContentStore`、`OpmlFeedStore`；
  - 引入 Vitest 测试，离线测试覆盖三种 Feed、清洗、同步、HTTP 和 OPML；另提供 NASA RSS、Mozilla Atom 和 JSON Feed 官方源的网络兼容性验证。
- **2026-07-14**：Task 2.2 与 Task 2.3 完成集成：
  - 新增 Schema v2，分层保存 Feed 原文、文章页原文、Cleaned HTML/Markdown 和清洗元数据；
  - 文章去重从全局 guid 调整为 `(feed_id, guid)`，修复批量插入新增数量统计；
  - `SqliteContentPipelineStore` 接通同步、按需正文和 OPML，主进程用真实服务替换 sync 占位 handler，preload 增加 content/opml API；
  - `npm run smoke:phase2` 以本地 HTTP fixture 验证后端闭环：添加 Feed、两次同步去重、同步失败状态、SQLite 落盘、按需抓取且缓存复用、已读/星标和 OPML 往返；该脚本不覆盖 Renderer UI。
- **2026-07-14 ~ 2026-07-15**：Phase 2 集成收尾（张晨阳）：
  - UI 切真 IPC：`IpcDataSource` + `createDataSource` 工厂（URL `?mock=1` 选 mock），`ArticleReader` 按需 `getCleanedHtml`
  - P1 添加订阅源 UI：header `+ 添加订阅源` 按钮 + `AddFeedDialog`
  - P2 OPML UI：header `↓/↑ OPML` 按钮 + `OpmlButtons` + `Toast`
  - 修 P1 反馈的三个收尾问题：
    1. 同步按钮无论成败都报"同步完成"——加 `okCount/failCount` 跟踪，三态 toast（全部成功/全部失败/部分失败）
    2. 添加订阅绕过了 DataSource——`handleAddFeed` 改用 `ds.createFeed(...) + ds.syncFeed(...)`，与 mock 模式同链路
    3. 仓库卫生：删除 `dev.err`，`.gitignore` 加 `*.err / dev.err / dev.log / *.out`；README/agents.md 同步
  - 修 Electron 31 在 Windows 上的三个运行时 bug（影响 smoke 正确性）：
    1. `app.setPath('userData', ...)` 在 `app.whenReady()` 之前调用在 Windows 上不生效——移到 whenReady 内部
    2. `process.env` 在 `whenReady` 之后会被清——所有 smoke env 在 ready 前 snapshot 到 `SMOKE_FLAGS` 常量
    3. Renderer 端 React mount 时 useEffect 跑过一次后，再 seed 数据 React 不知道——加 `window.addEventListener('juhe:refresh', ...)` 事件，smoke 探针 seed 后 dispatch
  - smoke 探针从 fixed `await sleep(...)` 改为 `waitFor(() => cond)` 轮询，时序从 6s+ 超时变成 ~200ms
- 5/5 smoke 全过：`smoke` (1.1) / `smoke:ui` (2.1 mock) / `smoke:db` (2.3) / `smoke:phase2` (后端 9/9) / `smoke:ui-ipc` (UI + P1/P2 9/9)。
- **2026-07-15**：Phase 2.5.1 三个子任务 + Mercury 风格重塑（张晨阳）：
  - 删除订阅源：ContextMenu 右键菜单（删除 / 复制 URL）+ ConfirmDialog forwardRef Promise 化 + IPC feed.delete + juhe:refresh 触发 React 重拉
  - OPML 导入自动同步：handleOpmlImport 过滤 `lastSyncAt === null || !lastSyncSuccess` 的 feed 调 syncFeed，UI 显示底部 Toast
  - 三栏拖拽：ResizeHandle（4px→2px hover）+ usePaneWidths hook 持久化到 localStorage
  - Mercury（antirez.com）视觉重塑：顶栏 44px 紧凑、左栏 tab 切换 + 底部状态栏、文章列表 4 列网格、阅读区 serif 标题 + monospace URL + 摘要折叠、`<html data-theme>` + CSS 变量双主题
  - 修探针：feedListRendered 匹配 `siteTitle || title`（兼容 sync 后的渲染）；smoke-2.5.cjs OK 判定对齐到 `uiIpc.ok:true`
  - **6/6 smoke 全过**（timing：seed ~90ms, feedListRendered 0~1ms, articleListRendered ~55ms, contentRendered ~170ms）
  - 新增 `scripts/smoke-2.5.cjs` + `npm run smoke:phase2.5` script
- **2026-07-15**：Phase 3 Integration UI 端到端（张晨阳）：
  - 6 个 pages 全建好（SettingsPage/TagsPage/NotesPage/DigestsPage/TopicsPage/LogsPage），每个都自带 loading/empty/error 三态
  - 顶栏 6 个 nav 按钮（⚙/#/✎/☷/★/📋）切换 `currentPage` state，App.tsx 加 router 逻辑
  - IpcDataSource 扩展 30+ 方法：tag/note/digest/topic/ai/settings/log/opml/content/getCleanedMarkdown
  - useAppearance hook：fontTheme/visualTheme/language 切换 → 写 `<html>` 属性 + CSS 变量 → settings:update 持久化
  - ArticleReader 加 5 个 AI 按钮（摘要/翻译/标签建议/笔记/专题）+ 折叠结果区
  - Topic/Log 主进程 handler 全注册 stub 返回 `NOT_IMPLEMENTED`，等陈冠中 Phase 4 接入
  - 写 `scripts/smoke-3.4-integration.cjs`（21 项校验）+ `npm run smoke:integration` script
  - 修 `smoke-2.1` paneWidths 容差 2→10（fr 1px 舍入 + 8px handle 是固有行为）
  - 修探针：`feedListRendered` 改读 dbFeedDump 取 siteTitle；`fontToggled/visualToggled` 改读 `<html data-*>`；tag/笔记创建验证走 IPC 直接检查 DB（绕开 React re-render 时序）
  - 探针发现 preload 包装陷阱：preload `tag.create(input)` 内部已包 `{ input }`，探针传 `{ input: {...} }` 会多包一层。统一为 `tag.create({ name: 'X' })` 风格
  - **8/8 smoke 全过**（smoke / smoke:ui / smoke:db / smoke:phase2 / smoke:ui-ipc / smoke:phase2.5 / smoke:task33 / smoke:integration）
- **2026-07-15**：Task 2.5.3 完成（Persistence & IPC，陈冠中）：
  - `AppSettings` 新增 `fontTheme`（string, default `'default'`）、`visualTheme`（`'classic' | 'paper'`，default `'classic'`）、`sidebarPercent`（10-40, default 18）、`listPercent`（15-50, default 28）四个字段
  - v3 迁移：新增 `settings` key-value 表持久化应用设置
  - `electron/main/db/sqlite-settings.ts`：`loadSettings()` 从 SQLite 加载已保存值合并到 DEFAULT_SETTINGS；`saveSettings(partial)` 只写变更 key
  - `settings:get` / `settings:update` IPC handler 从 stub 改为真实 SQLite 读写，重启后持久化
   - `usePaneWidths` 从 localStorage 改为 `window.api.settings.get/update` IPC，拖拽宽度重启保持
- **2026-07-15**：Task 3.3 AI 服务层完成（陈冠中）：
  - v4 migration：新增 `ai_providers` 表（id/name/base_url/model_name/api_key/is_default）
  - `AiProviderRepository`：CRUD + `getByIdWithKey`/`getDefaultWithKey` 内部 API Key 获取
  - `openai-client.ts`：`chatCompletion(provider, messages, options)` OpenAI-compatible HTTP 调用，超时控制、错误解析；`testConnection(provider, apiKey)` 连接测试
  - `summary-agent.ts`：内置 brief/standard/detailed 三套默认 Prompt 模板，支持 `customPromptTemplate` 覆盖
  - `translation-agent.ts`：内置 paragraph-by-paragraph bilingual 翻译 Prompt，解析 `--- ORIGINAL / TRANSLATED ---` 格式输出
  - 注册 7 个 AI IPC handler：`ai:providerList/create/update/delete/test` + `ai:generateSummary` + `ai:generateTranslation`
   - preload 暴露 `window.api.ai.*` 类型安全 API
- **2026-07-15**：Task 3.3 剩余部分完成（陈冠中）：
  - v5 migration：新增 `tags`、`article_tags`、`notes`、`digests`、`ai_results` 五张表
  - `TagRepository`：CRUD + addToArticle/removeFromArticle/batchAdd/getByArticle + 同名校验幂等创建
  - `NoteRepository`：CRUD + 删除时自动从所关联 digests 移除
  - `DigestRepository`：CRUD + `exportDigest(id, format)` 输出 Markdown（YAML front matter）或 HTML（内联样式 + escape）
  - `AiResultCache`：key-value 式缓存（按 articleId + resultType 覆盖旧缓存）
  - `tag-agent.ts`：内置 Prompt → JSON 数组解析 → `TagSuggestion[]`，失败返回空列表
  - 注册 ai_data 3 个 handler：`ai:suggestTags`、`ai:getSummary`、`ai:getTranslation`、`ai:getTagSuggestions`
  - 注册 tag 7 个 + note 4 个 + digest 6 个 IPC handler
  - preload 暴露 `window.api.ai`（补齐 3 通道）、`window.api.tag`、`window.api.note`、`window.api.digest`
  - summary/translation/tag_suggestions 生成结果自动缓存到 ai_results 表
- **2026-07-15**：Task 3.2 第一批内容可靠性增强（张宇凡）：
  - HTTP 文本下载支持从响应头、BOM、HTML meta 和 XML encoding 声明识别字符集，并兼容 `gb2312` 到 `gbk` 的常见别名，修复中文旧站无响应头 charset 时的乱码问题。
  - 正文阅读区为长链接、代码块和宽表格补充窄栏自适应与横向滚动，避免三栏拖拽至极端宽度时内容撑破布局。
  - 新增 GBK 页面、中文/英文混排、引用、列表、代码块和表格固定回归样本。
  - 修复 SQLite settings 的 TypeScript 类型错误；`settings:update` 现在拒绝未知字段、错误类型和越界值，Renderer 统一复用 preload 权威类型。
  - 第二批补充：HTTP 重试支持 `Retry-After` 与非法资源限制拦截；同步和正文清洗失败持久化稳定错误码，便于日志检索和问题反馈。
  - 修复极端三栏宽度总和可能超过 100% 的布局问题，改用扣除拖拽手柄后的 `fr` 分配，并联动限制侧栏/列表，为阅读区保留至少 20%。
  - UI IPC smoke 新增极限拖拽、中英混排、长代码和宽表格验证，确认窗口与正文容器均不横向溢出。
- **2026-07-16**：Phase 3 缺陷修复（陈冠中）：
  - **P0 - 补齐类型导入**：`electron/main/index.ts` 补上 `AIProvider`、`Topic`、`Briefing`、`TimelineEntry`、`EventGroup`、`LogEntry` 六个缺失的类型导入，消除 Main 进程 6 个类型错误（其余类型错误在 Renderer 端，由张晨阳负责）。
  - **P0 - 默认 Provider 逻辑断裂修复**：`AI_PROVIDER_CREATE` / `AI_PROVIDER_UPDATE` handler 在 isDefault 为 true 时同步调用 `saveSettings({ defaultProviderId })`，`AI_PROVIDER_DELETE` handler 在删除当前默认 Provider 时清除 `defaultProviderId`。保证 AI 生成 handler 能正确读取用户设定的默认 Provider。
  - **P0 - 烟测判定修复**：`smoke-3.3` 探针判定分离为 coreSections（base/sp/prov/tag/note/dig，不得跳过且必须全部通过，Provider test 必须 !== false）与 aiSections（ais/ait/aig/aic，允许跳过但未跳过则必须通过）；`smoke-3.4-integration` 增加 uiIpc.ok 检查。
  - **P1 - 文摘 HTML 导出 XSS 修复**：`digest-repository.ts` 的 `buildHtmlExport` 先对 `markdownContent` 调 `escapeHtml()` 再做 Markdown 正则替换，防止用户笔记中的 HTML 标签或 `<script>` 注入导出页面。
- **2026-07-16**：smoke-3.3 探针修复（陈冠中）：
  - **JSON.stringify 双引号冲突修复**：`scripts/smoke-3.3-probe.js` 中 `__AI_BASE_URL__` / `__AI_KEY__` / `__FEED_URL__` 占位符去掉外层单引号，消除 `JSON.stringify` 替换时产生的双重引号导致 URL 解析失败（`Failed to parse URL from "http://..."/chat/completions`）。修复后 Provider test 从 false 变为 true。
  - **note 探针修复**：note 创建改为使用刚创建的 feed ID (`nf.data.id`) 而非 `fl.data[0].id`，避免查错 feed 导致 checks 为空。
  - **persistedFontTheme 补齐**：`sp` section 新增 `persistedFontTheme` 检查，确保字体主题重启持久化也被验证。
- **2026-07-16**：IpcDataSource 双包层修复（陈冠中，跨模块协助张晨阳）：
  - **根因**：`src/data/ipcDataSource.ts` 在所有 Tag/Note/Digest/Topic/AI/Settings/Log 方法调用 preload API 时多包了一层对象。例如 `window.api.settings.update({ settings })` → preload 内部再包一层 `{ settings: { settings: {...} } }` → Main handler 收到的是 `{ settings: {...} }` 而非 `Partial<AppSettings>` → 校验失败。
  - **修复**：移除 IpcDataSource 中 30+ 处调用的多余 `{}` 包裹，参数直接透传给 preload（preload 内部会统一包一层）。涵盖 tag (5 处)、note (4 处)、digest (4 处)、topic (5 处)、ai provider (4 处)、ai operations (6 处)、settings (1 处)、log (1 处)。
- **2026-07-15 ~ 2026-07-17**：Phase 3.4 Bug Fix & UX Polish（张晨阳）：
  - **3.4.1.1/.2 状态同步**：`App.handleSelectArticle` / `handleToggleStar` 同时更新 `articlesState` + `allArticlesState`，FeedList 状态栏计数始终从 allArticles 派生。
  - **3.4.1.3 AI 结果区 reset bug 修复**：`ArticleReader` useEffect 切换 article.id 时先无条件清空 5 个 AI 字段（`activePanel/summary/translationParagraphs/tagSuggestions/noteMarkdown`），再走 cleanedHtml 短路或 fetch 分支。修复前 `if (article.cleanedHtml) return;` 提前 return 跳过了 reset。
  - **3.4.1.4/.5 自写 Markdown 渲染**：`src/utils/markdown.ts`（不引 marked），escape HTML → INLINE_RULES（link/code/bold/italic，URL scheme 白名单 http/https/mailto/#/）→ 段落（双换行）+ 单换行 `<br>`。`ArticleReader` 摘要/翻译用 `dangerouslySetInnerHTML={{ __html: renderMarkdown(s) }}` 替换纯文本。
  - **3.4.1.6 删除提示用 allArticles**：`handleDeleteFeed` 改用 `allArticles.filter(a => a.feedId === feed.id).length` 统计真实文章数（不受当前筛选影响）。
  - **3.4.4.1 page 返回按钮 + 当前页标题**：`Layout.tsx` 在 `.app-page` 容器顶部加 `.app-page__header`（back 按钮 + 当前 page title），从 `navItems.find(n => n.id === currentPage)?.label` 取标题。
  - **3.4.4.2 纸质 + 深色统一**：`useAppearance` 改为接收 `effectiveTheme: 'light' | 'dark'` 参数（从 `useTheme().effective` 取）；`applyToHtml` 只在 `visualTheme === 'paper' && effectiveTheme === 'light'` 时写暖黄变量；深色 + paper 时清掉所有 paper 变量 → 走 useTheme dark 调色板，与经典深色完全一致。
  - **3.4.4.3 顶栏搜索框**：`src/components/SearchBar/SearchBar.tsx` 300ms 防抖 + 下拉浮层 + 8 条上限 + 失焦/Esc 关闭 + 点击结果跳到 reader（`selectFeed(target.feedId) → selectArticle(id) → setCurrentPage('reader')`）；`IpcDataSource.articles({ search })` 透传（陈冠中 3.4.3 已实现）。
  - **3.4.4.4 通用设置弹窗 + AI 设置子页面拆分**：
    - 新组件 `src/components/GeneralSettingsModal/`（语言/字体/视觉/字号/阅读宽度 + 即时生效 + IPC 持久化 + Esc/点 backdrop 关闭）
    - `SettingsPage` 拆为 AI only（Provider + AI 默认值）
    - Layout nav 7 项：`general`(弹窗) / `ai`(子页) / tags / notes / digests / topics / logs；App.tsx 拦截 'general' → `setGeneralModalOpen(true) + setCurrentPage('reader')`
  - **3.4.4.5 ArticleList 空态用 EmptyView**：`filterHint` prop 三态（`'暂无星标文章'` / `'所有文章都已读完'` / `'暂无匹配文章'`）。
  - **smoke 探针适配 nav 7 项**：`smoke-3.4-integration` 内联探针索引 +1（general 走弹窗不占索引，ai=1, tags=2, ..., logs=6）；字体/视觉主题入口从 `.settings-page__font-card` 改为 `.general-modal__font-card`（点 navBtn[0] general 触发弹窗再验证），测试完后点 backdrop 关闭弹窗；OK 判定 `page_settingsRendered` → `page_aiRendered`。
  - **8/8 smoke 全过**：smoke / smoke:ui / smoke:db / smoke:phase2 / smoke:ui-ipc / smoke:phase2.5 / smoke:task33 / smoke:integration。integration 探针：navBtnCount=7、fontThemeCount=3、visualThemeCount=2、fontBefore=default→fontAfter=hei、visualBefore=classic→visualAfter=paper、6 page 全部 rendered、tag/note CRUD verified、回到 reader 5 AI 按钮（实际 7 个，含星标/原文）。
- **2026-07-15 ~ 2026-07-17**：陈冠中 main 分支同步：
  - `1b7e039 docs: add Phase 3.4 plan (bug fixes + UX polish + fuzzy search)`
  - `30bd39e fix RSS detection and article cleanup`
  - `c0cde1a Merge pull request #3 from RegeonChen/agent/phase3-fixes-macos-release`
  - `76ee8fb fix Phase 3 data contracts and add macOS packaging`
  - `d036c26 fix: 本次打开软件后刚清洗的文章AI按钮被禁用`
  - `ba9f236 fix: testConnection maxTokens 10 too low for DeepSeek`
  - `dbd6beb fix: AI结果读取错位 + testConnection诊断信息不足`
  - `90d3f22 fix: 设置项(字体/字号/阅读宽度)切换后Reader不生效`
  - `097735a fix: 外观切换错误提示'外观切换失败' — setter返回值被.then(()=>undefined)吞掉`
  - `c03d478 fix: IpcDataSource 双包层导致设置/Provider等全部IPC操作失败`
- **2026-07-17**：Seed 模式（张晨阳）：
  - 新增 `scripts/seed-test-feeds.cjs`（6 推荐 URL：阮一峰 / 少数派 / antirez / HN / Simon Willison / JSON Feed Spec，知乎日报 404 移除） + 主进程 `runSeedFeeds()` + `SMOKE_FLAGS.seedFeeds/seedList` + `app.setPath` 加 seedFeeds 分支
  - 6 源共 165 篇文章入数据库；保留 userData 不删，方便 dev 模式直接查看（默认写到 OS userData，JUHE_SHIVI_USER_DATA env 覆盖）

## 路线图

1. Phase 1：创建应用脚手架并确定共享协议。
2. Phase 2：完成订阅、同步、持久化和阅读的核心流程。
3. Phase 3：完成课程要求的 AI、笔记、标签、多语言、日志和导出功能。
4. Phase 4：在专题追踪流程中集成三个职责区域。
5. Phase 5：在 Windows、macOS 和 Linux 上进行验证并准备课程交付。

详细任务和验收标准位于 `PLAN.md`，本文件不重复记录任务级进度。

## 已知问题

- UI 组件库、E2E 测试框架、CI 流水线、跨平台打包工具（electron-builder / electron-forge）尚未确定。
- **Phase 3 IPC 数据源参数契约不一致**：`IpcDataSource`（Renderer 端）多处调用 preload API 时多包了一层 `{ input }`（如 `tag.create({ input })` 实际变成 `{ input: { input: ... } }`），标签、笔记、文摘、Provider、AI、设置、Topic、日志等操作大面积失败（由张晨阳修复）。
- **API Key 明文存储**：`ai_providers.api_key` 以明文写入 SQLite，违反 `shared/types.ts` 中"通过安全存储管理、不保存明文"的约定。计划 Phase 5 改用 `safeStorage` 加密。
- 不同 OpenAI-compatible Provider 在 Endpoint、流式响应和用量信息方面可能存在差异，需要进行兼容性测试。
- 专题匹配和相似报道分组的实现方案尚未确定。
- 尚未进行跨平台行为测试。
- Feed、HTML 和 OPML 已有固定离线样本；AI 功能的固定测试样本尚未建立。
- 新增数据库仓储（Tag/Note/Digest/AIProvider/AiResultCache）几乎没有对应单元测试。
- Topic 和 Log 目前仍是占位 stub（12 个 Topic + 2 个 Log IPC 返回 `NOT_IMPLEMENTED`），AI 真实生成未被自动化测试覆盖。
- 完整 `npm audit` 报告 Electron 31、Vite 5/electron-vite 2 存在 4 组开发/运行工具链公告（2 moderate、2 high）；生产依赖审计为 0。修复需要 Electron、Vite 和 electron-vite 跨大版本升级，应由脚手架负责人协调并在发布前完成兼容性验证。
- electron-builder / electron-forge 等打包方案未引入；`npm run build` 当前只产出 unpacked 三段产物，不含可分发的安装包（Phase 5 验收前需补齐）。
