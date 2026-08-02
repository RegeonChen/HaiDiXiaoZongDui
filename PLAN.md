# Project Plan

本计划基于 `INIT.md` 制定。项目尚未初始化，文中的“影响模块”是职责范围，具体文件路径将在脚手架建立后补充。

## Team Responsibilities

| 成员 | 主要职责 | 主要交付 |
|---|---|---|
| 张晨阳 | Electron 与界面 | 桌面应用框架、三栏阅读界面、各功能页面、交互状态、多语言界面 |
| 张宇凡 | RSS、内容清洗与同步 | Feed/OPML 解析、订阅同步、正文提取、Cleaned HTML、Cleaned Markdown |
| 陈冠中 | 数据库与 AI 专题分析 | SQLite、数据访问接口、LLM Providers、Summary/Translation/Tag Agent、专题匹配与简报 |

三人共同维护共享类型和接口。各成员优先修改自己负责的模块；跨模块接口变更需要三人确认并同步更新文档。

## Phase 1: Project Foundation

**Overall Goal:** 建立可运行的 Electron 项目和三条可以并行开发的模块边界。

### Task 1.1 - Application Scaffold (张晨阳)

- **Task Detail:** 初始化 Electron、React 和 TypeScript，建立主进程、preload、renderer 和基础窗口。
- **Affected Areas:** Electron 框架、前端入口、开发和构建配置。
- **Verification:** 应用可以启动并显示基础窗口，renderer 不能直接访问完整 Node.js API。

### Task 1.2 - Shared Contracts (张晨阳 + 张宇凡 + 陈冠中)

- **Task Detail:** 共同确定 Feed、Article、Tag、Note、Topic 等核心数据类型，以及 UI 调用本地服务的基本接口。
- **Affected Areas:** 共享类型、IPC 接口约定、错误返回格式。
- **Verification:** 三个模块可以基于同一组类型独立开发，不需要直接引用彼此内部实现。

## Phase 2: Core Reading Workflow

**Overall Goal:** 完成“添加订阅源 -> 同步文章 -> 本地保存 -> 阅读文章”的基础闭环。

### Task 2.1 - Electron UI and Reader Shell (张晨阳)

- **Task Detail:** 实现订阅源侧栏、文章列表、阅读区、加载状态和错误状态；先使用模拟数据完成交互。
- **Affected Areas:** 页面布局、通用组件、前端状态和 IPC 调用封装。
- **Verification:** 用户可以在模拟数据中切换订阅源、选择文章并查看正文，窗口尺寸变化时布局正常。

### Task 2.2 - Feed, OPML and Cleaning Pipeline (张宇凡)

- **Task Detail:** 实现 RSS/Atom/JSON Feed 解析、OPML 导入导出、手动同步、正文提取以及 Cleaned HTML/Markdown 生成。
- **Affected Areas:** Feed Parser、Sync Service、Content Cleaner、OPML Service。
- **Verification:** 使用多种真实订阅源测试后可以稳定得到统一文章数据；清洗结果能够保留标题、正文、图片、链接、列表和代码块。

### Task 2.3 - Local Database (陈冠中)

- **Task Detail:** 建立 SQLite 数据库和迁移机制，保存订阅源、文章、同步状态、已读状态和星标状态，并提供统一的数据访问接口。
- **Affected Areas:** 数据库连接、迁移、数据仓储和查询接口。
- **Verification:** 重启应用后数据仍然存在；重复同步不会重复写入同一篇文章；已读和星标状态可以正确更新。

### Phase 2 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张宇凡将同步和清洗结果交给陈冠中保存，张晨阳通过约定接口读取并展示数据。
- **Verification:** 用户可以添加真实订阅源、完成同步、选择文章阅读，并修改已读和星标状态。

## Phase 2.5: Enhanced Feed Management & UX

**Overall Goal:** 补充订阅源删除、OPML 导入自动同步和三栏可拖拽布局功能。

### Task 2.5.1 - UI Enhancements (张晨阳)

- **Task Detail:**
  - 删除订阅源：右键菜单 → 确认对话框 → 自动切"全部文章"并移除侧栏项。
  - OPML 导入自动同步：导入成功后自动触发全部订阅源同步，显示同步进度和结果 toast。
  - 三栏拖拽：在侧栏与文章列表之间、文章列表与阅读区之间添加可拖拽分隔条（resize handle），拖拽时实时调整相邻两栏宽度；当前宽度持久化。
- **Affected Areas:** FeedList（右键菜单）、确认对话框、OpmlButtons（导入后触发同步）、Layout（resize handle + CSS flex/grid 配合）、AppSettings 宽度字段。
- **Verification:** 右击删除 → 确认后移除；导入 OPML → 自动同步所有源并显示结果；拖拽分隔条 → 三栏宽度即时变化，刷新/重启后宽度保持。

### Task 2.5.2 - Content & Reliability (张宇凡)

- **Task Detail:**
  - 删除订阅源：确认正文缓存释放、OPML 导出过滤已删除源。
  - OPML 导入自动同步：Sync Service 支持批量同步所有订阅源（含新导入的和已有的），单个源失败不中断其余同步。
  - 三栏拖拽：确认 Cleanded HTML/Markdown 在各栏极端宽度下渲染正常（极窄侧栏不影响文字截断、极窄阅读区不破坏代码块/表格布局）。
- **Affected Areas:** Sync Service（批量同步）、OPML Service（导出过滤）、Content Cleaner（宽度兼容性验证）。
- **Verification:** 删除后缓存不可达、OPML 不含已删源；导入 OPML 后所有源依次同步，失败源计入 SyncResult；拖拽至 200px~800px 范围内正文不丢内容。

### Task 2.5.3 - Persistence & IPC (陈冠中)

- **Task Detail:**
  - 删除订阅源：事务内 cascade 删除 feed + articles；提供 `feed:delete` IPC handler。
  - OPML 导入自动同步：确保 OPML 导入的 feeds 先持久化到数据库，再触发同步（避免同步时 feed 尚未写入）；提供 `opml:importAndSync` 聚合 IPC 或 preload 端组合调用 `opml:import` + `sync:all`。
  - 三栏拖拽：在 `AppSettings` 中新增 `sidebarWidth` / `articleListWidth`（number，百分比或像素默认值）；提供 `settings:update` IPC 持久化；在 `shared/types.ts` 同步更新类型。
- **Affected Areas:** FeedRepository / ArticleRepository（级联删除）、OPML import handler、Sync handler、AppSettings 类型、`shared/types.ts`、`settings:update` IPC。
- **Verification:** 删除后无孤立文章；导入 OPML 后 feeds 先入库再同步；拖拽后重启宽度不变、数据库中 settings 已更新。

### Phase 2.5 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳的 UI（右键删除 / OPML 导入按钮 / 拖拽分隔条）→ 陈冠中的 IPC + 持久化 → 张宇凡的内容管线配合。
- **Verification:**
  - 右键删除 → 确认 → 源及文章从界面和 DB 消失，重启不恢复。
  - 导入 OPML 文件 → 自动同步 → 侧栏显示所有源的 siteTitle，中间栏显示最新文章。
  - 拖拽分隔条 → 三栏宽度即时变化 → 重启后宽度保持 → 极端宽度下正文可读。

## Phase 3: Required Product Features

**Overall Goal:** 完成课程要求的 AI、笔记、标签、多语言、调试、字体主题切换和全局视觉主题切换功能。

### Task 3.1 - Feature Interfaces (张晨阳)

- **Task Detail:** 实现 Provider 设置、摘要、双语翻译、标签管理、笔记文摘、导出和多语言切换。日志查看界面曾在本阶段实现，后续产品决策将其移除，仅保留 Main 进程诊断日志。
    追加（字体与视觉主题）：字体主题选择器 UI 组件（至少 3 套预设：宋体/黑体/楷体等中文字体栈 + serif/sans-serif/monospace 英文字体栈）、视觉主题选择器 UI 组件（至少 2 套："经典"白色简约 / "纸质"暖黄护眼）、CSS 变量驱动全局即时切换（字体 + 色彩），无需重启。
- **Affected Areas:** 设置页、阅读器工具区、标签页、笔记与文摘页、本地化资源、全局 CSS 变量体系（`--bg-primary` / `--text-primary` / `--accent` / `--sidebar-bg` / `--toolbar-bg`）、`AppSettings.fontTheme` 和 `AppSettings.visualTheme` 字段。
- **Verification:** 所有功能都有完整的正常、加载、空数据和错误状态，界面能够调用约定的本地接口。切换字体/视觉主题后全界面即时刷新，无闪烁或布局错位。

### Task 3.2 - Content Support and Reliability (张宇凡)

- **Task Detail:** 改进不同 Feed 和网页的兼容性，处理同步失败、重试、内容编码、图片和复杂正文结构，并提供适合 AI 处理的干净内容。
    追加（字体与视觉主题）：确认 Cleaned HTML/Markdown 在不同字体主题下中英文混排、代码块、表格、列表渲染正常；在不同视觉主题下色彩对比度、图片透明背景、代码高亮可读性均正常。
    追加（2026-08-02 网络代理兼容）：生产环境的 Feed 与文章正文请求改用 Electron `net.fetch`，复用 Chromium 网络栈和系统代理配置；HTTP 客户端继续保留超时、重试、大小上限和协议白名单，并将 DNS、代理、证书、拒绝连接、连接重置等底层错误转换为不泄露 URL/正文的可读诊断。真实 Feed smoke 必须断言 `SyncResult.success` 并通过正文 IPC 验证懒加载正文，不能只判断 IPC 外层成功或 Feed 自带 `rawHtml`。
- **Affected Areas:** 同步任务、正文清洗、内容转换、错误日志。
- **Verification:** 选定的测试订阅源可以重复同步，单个源失败不会中断全部同步，AI 输入不包含明显导航和广告内容；浏览器可访问但旧 Node 网络栈失败的 Feed 可通过 Chromium 网络栈完成同步与正文抓取，代理/网络错误保留稳定错误码和安全诊断。

### Task 3.3 - Database and AI Services (陈冠中)

- **Task Detail:** 扩展笔记、文摘、标签和 AI 结果存储；实现可配置 LLM Provider、Summary Agent、Translation Agent 和 Tag Agent。
    追加（字体与视觉主题）：在 `AppSettings` 中新增 `fontTheme`（string，默认值指向第一套预设）和 `visualTheme`（`'classic' | 'paper'`，默认 `'classic'`）字段；提供 `settings:update` IPC handler 支持两者更新并持久化；在 `shared/types.ts` 中同步更新类型定义。
- **Affected Areas:** 数据模型、AI Provider 接口、Agent 服务和结果缓存、`shared/types.ts` 的 `AppSettings` 类型。
- **Verification:** 用户可以配置并测试模型；摘要、翻译和标签建议可生成并缓存；笔记和标签在重启后仍然存在；字体和视觉主题重启后保持用户上次选择。

### Phase 3 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 将张晨阳的功能界面、张宇凡的清洗内容和陈冠中的数据及 AI 服务连接起来。
- **Verification:**
  - 从阅读一篇真实文章开始，可完成摘要、翻译、打标签、添加笔记和导出文摘的完整流程。
  - 字体主题：切换后正文即时刷新，中英文按各自字体栈渲染，代码块等宽字体，无乱码无布局错位。
  - 视觉主题：切换后三栏及工具栏即时变色；"经典"白底深字、"纸质"暖黄底深棕字；阅读区对比度达 WCAG AA 级，代码高亮可读。
  - 两种主题重启后均保持用户上次选择。

## Phase 3.4: Bug Fix & UX Polish

**Overall Goal:** 修复 Phase 3 遗留 Bug，优化用户体验，添加文章模糊搜索功能。

### Task 3.4.1 - UI Bug Fixes & State Management (张晨阳)

- **Task Detail:**
  1. 修复"未读"文章列表不同步：确保 `refreshArticles({ isRead: false })` 返回正确的未读文章集合，且文章标记已读后列表实时移除。
  2. 修复"未读""星标文章"侧栏计数不更新：星标/已读状态变更后同步刷新 `allArticles` 中的 counts，确保 FeedList 底栏的计数始终准确。
  3. 修复 AI 结果区文章切换不消失：`ArticleReader` 在 `article.id` 变化时将 `summary`/`translationParagraphs`/`tagSuggestions`/`activePanel` 重置为空（已有 useEffect 但有遗漏，需确认所有字段被清空）。
  4. 修复翻译结果区不渲染 Markdown：将翻译段落的原文/译文从纯文本 `<div>` 改为简单的 Markdown 渲染（加粗 `**`、斜体 `*`、行内代码 `` ` ``）。
  5. 修复摘要结果区不渲染 Markdown：摘要文本 `content` 渲染前做简易 Markdown → HTML 转换。
  6. 修复删除订阅源提示数量始终为 0：`handleDeleteFeed` 中 `articles.filter` 改用 `allArticles` 而非当前筛选后的 `articles`。
- **Affected Areas:** `App.tsx`（handleSelectArticle/handleToggleStar 的状态同步）、`ArticleReader.tsx`（useEffect reset + Markdown 渲染）、`FeedList.tsx`（计数显示）、`ArticleList.tsx`（已读后移除）。
- **Verification:**
  - 标记一篇未读文章为已读 → 未读列表自动移除该文章，侧栏计数减 1。
  - 点击星标 → 星标文章列表更新，计数更新。
  - 生成摘要/翻译 → 切换文章 → 结果区清空，不再残留上篇文章内容。
  - 翻译/摘要结果中包含 `**加粗**` → 渲染为粗体；包含 `- 列表` → 保留换行。
  - 右键删除有 5 篇文章的订阅源 → 提示"删除其全部 5 篇文章"。

### Task 3.4.2 - AI & Content Reliability (张宇凡)

- **Task Detail:**
  1. 修复翻译经常只翻译子标题：调整 `translation-agent.ts` 的默认 Prompt 模板，增加"翻译整段完整内容，不要只翻译标题"的约束；在分块过长的段落时做截断保护。
  2. 确保摘要内容的 Markdown 结构完整：验证 `summary-agent.ts` 输出的内容格式（标题、列表、加粗等）可被前端一致渲染。
  3. 补充固定测试样本：为翻译输出和摘要输出建立离线 fixture 测试。
  4. 延迟优化（2026-08-02）：逐段翻译改为每批最多 2 段并发，批次结束后再继续，失败时不遗留后台进度；输出 token 按段落长度动态分配。摘要、标签和文章问答在移除图片 URL 后，将超长正文压缩为开头、中段和结尾的代表性输入，分别限制为 24,000 / 12,000 / 20,000 字符。
  5. 为摘要、翻译、标签和问答设置任务级超时与输出预算；Qwen3 确定性任务关闭思考模式，避免无意义的长推理等待。
- **Affected Areas:** `summary-agent.ts`、`translation-agent.ts`、`tag-agent.ts`、`article-chat-agent.ts`、AI 输入预处理和 Agent 测试样本。
- **Verification:**
  - 一篇含 3 段正文的英文文章翻译 → 每段都有完整的原文+译文对照，不只有标题。
  - 摘要生成含 `## Key Points` 和 `- item` → 前端渲染为二级标题和无序列表。
  - 5 段翻译最多同时运行 2 个请求，最终结果仍按原始段落索引排序；超长正文不向 Provider 发送图片 URL 或超出任务上限的输入。

### Task 3.4.3 - Database Query & Search (陈冠中)

- **Task Detail:**
  1. 确认 `ArticleRepository.list({ isRead: false })` 的分页和排序正确性：确保未读筛选 + 分页 + 时间倒序组合使用时不会漏掉文章或重复。
  2. 实现文章模糊搜索的排序算法：在 `ArticleRepository.list()` 中，当 `filter.search` 非空时，对匹配结果按相关性评分排序（标题命中权重 10 + 正文命中权重 1 + 完全匹配额外加分），截取前 20 条返回。
  3. 将 `src/data/ipcDataSource.ts` 的 `articles()` 方法增加 `search` 参数透传，使前端可直接调用 `ds.articles({ search: keyword })`。
- **Affected Areas:** `article-repository.ts`（list 方法排序增强）、`ipcDataSource.ts`（search 参数透传）。
- **Verification:**
  - 搜索"machine learning" → 标题含"machine learning"的文章排在最前，正文含该词的文章排在后，上限 20 篇。
  - 搜索无匹配关键词 → 返回空列表。
  - 未读筛选 + 分页组合 → 第二页不会出现第一页已展示的文章。

### Task 3.4.4 - UX Polish & Search UI (张晨阳)

- **Task Detail:**
  1. 六个二级页面（设置/标签/笔记/文摘/专题/日志）右上角添加"← 返回主界面"按钮，点击回到阅读三栏视图。
  2. 当视觉主题为"纸质"且切换到深色模式时，深色 UI 与"经典"深色一致（via `useAppearance` 中的 `applyToHtml`：深色模式下忽略 visualTheme 差异，统一使用 `data-theme='dark'` 的 CSS 变量）。
  3. 文章模糊搜索 UI：在顶栏或文章列表上方添加搜索输入框（带 300ms 防抖），实时调用 `ds.articles({ search: keyword })` 获取结果，以下拉列表形式展示（标题 + 订阅源名 + 时间），点击跳转到该文章。
  4. 原有"设置"按钮拆分为"通用设置"（弹窗）和"AI 设置"（子页面）：
     - 顶栏 nav 按钮从 6 个变为 7 个：移除 `settings`，新增 `general` 和 `ai`。
     - 点击"通用设置"（语言/字体/视觉主题/字号/阅读宽度）→ 弹出 Modal 弹窗，不跳转子页面，修改即时生效并持久化。
     - 点击"AI 设置"（AI Provider CRUD + AI 默认值）→ 跳转现有 SettingsPage 子页面的 AI 部分。
  5. 搜索/过滤/未读/星标等状态变更后 `articles` 列表为空时展示 `EmptyView` 提示"暂无匹配文章"。
- **Affected Areas:** `Layout.tsx`（返回按钮 / nav 拆分）、`SettingsPage.tsx`（拆分为 GeneralModal + AiSettingsPage）、`useAppearance.ts`（深色模式统一）、`App.tsx`（搜索状态管理）、`ArticleList.tsx`（搜索 UI + 空状态）、新增 `GeneralSettingsModal` 组件。
- **Verification:**
  - 进入标签页 → 右上角有"← 返回"按钮 → 点击回到三栏阅读。
  - 设置视觉主题为"纸质" → 切深色 → 界面显示与"经典"深色完全一致。
  - 在搜索框输入"Python" → 300ms 后下拉列表出现匹配文章（标题+来源+时间）→ 点击文章 → 跳转到阅读视图。
  - 点击顶栏"通用设置" → 弹出 Modal（语言/字体/视觉/字号/宽度）→ 修改 → 即时生效不退出手动查看 → 关闭弹窗回到阅读。
  - 点击顶栏"AI 设置" → 跳转现有 SettingsPage 的 AI Provider + AI 默认值部分。

### Phase 3.4 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳的 Bug 修复 + UX 优化 + 搜索 UI → 接通陈冠中的搜索后端 → 张宇凡的翻译/摘要优化。
- **Verification:**
  - 搜索框输入 → 后端返回排序后的匹配文章 → 点击跳转阅读。
  - 翻译一篇英文文章 → 每段完整对照 → Markdown 正确渲染 → 切换文章结果区清空。
  - 删除订阅源 → 提示正确文章数 → 侧栏计数同步更新。
  - 纸质深色模式与经典深色一致。
  - 通用设置弹窗即时生效，AI 设置跳转子页面。

## Phase 3.5: AI Reading UX Enhancement

**Overall Goal:** 优化 AI 摘要和翻译的 UI 交互体验，增加 AI 结果的持久化与自动加载。

### Task 3.5.1 - Summary Bottom Panel (张晨阳，2026-07-31 交互修订)

- **Task Detail:**
  1. 摘要不再使用独立悬浮窗，改为 `StickyBottomPanel` 中与标签、笔记并列的“摘要”tab；AI 标签建议自动并入“标签”tab。
  2. 点击工具栏“摘要”或底部“摘要”tab → 底部栏立即展开并显示生成状态，不等待 AI Provider 返回。
  3. AI 返回后在同一底部栏渲染 Markdown 摘要；收起后再次打开直接复用缓存。
  4. 底部栏沿用统一的高度拉伸、三 tab 切换和收起交互，摘要与翻译视图可以同时保留。
  5. 删除不再使用的 `SummaryFloatingPanel` 组件和独立位置/尺寸状态。
  6. 兼容修复（2026-08-02）：Tag Agent 对结构化任务关闭思考并请求 JSON，安全解析 `message.content` 或仅结构化任务下的 `reasoning_content`，兼容分析文字、围栏、尾逗号和顶层数组；摘要内容宽度随灵活窗口变化，收起一、二级目录后不保留旧的固定窄宽度。
- **Affected Areas:** `ArticleReader.tsx`、`ArticleReader.css`、`StickyBottomPanel`、摘要与共存 smoke。
- **Verification:**
  - 点击摘要按钮 → 阅读区底部栏切到“摘要”并显示生成状态，页面中不存在摘要悬浮窗。
  - AI 摘要返回后 → 底部栏显示 Markdown 摘要。
  - 收起后从工具栏或底部 tab 重开 → 直接展示缓存，不重新生成。
  - 工具栏始终显示“摘要 / 翻译 / 标签 / 笔记 / 专题”，打开状态只改变强调色底色、边框和 `aria-pressed`，不切换“显示/隐藏/关闭”文字；文章 AI 对话只保留右上角 AI 入口。
  - 摘要栏可拉伸，并可在同一栏切换到标签和笔记；标签页内自动显示 AI 建议。
  - 默认模型只返回 `reasoning_content` → 标签建议仍可经过 JSON 校验后生成，界面不展示内部字段或错误码；无有效结构时提供可操作的重试/换模型提示。
  - 收起一级、二级目录 → 摘要内容随灵活窗口扩展并始终位于底部栏边界内；恢复目录后布局正常。
  - 打开翻译 → 译文视图与底部摘要栏同时保留。

### Task 3.5.2 - Inline Translation Between Paragraphs (张晨阳 + 张宇凡)

- **Task Detail (张宇凡 — 内容管线):**
  1. 提供 `splitCleanedHtmlIntoBlocks(html: string): HtmlBlock[]` 工具函数，将 Cleaned HTML 按段落/标题/代码块/列表切分为独立块（每个 `<p>` / `<h2>` / `<pre>` / `<ul>` 为一个块）。
  2. 确保切分后的块边界正确，不破坏 Markdown 结构（代码块、表格不切分内部）。
  3. 为切分逻辑补充单元测试（`content-cleaner.test.ts` 新增用例）。
- **Task Detail (张晨阳 — UI):**
  1. 修改 `ArticleReader`：渲染文章时不再使用单一 `dangerouslySetInnerHTML`，而是按段渲染，每段之间预留翻译插槽。
  2. 点击"🌐 翻译"按钮 → 每段之后立即出现占位文本框（显示"Waiting for AI response…"），不等待 AI 返回。
  3. AI 逐段返回后，对应占位框更新为译文内容（Markdown 渲染）。
  4. 翻译结果保留原文+译文对照格式，支持 Markdown 渲染（加粗/斜体/代码）。
  5. 替换现有文末 `article-reader__ai-panel` 翻译折叠区。
- **Affected Areas:** 
  - 张宇凡：`content-cleaner.ts`（新增 `HtmlBlock` 类型 + `splitCleanedHtmlIntoBlocks`）、`content-cleaner.test.ts`。
  - 张晨阳：`ArticleReader.tsx`（分段渲染 + 翻译插槽）、`ArticleReader.css`（段落间翻译框样式）、`src/utils/markdown.ts`（复用现有渲染器）。
- **Verification:**
  - 一篇含 5 段正文 + 2 个标题 + 1 个代码块的文章 → 渲染为 8 个独立块，每个块之间有翻译插槽位。
  - 点击翻译 → 每个块下方立即出现"Waiting for AI response…"文本框。
  - AI 返回翻译后 → 各段下方显示对应译文（原文+译文对照，Markdown 正确渲染）。
  - 代码块、表格内部不出现翻译插槽（不被误切分）。

### Task 3.5.3 - AI Result Persistence & Auto-Load (陈冠中)

- **Task Detail:**
  1. AI 生成摘要/翻译后，除写入 `ai_results` 缓存表外，同步回写到 `articles` 表的 `summary` / `translated_paragraphs` 字段。
  2. 在 `ArticleRepository.getById()` 中确保 `summary` 和 `translatedParagraphs` 字段已被查询（现有 SELECT 已包含，确认可用）。
  3. 文章打开时（`ArticleReader` 挂载），自动检查 `article.summary` 和 `article.translatedParagraphs` 是否已有值；若有则直接展示缓存内容，用户无需重新点击按钮即可看到上次生成的结果。
  4. 用户再次点击生成按钮 → 覆盖原有缓存（同时更新 `articles` 和 `ai_results` 两处）。
  5. 确认摘要/翻译与文章 ID 的对应关系严格正确：不同文章不串数据，删除文章后其 AI 缓存也被清理。
- **Affected Areas:** `electron/main/index.ts`（AI 生成 handler 中增加 `articles` 表回写）、`article-repository.ts`（确认字段查询完整）、`ArticleReader.tsx`（挂载时自动加载缓存结果）。
- **Verification:**
  - 为文章 A 生成摘要 → 切换到文章 B → 切回文章 A → 摘要自动显示，无需重新点击。
  - 重启应用 → 打开文章 A → 上次生成的摘要/翻译自动显示。
  - 再次点击翻译 → 覆盖旧译文，新译文保存并自动展示。
  - 删除文章 A → 其摘要和翻译缓存不再存在于 DB 中。
  - 文章 A 的摘要检查不出现文章 B 的内容。

### Phase 3.5 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张宇凡提供段落切分 → 张晨阳接入分段翻译 UI → 陈冠中提供持久化 → 张晨阳接入自动加载。
- **Verification:**
  - 打开一篇英文文章 → 段落正确分块渲染 → 点击翻译 → 每段下方立即出现等待框 → AI 返回后译文逐段填充 → Markdown 正确渲染。
  - 切换到其他文章 → 再切回 → 译文和摘要仍在原位显示。
  - 拉伸摘要底部栏 → 高度正确 → 收起后再次打开复用缓存。
  - 重启应用 → 摘要和翻译自动加载展示。

## Phase 3.6: Translation UX & Sync Feedback & Count Fix

**Overall Goal:** 优化翻译双语对照的展示方式、补充同步进度反馈、修正侧栏计数逻辑、统一已读文章视觉样式。

### Task 3.6.1 - Translation Display Refinement (张晨阳)

- **Task Detail:**
  1. 修改双语翻译的逐段展示：翻译框内**只显示中文译文**，不附带英文原文。原文已在段落正文中展示，翻译框仅负责呈现对应译文。
  2. 过滤翻译结果中的 Markdown 语法：对 AI 返回的翻译文本做客户端 Markdown 过滤，**仅保留粗体（`**`）、斜体（`*`）、下划线（`<u>`/`__`）**三种内联格式；移除标题（`#`、`##`）、列表（`-`、`* `）、代码块（`` ``` ``）、引用（`>`）等块级 Markdown 标记，避免翻译框中出现破坏排版的结构化元素。
  3. 确认过滤不影响原文段落区的 Markdown 渲染（原文段落仍使用完整 Markdown 渲染）。
- **Affected Areas:** `ArticleReader.tsx`（翻译面板渲染逻辑）、`TranslatedArticleView.tsx`（逐段翻译对照组件）、`src/utils/markdown.ts`（新增 `filterInlineMarkdown` 工具函数）。
- **Verification:**
  - 对一篇英文文章点击翻译 → 每段翻译框中只展示中文译文，不含英文原文。
  - 翻译结果含 `**加粗**`、`*斜体*` → 翻译框中正确渲染为粗体/斜体。
  - 翻译结果含 `## 标题`、`- 列表项` → 翻译框中不渲染为标题/列表，仅保留为普通文本。
  - 原文段落区的 Markdown 标题、列表、代码块仍然正常渲染，不受翻译过滤逻辑影响。

### Task 3.6.2 - Sync Progress Feedback (张宇凡 + 张晨阳)

- **Task Detail (张宇凡 — Sync Service):**
  1. 改造批量同步流程，使 Sync Service 支持逐源进度回调：每完成一个订阅源的同步（无论成功或失败），通过 IPC 事件或回调向 Renderer 报告当前进度（当前源名称、已完成数、总数）。
  2. 收集同步失败的订阅源 ID 列表，在全部同步完成后一并返回给 Renderer，供 UI 标记红点。
  3. 保留现有 Sync Service 的容错逻辑：单个源失败不中断其余源的同步。
- **Task Detail (张晨阳 — UI Feedback):**
  1. 在用户点击"同步文章"后，屏幕底部弹出同步进度提示框（非阻塞），实时显示：
     - 当前正在同步的订阅源名称（如"正在同步：阮一峰的网络日志"）
     - 同步进度（已同步数/总数，如"进度：5/13"）
  2. 全部同步完成后，进度框更新为完成提示并自动消失（3 秒延迟）：
     - 全部成功："同步完成：13/13 成功"
     - 部分失败："同步部分完成：成功 11，失败 2。未成功同步的订阅源已用红点标出"
  3. 同步失败的订阅源在侧栏（`FeedList`）中以红点标记，方便用户识别和手动重试。
- **Affected Areas:** 
  - 张宇凡：`SyncService`（批量同步 + 进度回调）、`sync:all` IPC handler（ipcMain 事件推送）。
  - 张晨阳：`App.tsx`（进度状态管理 + toast 显示）、`FeedList.tsx`（失败红点标记）、新增 `SyncProgressToast` 组件（底部进度条 + 动画）。
- **Verification:**
  - 有 13 个订阅源 → 点击同步 → 底部依次显示"正在同步：XXX 进度：1/13"到"13/13"。
  - 全部成功 → 显示"同步完成：13/13 成功"→ 3 秒后消失。
  - 有 2 个源失败 → 显示"同步部分完成：成功 11，失败 2。未成功同步的订阅源已用红点标出"→ 失败源侧栏出现红点。
  - 短时间内多次点击同步 → 不重复弹出多个进度框，以最后一次操作为准。

### Task 3.6.3 - Sidebar Count Accuracy (陈冠中 + 张晨阳)

- **Task Detail (陈冠中 — Database):**
  1. 在 `ArticleRepository` 中提供精确计数方法：
     - `countAll()`：返回数据库中**所有文章**的总数（含已读/未读）。
     - `countUnread()`：返回所有订阅源中 `isRead = false` 的文章总数。
     - `countStarred()`：返回所有订阅源中 `isStarred = true` 的文章总数（含已读/未读）。
  2. 通过 IPC 暴露计数查询接口，供 Renderer 按需调用和刷新。
- **Task Detail (张晨阳 — UI):**
  1. 修改 `FeedList` 侧栏三个分类的计数显示逻辑：
     - "所有订阅源"：显示 `countAll()` 的值。
     - "未读"：显示 `countUnread()` 的值。
     - "星标文章"：显示 `countStarred()` 的值。
  2. 确保计数随用户操作**实时更新**：
     - 标记已读/取消已读 → "未读"计数 ±1。
     - 标记星标/取消星标 → "星标文章"计数 ±1。
     - 手动同步新增文章 → 所有受影响的计数更新。
     - 删除订阅源 → 所有计数联动更新。
  3. 在 `App.tsx` 的状态管理中，将计数变更与 `refreshFeeds` / `refreshArticles` / `handleToggleStar` 等操作关联，统一刷新计数。
- **Affected Areas:** 
  - 陈冠中：`article-repository.ts`（新增 `countAll` / `countUnread` / `countStarred` 方法）、`electron/main/index.ts`（新增计数 IPC handler）、`shared/types.ts`（如需新增 IPC 类型）。
  - 张晨阳：`FeedList.tsx`（计数展示 + props 接口）、`App.tsx`（计数状态管理 + 实时刷新逻辑）、`src/data/ipcDataSource.ts`（计数 IPC 调用封装）。
- **Verification:**
  - 侧栏"所有订阅源"数字 = DB 中全部文章总数。
  - 侧栏"未读"数字 = 所有未读文章数，标记一篇已读后数字 -1。
  - 侧栏"星标文章"数字 = 所有星标文章数，星标/取消星标后数字 ±1。
  - 手动同步新增 3 篇文章 → "所有订阅源"和"未读"计数 +3。
  - 删除有 5 篇文章的订阅源 → "所有订阅源"计数 -5；若其中 2 篇未读则"未读"计数 -2；若其中 1 篇有星标则"星标文章"计数 -1。
  - 三个计数重启后仍然准确。

### Task 3.6.4 - Read Article Visual Style (张晨阳)

- **Task Detail:**
  1. 修改已读文章在 `ArticleList` 中的显示样式：仅将文字颜色变为灰色（`var(--muted)`），**移除现有的删除线（`text-decoration: line-through`）**。
  2. 确认已读文章的标题、摘要预览、时间戳等文本均使用灰色显示，其他视觉元素（星标图标、来源标签等）保持不变。
  3. 确认未读文章保持正常文字颜色（`var(--fg)`），不受已读样式修改影响。
- **Affected Areas:** `ArticleList.tsx`（已读文章 className 逻辑）、`ArticleList.css`（`.article-item--read` 样式修改）。
- **Verification:**
  - 已读文章标题和摘要文字为灰色（`--muted`），无删除线。
  - 未读文章文字为正常颜色（`--fg`），样式不受影响。
  - 在浅色/深色/纸质主题下，灰色已读文字与背景保持足够对比度，可清晰辨认。

### Phase 3.6 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳负责全部 UI 变更：翻译框纯译文展示、同步进度提示、侧栏计数显示、已读文章样式。
- 张宇凡提供同步进度回调能力，供 UI 层消费。
- 陈冠中提供精确的计数查询接口，供 UI 层实时获取和刷新。
- **Verification:**
  - 点击同步 → 底部出现进度提示 → 逐源显示名称和进度 → 完成后提示结果并标记失败源（红点）。
  - 翻译英文文章 → 每段下方翻译框只显示中文译文 → 粗体/斜体正常 → 标题/列表不出现。
  - 侧栏三个数字始终与数据库实际状态一致 → 标记已读/星标/同步后数字即时变化。
  - 已读文章标题为灰色、无删除线 → 未读文章保持正常颜色。

## Phase 3.7: Search Decouple & Pagination

**Overall Goal:** 修复搜索结果无法跳转到前 50 篇之外文章的问题，为"所有订阅源"增加分页加载能力，统一搜索范围与用户预期一致。

### 问题根因分析

当前文章列表存在以下结构性缺陷：

1. **搜索与文章列表耦合过紧**：
   - `SearchBar.onSelect(articleId)` 只传 ID，`App.handleSearchSelect` 在内存数组 `articles` 和 `allArticles` 中查找文章对象。
   - `allArticles` 来自 `ds.articles({})` → `ArticleRepository.list` 默认 `limit = 50`，仅返回最新 50 篇。
   - 数据库中搜索命中但排名在 51 名之后的文章，点击结果会提示"该文章已不在当前列表中"，无法打开。
   - 验证用例：本地 433 篇文章，第 51 篇 `Happy iCal Day` 搜索命中但点击无法跳转。

2. **"所有订阅源"无分页/加载更多**：
   - 非搜索查询默认 `limit = 50`，无 `offset` 控制，用户看不到第 51 篇及之后的历史文章。
   - 切换订阅源、未读、星标等筛选时没有重置分页的机制。

3. **搜索范围与实际不一致**：
   - 搜索框文案："搜索文章标题或正文"
   - 数据库搜索字段：`title` + `raw_text`（只包含 Feed 自带原始文本）
   - 缺失字段：`cleaned_markdown`（清洗后的正文，用户阅读的正文主体）

### Task 3.7.1 - UI: Search Decouple & Article List Pagination (张晨阳)

- **Task Detail:**
  1. **搜索解耦**：`SearchBar.onSelect` 从传递 `articleId: string` 改为传递完整的 `Article` 对象；`App.handleSearchSelect` 复用 `handleTopicOpenArticle` 的 `externalSelectedArticle` 模式，将搜索结果文章快照存入 `externalSelectedArticle`，再走 `selectFeed → selectArticle → setCurrentPage('reader')` 流程。不再依赖内存数组查找。
  2. **文章列表分页**：为 `ArticleList` 添加"加载更多"按钮或滚动阈值触发。`App` 层维护 `articleOffset` state，首次加载 `limit = 50, offset = 0`，加载更多时 `offset += 50`。`ds.articles()` 调用透传 `limit` 和 `offset`。
  3. **分页重置**：切换订阅源（feedId）、标签筛选、未读/星标筛选、全文搜索时重置 `offset` 为 0 并清空已加载的文章列表。
  4. **AI 设置入口可见性**：确认顶栏"AI"按钮（`navItems` 中的 `ai` 入口）在 Layout 中已正确渲染并可点击跳转。`npm run smoke:integration` 已验证 `navBtnCount = 7`，AI 设置页可通过顶栏 nav 进入。
- **Affected Areas:** `src/components/SearchBar/SearchBar.tsx`（props 接口 + onSelect 签名）、`src/App.tsx`（handleSearchSelect 逻辑 + articleOffset state + refreshArticles 分页参数）、`src/components/ArticleList/ArticleList.tsx`（加载更多 UI + props）、`src/components/Layout/Layout.tsx`（确认 AI 入口可见）。
- **Verification:**
  - 搜索历史文章标题 → 搜索结果出现 → 点击 → 直接打开该文章，不提示"已不在当前列表"。
  - "所有订阅源"底部出现"加载更多"按钮 → 点击 → 追加第 51-100 篇文章。
  - 切换订阅源 → 文章列表重置为前 50 篇 → 可再次加载更多。
  - 顶栏"AI"按钮可见且可点击 → 跳转到 AI Provider 设置页。

### Task 3.7.2 - Content Pipeline: Search Scope Alignment (张宇凡)

- **Status:** Content-side completed (2026-07-25); end-to-end click-through remains part of Phase 3.7 Integration after Task 3.7.1 lands.
- **Task Detail:**
  1. 确认 `SearchBar` 输入框文案与实际搜索字段匹配。当前数据库搜索字段为 `title` + `raw_text`；`raw_text` 是 Feed 原文的 `textContent`，不是 `cleaned_markdown`。
  2. 评估 `cleaned_markdown` 加入搜索字段的可行性（该字段在 `articles` 表中，清洗后的正文，更贴近用户的"正文"概念）。
  3. 协同陈冠中更新搜索 SQL 字段列表，确保 Database 层新增字段后内容管线侧无副作用。
  4. 补充搜索回归测试样本（`content-cleaner.test.ts` 或独立 smoke 探针）：使用 seed 数据中第 51 篇历史文章搜索命中 + 跳转。
- **Affected Areas:** `SearchBar` placeholder 文案、搜索测试样本。
- **Verification:**
  - 搜索框文案与实际命中字段一致，用户不会因"搜了但命中的是 raw_text 而非 cleaned_markdown"而产生困惑。
  - 超过 50 篇的 seed 数据中搜索第 51 篇标题，搜索结果可见且可跳转。
- **Implementation:** 保留“搜索文章标题或正文”文案；生产与 Mock 搜索范围统一为 `title` + `raw_text` + `cleaned_markdown`。数据库集成测试增加 60 篇历史文章样本，证明默认前 50 篇之外的第 51 篇可分别由标题、Feed 原文和清洗正文命中，并可通过 `getById` 取回完整文章。

### Task 3.7.3 - Database: Search Field Expansion & getById IPC (陈冠中)

- **Task Detail:**
  1. **搜索字段扩展**：在 `ArticleRepository.list` 的搜索条件中，将 `(title LIKE ? OR raw_text LIKE ?)` 扩展为 `(title LIKE ? OR raw_text LIKE ? OR cleaned_markdown LIKE ?)`，覆盖清洗后的正文主体。
  2. **搜索上限放宽**：将搜索模式的 `limit` 从默认 20 提高到 `filter.limit` 的上限（建议 50），与前端 MAX_RESULTS 对齐或允许前端按需指定。
  3. **IPC `article:getById` 补全**：确认 DataSource 已有 `getArticle(id)` 或等效 IPC；若不存在则新增，作为搜索跳转的最后保底手段——当搜索结果文章不在任何缓存列表中时，通过 IPC 按 ID 直接获取完整 Article 对象。
  4. **搜索一致性验证**：确保同一关键词在 `raw_text` 和 `cleaned_markdown` 两个字段上的搜索结果一致且不重复（DISTINCT 或 JS 端合并去重）。
- **Affected Areas:** `electron/main/db/article-repository.ts`（list 方法搜索 SQL）、`shared/ipc.ts`（article:getById 通道）、`src/data/ipcDataSource.ts`（getArticle 实现）、`src/data/mockDataSource.ts`（getArticle mock）。
- **Verification:**
  - 数据库中 `cleaned_markdown` 含关键词 → 搜索命中 → 出现在搜索结果列表中。
  - 搜索返回命中总条数（total），与数据库中实际匹配行数一致。
  - `article:getById` IPC 可通过任意文章 ID 返回完整 Article 对象。

### Phase 3.7 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳完成搜索 UI 解耦 + 文章列表分页 → 接通陈冠中的搜索范围扩展 + getById IPC → 张宇凡验证搜索范围与文案一致 + 补充测试样本。
- **Verification:**
  - 搜索一篇排名 51 之后的历史文章 → 搜索结果展示 → 点击 → 阅读器正常打开该文章内容。
  - "所有订阅源"底部可加载更多 → 第 51 篇文章可见 → 该文章也可搜索命中。
  - 切换筛选条件后分页重置，不会出现重复文章或空列表。
  - 搜索框文案与数据库实际搜索字段一致，`cleaned_markdown` 中的关键词可被搜索到。

## Phase 4: Topic Tracking

**Overall Goal:** 汇合三条主线，实现项目的特色功能“专题追踪与多源简报”。

### Task 4.1 - Topic Page (张晨阳)

- **Status:** Completed (2026-07-23, Topic Evolution Graph MVP).
- **Task Detail:** 实现专题创建、专题文章列表、事件分组、时间线、来源对比和简报展示界面。
- **Affected Areas:** 专题页面、时间线组件、简报编辑与导出交互。
- **Verification:** 用户可以创建专题，并清楚看到相关文章、来源和简报引用关系。
- **Implementation:** 默认入口升级为“专题演化图”：横向按时间、纵向按发展方向排列事件节点；节点可合并重复报道，展开后列出全部来源并可返回阅读器原文。

### Task 4.2 - Topic-ready Content (张宇凡)

- **Status:** Completed (2026-07-17).
- **Task Detail:** 为专题分析提供稳定的标题、发布时间、来源、正文和摘要文本，处理缺失字段与重复报道。
- **Affected Areas:** 内容标准化、去重信息、同步后的分析输入。
- **Verification:** 来自不同 Feed 的文章能够转换为统一、可比较的输入数据。
- **Implementation:** `topic-analysis-input.ts` 输出可追溯的标准化文章、最佳可用正文层、UTC 时间回退、规范 URL、内容指纹、去重主文章和重复组；保留全量来源以供 Briefing 引用。

### Task 4.3 - Topic Analysis (陈冠中)

- **Status:** MVP Completed (2026-07-23); optional AI semantic refinement remains.
- **Task Detail:** 保存专题及文章关联，实现文章匹配、相似报道分组、时间线数据和带来源引用的多源简报生成。
- **Affected Areas:** Topic 数据模型、匹配与分组服务、Briefing Agent、结果缓存。
- **Verification:** 新文章能够加入相关专题；相似报道可以被分组；简报中的每条结论可以返回支持它的原文。
- **Implementation:** Schema v7 持久化专题与文章关联；先用本地标题/摘要/清洗正文发现候选文章，再按规范 URL、内容指纹和标题相似度聚合事件，生成“发布与能力 / 产品与应用 / 安全与治理 / 成本与部署 / 观点与解读”方向图。结果按内容签名缓存，仅新增或修改文章时重建；本地简报逐条引用来源文章，不额外消耗 Token。
- **AI naming enhancement (2026-08-01):** 用户在文章阅读区主动创建专题时，AI 基于标题、来源、摘要和最佳可用正文生成 4 组“专题名 / 描述 / 关键词 / 推荐理由”。首项默认填充表单，备选项可整组切换并支持刷新；结果按文章内容签名缓存。该能力只优化专题边界与命名，不参与本地第一轮候选文章发现。
- **Reliability and latency hardening (2026-08-02):** 专题命名推荐使用 6,000 字正文、45 秒首次请求与最多 15 秒的单次结构修复预算；Provider 拒绝 `response_format` 后按 Provider/模型在进程内记忆并跳过后续无效尝试。AI HTTP 统一使用 Electron `net.fetch` 继承系统代理；专题推荐错误按超时、鉴权、限流、网络、Provider、空响应、格式和候选质量分类，Main 进程诊断日志只记录耗时、请求次数和错误类别等脱敏元数据。

### Phase 4 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 三人共同完成专题页面的端到端连接和演示数据准备。
- **Verification:** 从同步多篇真实文章开始，可以生成一个包含事件分组、时间线、观点差异和来源引用的专题简报。
- **MVP Result (2026-07-23):** 专题 CRUD、自动关联、事件聚合、发展方向、点线图、原文回跳、缓存和来源简报已端到端接通。模型现用于用户主动触发的专题命名与边界推荐，后续仍可优化语义关系与观点差异，但不参与第一轮候选文章发现。

## Phase 4.1: Feed Action Buttons & Tag Display Enhancement

**Overall Goal:** 在订阅源中栏添加操作按钮（同步/全部标为已读），在文章列表和阅读区显示文章标签，将标签管理界面改为双栏布局并支持按标签查看文章。

### Task 4.1.1 - Feed Action Buttons & Tag UI (张晨阳)

- **Task Detail:**
  1. **订阅源操作按钮**：在中栏上方当前选中订阅源名称右侧添加两个按钮——"同步"和"全部标为已读"。
  2. **同步按钮**：点击后触发单源同步（调用 `ds.syncFeed(feedId)`），屏幕下方弹出进度提示和结果 toast（成功显示"同步完成：新增 X 篇，更新 Y 篇"，失败显示具体错误原因）。
  3. **全部标为已读按钮**：点击后将当前订阅源下所有文章批量标记为已读（调用批量已读 IPC），确认左栏"未读"等数字实时更新。
  4. **文章标签显示**：在中栏 `ArticleList` 和右栏 `ArticleReader` 的文章标题前，渲染该文章的所有标签（标签名称 + 颜色圆点/背景色），标签信息从文章标题中解析嵌入的标签标记。
  5. **标签管理双栏布局**：将现有标签管理页面改为左右两栏布局。左栏保留现有标签列表和管理功能（CRUD）；右栏为选中标签下的文章列表（标题 + 来源 + 时间），支持点击跳转到阅读器。
  6. **右栏文章列表实时同步**：当用户对文章添加/移除标签后，右栏文章列表实时更新；当选中标签改变时，右栏同步切换为对应标签的文章列表。
- **Affected Areas:** `src/components/ArticleList/ArticleList.tsx`（标签渲染 + 订阅源操作按钮）、`src/components/ArticleList/ArticleList.css`（操作按钮 + 标签样式）、`src/components/ArticleReader/ArticleReader.tsx`（标题前标签渲染）、`src/pages/TagManagePage.tsx`（左右双栏布局 + 右栏文章列表）、`src/App.tsx`（单源同步状态 + 批量已读 + 标签页状态管理）、`src/components/FeedList/FeedList.tsx`（计数实时更新）。
- **Verification:**
  - 点击订阅源 → 中栏上方显示源名称 + "同步"和"全部标为已读"两个按钮。
  - 点击"同步" → 底部显示同步进度，完成后显示"同步完成：新增 X 篇，更新 Y 篇"或具体错误信息。
  - 点击"全部标为已读" → 该源下所有文章变为已读，左栏"未读"计数实时更新。
  - 一篇文章有标签"AI"（蓝色）和"技术"（绿色）→ 中栏和右栏标题前显示两个彩色标签。
  - 标签管理页左栏点击标签"AI" → 右栏显示所有带"AI"标签的文章列表。
  - 为文章添加/移除标签 → 右栏列表和中栏标题标签实时更新。

### Task 4.1.2 - Single Feed Sync Progress & Tag Marker Compatibility (张宇凡)

- **Status (2026-07-26):** ✅ 后端与真实 Electron 烟测完成；底部进度 UI 由 Task 4.1.1 接入。
- **Task Detail:**
  1. 确保单源同步（`syncFeed`）返回明确的进度信息（当前状态：正在抓取 / 正在解析 / 正在清洗 / 完成）和最终结果（新增数、更新数、错误信息）。
  2. 同步失败时返回可读的错误原因（网络超时、Feed 格式错误、内容清洗失败等），供 UI 层展示具体错误 toast。
  3. 评估标签嵌入标题对内容管线的影响：确认标签标记格式（如 `[tag:AI|#3B82F6]` 前缀）不会被 Feed 解析、正文清洗或 Markdown 渲染误处理；如需过滤，在清洗流程中增加标签标记剥离逻辑。
  4. 补充单源同步烟测：针对一个有效 Feed 触发单源同步，验证进度回调和结果返回值完整性。
- **Affected Areas:** `electron/main/sync-service.ts`（单源同步进度回调）、`electron/main/content-cleaner.ts`（标签标记过滤，如需要）、`scripts/`（同步烟测脚本）。
- **Verification:**
  - 点击单源"同步"按钮 → 底部依次显示"正在同步：XXX"→ 完成后显示新增/更新数量。
  - 同步一个失效 Feed → 底部显示具体错误原因（如"网络超时"），而非通用"同步失败"。
  - 标题中含标签标记的文章 → Cleaned HTML/Markdown 中标签标记不出现或正确渲染为标签组件。
- **Implementation Notes (2026-07-26):**
  - `SyncResult` 记录 `fetching → parsing → saving → completed/failed` 阶段历史，`sync:progress`
    同时返回当前 Feed、当前阶段、完成数和最终结果。正文抓取与清洗按现有架构在打开文章或
    调用 AI 时懒执行，因此同步阶段没有伪造“正在清洗”状态。
  - 同步失败保留内容管线稳定错误码（如 `[HTTP_BAD_STATUS]`、`[HTTP_TIMEOUT]`），
    `IpcDataSource` 将新增数、更新数、错误和阶段完整透传给 UI。
  - 标签前缀仅在文章标题开头识别；Feed 重同步采用最新来源标题并保留数据库中的现有标签，
    新文章会剥离来源伪装的内部标签前缀。标签改名、改色、删除和文章标签增删均在事务内重建标题。
  - `smoke:phase2` 已覆盖有效单源的完整阶段、最终计数、进度查询，以及失效 Feed 的稳定错误码；
    数据库集成测试覆盖标签修改和 Feed 重同步后的标题一致性。

### Task 4.1.3 - Batch Mark Read & Tag-Title Binding & Tag Article Query (陈冠中)

- **Task Detail:**
  1. **批量标为已读**：在 `ArticleRepository` 中新增 `markAllReadByFeed(feedId)` 方法，将该订阅源下所有未读文章批量标记为已读；通过 IPC 暴露该接口，支持前端调用并返回更新的行数。
  2. **标签-标题深度绑定**：
     - 定义标签嵌入标题的存储格式（如标题前缀 `[tag:标签名|颜色hex] `），确保格式唯一可解析。
     - 在 `tagAddToArticle` 操作中，同步更新 `articles` 表的 `title` 字段（将标签标记嵌入标题）。
     - 在 `tagRemoveFromArticle` 操作中，同步从 `articles` 表的 `title` 字段中移除对应标签标记。
     - 在 `getArticle` / `articles` 查询中确保标题字段包含最新的标签嵌入信息。
     - 确保标签更新的事务性：标签增删和标题更新在同一事务中完成，防止数据不一致。
  3. **按标签查询文章**：在 `ArticleRepository.list` 中完善 `tagIds` 筛选逻辑，确保可通过标签 ID 精确查询该标签下的所有文章；支持排序（时间倒序）和分页。
  4. **IPC 接口**：提供 `article:markAllReadByFeed` IPC 通道；确认现有 `article:list` 的 `tagIds` 筛选和分页参数正常工作。
- **Affected Areas:** `electron/main/db/article-repository.ts`（markAllReadByFeed + 标题更新 + tagIds 查询完善）、`electron/main/db/tag-repository.ts`（tagAddToArticle / tagRemoveFromArticle 中增加标题回写）、`electron/main/index.ts`（新增 IPC handler）、`shared/ipc.ts`（新通道定义）、`src/data/ipcDataSource.ts`（接口实现）、`src/data/mockDataSource.ts`（mock 实现）。
- **Verification:**
  - 点击"全部标为已读" → 该源下 10 篇未读文章全部变为已读 → 左栏"未读"计数 -10。
  - 为文章添加标签"AI"（蓝色）→ 文章标题在 DB 中变为 `[tag:AI|#3B82F6] 原标题` → 前端解析后标题前显示蓝色"AI"标签。
  - 移除标签"AI" → 标题恢复为原标题，前端标签消失。
  - 标签管理页选中标签"AI" → 右栏显示所有带"AI"标签的文章，按时间倒序排列。
  - 同一篇文章添加/移除标签的操作在重启后标题和标签状态一致。

### Task 4.1.4 - OPML Export Selection UI (张晨阳)

- **Task Detail:**
  1. **导出选择子界面**：将现有的"导出 OPML"操作改为进入一个新的子界面（或全屏 Modal），不再直接触发导出。
  2. **订阅源选择列表**：子界面展示所有订阅源的列表，每项包含订阅源名称、URL 和勾选框。初始状态下所有订阅源均被勾选。
  3. **全选/取消全选**：列表顶部提供"全选"和"取消全选"按钮，一键切换所有订阅源的勾选状态。
  4. **单个勾选/取消勾选**：用户可单独勾选或取消勾选任意订阅源，已选数量实时显示。
  5. **操作按钮**：顶部工具条在"全选/取消全选"旁提供"取消导出"（返回上一页/关闭 Modal）和"确认导出"两个按钮，避免底部操作栏遮挡长列表。
  6. **确认导出**：点击后收集当前已勾选的订阅源 ID 列表，调用选择性导出 IPC，后续行为与现有导出 OPML 一致（弹出保存对话框，写入文件）。
- **Affected Areas:** `src/pages/OpmlExportPage.tsx`（新增选择子界面）、`src/components/OpmlButtons.tsx`（修改导出按钮行为，跳转子页面而非直接导出）、`src/App.tsx`（路由/Modal 状态管理）。
- **Verification:**
  - 点击"导出 OPML" → 进入订阅源选择子界面，所有订阅源默认勾选。
  - 点击"取消全选" → 所有勾选取消 → 点击"全选" → 所有勾选恢复。
  - 手动取消勾选 2 个订阅源 → 已选数量更新 → 点击"确认导出" → 弹出保存对话框 → 导出文件仅含已勾选的订阅源。
  - 点击"取消导出" → 返回原界面，不触发任何文件操作。

### Task 4.1.5 - Selective OPML Export Service (张宇凡)

- **Status (2026-07-26):** ✅ 完成。
- **Task Detail:**
  1. 改造 `opmlExport` 方法，使其接受可选的 `feedIds?: string[]` 参数：
     - 若未传 `feedIds` 或为空，保持现有行为——导出所有订阅源。
     - 若传入 `feedIds`，仅导出指定的订阅源，未选中的订阅源不出现在 OPML 文件中。
  2. 确认选择性导出的 OPML 文件格式与全量导出完全一致，可被其他 RSS 阅读器正常导入。
  3. 当 `feedIds` 中某个 ID 对应的订阅源不存在时，跳过该项而非中断整个导出。
  4. 补充选择性导出烟测：传入部分 feedId，验证导出文件仅含指定订阅源。
- **Affected Areas:** `electron/main/opml-service.ts`（opmlExport 方法签名 + 过滤逻辑）、`electron/main/index.ts`（opml:export IPC handler 参数透传）。
- **Verification:**
  - 传入 3 个 feedId → 导出 OPML 文件仅含 3 个 `<outline>` 条目。
  - 传入不存在的 feedId → 导出正常完成，该 ID 被跳过，其余源正常导出。
  - 不传 feedIds → 行为与现有全量导出一致，所有订阅源均出现在文件中。
- **Implementation Notes (2026-07-26):**
  - Main IPC 在打开保存对话框前校验、裁剪并去重 `feedIds`；未传或空数组保持全量导出。
  - OPML 服务使用 ID 集合过滤，未知 ID 自动跳过，输出仍复用同一 `exportOpml` 格式化路径。
  - 单元测试覆盖部分选择、未知 ID 和空选择；`smoke:phase2` 真实导出一个已选源、保留一个
    未选源，再删除已选源并从文件导回，验证文件未混入未选源。

### Task 4.1.6 - Feed List Query & Selective Export IPC (陈冠中)

- **Task Detail:**
  1. 确认 `feed:list` IPC 返回的订阅源列表包含 UI 选择界面所需的所有字段（`id`、`title`、`url`），供前端渲染勾选列表。
  2. 若 `feed:list` 需扩展字段（如 `siteTitle`、`feedType`），在 `FeedRepository` 和 `shared/types.ts` 中同步更新。
  3. 确保 `opml:export` IPC handler 支持接收 `feedIds` 参数并透传给张宇凡的 `opmlExport` 方法。
  4. 更新 `DataSource` 接口中 `opmlExport` 相关方法的签名（如需），同步更新 `IpcDataSource` 和 `MockDataSource` 实现。
  5. Mock 模式下，选择性导出行为与全量导出保持一致（根据传入的 feedIds 过滤后生成 OPML 内容）。
- **Affected Areas:** `electron/main/db/feed-repository.ts`（确认查询字段完整）、`electron/main/index.ts`（opml:export handler 参数）、`shared/ipc.ts`（如需新增类型）、`src/types/dataSource.ts`（如接口签名变更）、`src/data/ipcDataSource.ts` / `src/data/mockDataSource.ts`（接口实现同步）。
- **Verification:**
  - `feed:list` 返回数据包含 `id`、`title`、`url`，前端可正常渲染勾选列表。
  - `opml:export` 传入 `feedIds: ['feed-a', 'feed-c']` → 只导出这两个源。
  - Mock 模式下选择性导出行为与 IPC 模式一致。

### Phase 4.1 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳的 UI 操作按钮 + 导出选择界面 → 触发张宇凡的单源同步 + 选择性 OPML 导出 → 陈冠中的批量已读、标签查询和 feed 列表查询 → 张晨阳展示结果并更新界面。
- **Verification:**
  - 选中一个订阅源 → 点击"同步" → 底部显示进度 → 完成后新增文章出现在列表 → 点击"全部标为已读" → 文章变灰且计数更新。
  - 为文章添加标签 → 中栏和右栏标题前出现彩色标签 → 标签管理页右栏出现该文章 → 移除标签 → 标签消失。
  - 标签管理页选中不同标签 → 右栏文章列表实时切换 → 点击文章 → 跳转阅读器。
  - 点击"导出 OPML" → 进入选择界面 → 调整勾选 → 确认导出 → 生成的 OPML 文件仅含选中的订阅源。

## Phase 4.2: Navbar Icon Refinement, System Font Size & Sidebar Toggle

**Overall Goal:** 优化顶栏导航图标、新增系统字号（左栏+中栏）独立于正文字号（右栏）的控制、增加左栏隐藏/显示切换按钮。

### Task 4.2.1 - UI: Navbar Icons, System Font Size & Sidebar Toggle (张晨阳)

- **Task Detail:**
  1. **AI 设置图标替换**：将顶栏 `navItems` 中 AI 设置入口的图标替换为粗体英文 "AI" 两个字母（纯文本或 SVG 文字），不再使用通用图标。确保 "AI" 文字在浅色/深色/纸质三套视觉主题下与周围图标视觉协调（字号、粗细、颜色、对齐）。
  2. **专题图标替换**：将顶栏 `navItems` 中专题入口的图标替换为更贴合"专题追踪与多源简报"原设计的图标方案（建议使用多个文档/来源聚合类图标，与 RSS 阅读器的整体图标风格一致）。确保新旧图标切换不影响 `navItems` 的 `data-testid` 和键盘导航。
  3. **系统字号设置**：在 `GeneralSettingsModal` 中新增"系统字号"调节项（独立于现有的"正文字号"调节项）：
     - "系统字号"：控制左栏（`FeedList`，订阅源列表）和中栏（`ArticleList`，文章列表）的文字大小。
     - "正文字号"（现有功能）：仅控制右栏（`ArticleReader`）阅读区正文的文字大小。
     - 两个调节项各自独立，互不影响；各自通过独立的 CSS 变量驱动渲染。
     - 系统字号变更后即时生效，无需刷新页面。
  4. **系统字号 CSS 变量**：新增或复用全局 CSS 变量（如 `--ui-font-size`），将其应用到左栏和中栏的根容器或关键文字元素上；确认 `ArticleReader` 不受此变量影响。
  5. **隐藏左栏按钮**：在应用名称"聚合拾遗"右侧（或 Layout 顶栏左侧区域）新增一个切换按钮，用于隐藏/显示左栏（订阅源侧栏）：
     - 点击按钮 → 左栏收起（带 CSS transition 动画，宽度 `0` 或 `auto`），中栏和右栏自动扩展填满剩余空间。
     - 再次点击 → 左栏恢复原始宽度（保持用户拖拽设定的宽度或默认值）。
     - 按钮图标随状态切换（如侧栏展开时显示 `◀` 或侧边栏图标，侧栏隐藏时显示 `▶` 或对应图标）。
     - 按钮在多语言切换时文案/tooltip 同步切换（中文："隐藏左栏"/"显示左栏"，英文："Hide Sidebar"/"Show Sidebar"）。
- **Affected Areas:** `src/components/Layout/Layout.tsx`（navItems 图标替换 + 隐藏左栏按钮）、`src/components/Layout/Layout.css`（按钮样式 + 侧栏动画）、`src/components/GeneralSettingsModal/GeneralSettingsModal.tsx`（新增系统字号调节项）、`src/components/GeneralSettingsModal/GeneralSettingsModal.css`、`src/components/FeedList/FeedList.css`（系统字号变量应用）、`src/components/ArticleList/ArticleList.css`（系统字号变量应用）、`src/components/ArticleReader/ArticleReader.css`（确认不受系统字号影响）、全局 CSS 变量定义文件、多语言资源文件。
- **Verification:**
  - 顶栏"AI"入口显示粗体 "AI" 两个字母，三套主题下视觉协调，点击仍可跳转 AI 设置页。
  - 顶栏"专题"入口显示新图标，与整体图标风格一致，点击仍可跳转专题页。
  - 打开通用设置弹窗 → "系统字号"和"正文字号"两个独立滑块 → 拖动"系统字号" → 左栏和中栏文字大小即时变化，右栏正文不变。
  - 拖动"正文字号"（现有功能）→ 仅右栏正文文字大小变化，左栏和中栏不变。
  - 两个字号设置重启后均保持用户上次选择。
  - 点击"隐藏左栏"按钮 → 左栏平滑收起（含动画过渡）→ 中栏和右栏扩展 → 按钮 tooltip 变为"显示左栏"。
  - 再次点击 → 左栏恢复展开 → 中栏和右栏恢复原始比例 → tooltip 变为"隐藏左栏"。
  - 左栏隐藏状态下，侧栏宽度拖拽分隔条不显示或禁用（避免拖出隐藏态下的异常宽度）。
  - 英文界面下按钮 tooltip 显示 "Hide Sidebar" / "Show Sidebar"。

### Task 4.2.2 - Content Pipeline: System Font Size & Sidebar Collapse Compatibility (张宇凡)

- **Task Detail:**
  1. **系统字号兼容性验证**：在左栏/中栏系统字号分别设为最小值和最大值（如 12px 和 20px）时，确认：
     - `FeedList` 中订阅源名称、组名、计数字的截断和省略号行为正常，不出现文字重叠或溢出。
     - `ArticleList` 中文章标题、摘要预览、来源名、时间戳的单行截断行为正常。
     - 标签 chips（彩色标签）在极端字号下尺寸协调，不遮挡文字。
  2. **正文字号隔离验证**：确认 Cleanded HTML/Markdown 渲染仅受"正文字号"CSS 变量控制，不被"系统字号"CSS 变量误影响。验证代码块、表格、列表、引用块在各正文字号下的排版正确性。
  3. **侧栏隐藏兼容性验证**：左栏隐藏后，确认：
     - 中栏文章列表和右栏阅读区的内容渲染正常，无横向溢出或布局错位。
     - 三种阅读模式（精简/网页/分栏）在左栏隐藏后均正常显示。
     - Cleaned HTML 中的宽表格、代码块在扩展后的阅读区内不会溢出。
  4. **综合边界验证**：系统字号调整 + 左栏隐藏/显示 + 中栏/右栏拖拽宽度组合操作下，内容区域始终可读且无内容丢失。
- **Affected Areas:** `content-cleaner.ts`（兼容性验证，无功能变更）、阅读模式渲染管线（精简/网页/分栏）。
- **Verification:**
  - 系统字号 12px → 左栏订阅源名称完整显示（长名截断加省略号）→ 中栏文章标题单行截断正常。
  - 系统字号 20px → 标签 chips 不遮挡标题文字 → 计数 badge 不溢出侧栏。
  - 拖动"正文字号" → 右栏正文变化 → Cleaned HTML 中代码块字体（等宽）不受系统字号影响，表格和列表排版正常。
  - 隐藏左栏 → 中栏扩宽 → 文章标题摘要利用额外宽度展示更多文字 → 右栏阅读区宽度增加 → 宽代码块不再需要横向滚动或正常显示。
  - 系统字号最小 + 左栏隐藏 + 网页阅读模式下，内容区域无横向溢出。

### Task 4.2.3 - Database: System Font Size & Sidebar Visibility Persistence (陈冠中)

- **Task Detail:**
  1. **系统字号持久化**：在 `AppSettings` 类型（`shared/types.ts`）中新增 `systemFontSize` 字段（`number`，默认值如 `14`，单位 px），与现有 `fontSize`（正文字号）字段并列。
  2. **侧栏可见性持久化**：在 `AppSettings` 类型中新增 `sidebarVisible` 字段（`boolean`，默认值 `true`）。
  3. **IPC 更新支持**：确保现有 `settings:update` IPC handler 支持 `systemFontSize` 和 `sidebarVisible` 的局部更新（与现有 `fontSize` / `fontTheme` / `visualTheme` 等字段同样的 partial update 模式）。
  4. **数据源接口同步**：更新 `DataSource` 接口中 `updateSettings` 的类型签名（如需）；同步更新 `IpcDataSource` 和 `MockDataSource` 的实现。
  5. **数据库迁移**（如需）：若 `AppSettings` 存储结构变更需要 migration，补充对应迁移脚本并确保旧版数据升级后默认值正确。
  6. **默认值兼容**：首次启动（无历史设置）时，`systemFontSize` 默认 `14`，`sidebarVisible` 默认 `true`；升级自旧版本时，缺失字段自动填充默认值，不影响现有功能。
- **Affected Areas:** `shared/types.ts`（`AppSettings` 类型扩展）、`electron/main/db/settings-repository.ts`（字段存储与读取）、`electron/main/index.ts`（`settings:update` IPC handler）、`src/data/ipcDataSource.ts`（接口实现）、`src/data/mockDataSource.ts`（mock 实现）、`src/types/dataSource.ts`（DataSource 接口签名，如需变更）、数据库 migration（如需）。
- **Verification:**
  - 修改系统字号为 16 → 重启应用 → 左栏和中栏文字保持 16px → 数据库中 `systemFontSize` 值为 `16`。
  - 修改正文字号为 18 → 重启 → 右栏正文保持 18px → 数据库中 `fontSize` 值为 `18` → `systemFontSize` 仍为 `16`，两者独立。
  - 隐藏左栏 → 重启应用 → 左栏保持隐藏状态 → 数据库中 `sidebarVisible` 为 `false`。
  - 旧版本升级（无 `systemFontSize` / `sidebarVisible` 字段）→ 启动后自动使用默认值（`14` / `true`），不报错。
  - Mock 模式下系统字号和侧栏可见性设置行为与 IPC 模式一致。

### Phase 4.2 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 张晨阳完成顶栏图标替换 + 系统字号 UI + 隐藏左栏按钮 → 接通陈冠中的持久化 → 张宇凡验证内容兼容性。
- **Verification:**
  - 顶栏"AI"图标为粗体字母、"专题"图标贴合设计语言，点击各自跳转正确页面。
  - 通用设置弹窗中"系统字号"和"正文字号"各自独立调节 → 左/中栏与右栏文字字号分别变化 → 重启后各自保持。
  - 点击"隐藏左栏" → 左栏平滑收起 → 中栏和右栏自动扩展 → 所有阅读模式内容正常 → 重启后左栏保持隐藏。
  - 系统字号调节 + 正文字号调节 + 左栏隐藏/显示 + 视觉主题切换的组合操作下，界面无闪烁、无布局错位、无内容丢失。

## Phase 4.3: Onboarding (New User Guide)

**Overall Goal:** 实现桌面端新手引导功能：首次启动自动触发全屏遮罩式引导，逐步骤介绍核心功能；用户可随时跳过，完成后不再自动弹出；设置页保留手动重新查看入口。

**Current Status (2026-08-02):** ✅ Task 4.3.1 与 Task 4.3.2 已完成。首次启动自动引导、设置页重新查看、12 步聚光定位、中英文文案、完成/跳过持久化和重启不再弹出均已接通；组件测试与真实数据库 Electron smoke 已通过。

### Task 4.3.1 - UI: Onboarding Overlay & Guide Flow (张晨阳)

- **Task Detail:**
  1. **触发机制**：检测 `AppSettings.onboardingCompleted`，首次启动（`false`）时自动触发新手引导；完成或跳过引导后设为 `true`，下次启动不再自动弹出。
  2. **引导浮层组件**：实现 `<OnboardingOverlay>` 全屏组件，包含：
     - 半透明遮罩层（封锁下方所有按钮的点击交互）
     - 高亮镂空区（被介绍的目标按钮/区域清晰可见，其余区域暗化）
     - 指示箭头（从悬浮卡片指向目标元素）
     - 悬浮步骤卡片（步骤标题 + 描述文字 + 进度指示点 + 操作按钮）
  3. **引导步骤**（共 12 步，按顺序介绍）：
     - 步骤 1 侧栏订阅源列表：介绍订阅源管理和分组
     - 步骤 2 添加订阅按钮：介绍添加 RSS/Atom 和 OPML 导入
     - 步骤 3 文章列表：介绍文章列表和已读/未读状态
     - 步骤 4 同步按钮：介绍单源同步和批量同步
     - 步骤 5 阅读区：介绍正文阅读和三种阅读模式
     - 步骤 6 隐藏左栏按钮：介绍反复点击切换左栏显示状态
     - 步骤 7 标签入口：介绍文章标签管理和 AI 标签建议
     - 步骤 8 笔记入口：介绍本地 Markdown 阅读笔记
     - 步骤 9 文摘入口：介绍多篇笔记整理和导出
     - 步骤 10 专题入口：介绍专题追踪、多源简报和演化时间线
     - 步骤 11 AI 功能按钮：介绍 AI 设置入口
     - 步骤 12 搜索框：介绍模糊搜索功能
  4. **步骤导航**：每步卡片底部提供"上一步""下一步""跳过引导"三个按钮；最后一步"下一步"替换为"开始使用"；支持进度指示点（`第 N / 12 步`）。
  5. **动态定位**：使用 `getBoundingClientRect()` + `ResizeObserver` + `window.resize` + `scroll` + `fullscreenchange` 事件实时跟踪目标元素位置，确保窗口缩放、全屏切换、侧栏拖拽/折叠时高亮镂空和箭头始终准确指向目标。
  6. **元素缺失处理**：若某步骤的目标元素因当前页面状态不可见（如未选中订阅源时无同步按钮），自动跳过该步骤，不中断引导流程；必要时通过 `requiredPage` 先导航到目标页面。
  7. **步骤切换动画**：步骤间切换使用 200ms fade 过渡，遮罩镂空位置平滑移动。
  8. **设置页入口**：在 `UnifiedSettingsPage` 中新增"新手引导"行，点击后重新触发完整引导流程。
  9. **多语言**：全部 12 步的标题、描述文案以及操作按钮文案纳入多语言资源（中/英）。卡片和按钮在不同语言切换时即时刷新。
- **Affected Areas:** 新增 `src/components/OnboardingOverlay/`（组件 + CSS + `useTargetRect` / `useOnboarding` hook）、`src/App.tsx`（集成 Overlay + 触发逻辑）、`src/pages/UnifiedSettingsPage/`（新手引导入口）、多语言资源文件。
- **Verification:**
  - 清空数据库或首次启动 → 自动弹出新手引导 → 遮罩覆盖全屏 → 下方所有按钮不可点击（仅卡片内按钮可交互）。
  - 12 个步骤依次介绍，每步高亮镂空准确指向目标元素，卡片标题和描述正确。
  - 点击"跳过引导"→ 遮罩和卡片消失 → 界面恢复可交互 → 重启后不再自动弹出。
  - 走完最后一步点击"开始使用"→ 引导完成 → `onboardingCompleted = true`。
  - 进入设置页 → 点击"新手引导"→ 从步骤 1 重新开始完整引导。
  - 引导过程中拖拽窗口 → 高亮和箭头实时跟随 → 无偏移无闪烁。
  - 引导过程中进入/退出全屏 → 高亮位置正确。
  - 引导过程中点击隐藏左栏 → 目标元素坐标更新正确。
  - 中英文切换 → 卡片内文案同步切换。
  - 浅色/深色/纸质三套主题下卡片文字和遮罩均可读。

### Task 4.3.2 - Database: Onboarding State Persistence (陈冠中)

- **Task Detail:**
  1. 在 `AppSettings` 类型（`shared/types.ts`）中新增 `onboardingCompleted` 字段（`boolean`，默认值 `false`）。
  2. 在 `DEFAULT_SETTINGS` 中同步添加默认值。
  3. 在 `electron/main/db/sqlite-settings.ts` 的 `isSettingValue()` 中新增 `onboardingCompleted` 的类型校验（`typeof value === 'boolean'`）。
  4. 旧版本升级兼容：缺失字段由 `merge()` 自动填充默认值 `false`（首次启动时触发引导），零 migration 负担。
- **Affected Areas:** `shared/types.ts`（`AppSettings` 接口 + `DEFAULT_SETTINGS`）、`electron/main/db/sqlite-settings.ts`（`isSettingValue` 校验）。
- **Verification:**
  - 首次启动（无历史设置）→ `onboardingCompleted` 为 `false` → 触发引导。
  - 完成引导后 → 数据库中 `onboardingCompleted` 值为 `true` → 重启后不再弹出。
  - 设置页重新触发引导 → `onboardingCompleted` 重置为 `false`。
  - 旧版本升级 → `onboardingCompleted` 自动填充 `false`，应用正常启动。

### Phase 4.3 Integration (张晨阳 + 陈冠中)

- 张晨阳完成引导浮层 UI + 触发逻辑 + 设置页入口 → 接通陈冠中的 `onboardingCompleted` 持久化。
- **Verification:**
  - 全新安装 → 自动弹出引导 → 完成 12 步走完 → 点击"开始使用"→ 引导关闭 → 重启 → 不再弹出。
  - 设置页 → 点击"新手引导"→ 引导重新开始 → 中途跳过 → 行为与初次一致。
  - 窗口缩放、全屏、侧栏折叠等操作不破坏引导定位。
  - 中英文切换不破坏引导文案。

## Phase 5: Cross-platform Acceptance

**Overall Goal:** 完成三平台验证、问题修复和课程交付准备。

- **张晨阳：** 检查 Windows、macOS、Linux 的窗口、字体、布局、快捷操作和多语言界面。
- **张宇凡：** 检查三平台网络请求、Feed 同步、文件导入导出和内容呈现。
- **陈冠中：** 检查 SQLite、凭证存储、AI Provider 和专题分析在三平台的运行情况。
- **全员：** 修复集成问题，整理演示数据、使用说明、开发文档和 Git 提交记录。
- **用户错误反馈加固（2026-08-02）：** Main 进程保留内容管线稳定错误码，Renderer 统一将同步、Feed、OPML、文件写入、数据库和 AI Provider 错误转换为可操作的中文提示；批量同步、批量标记、批量删除和 OPML 部分导入显示前 5 条逐项原因，内部错误码不直接暴露给用户。
- **Verification:** 三个平台均能启动应用并完成核心阅读流程；至少一个平台能够完整演示所有课程功能和专题简报流程；已知限制被明确记录。

## Project Completion Criteria

- 课程要求的 Feed/OPML、同步、内容清洗、摘要、翻译、多语言、日志、笔记导出和标签功能均可演示
- 专题追踪能够处理来自多个订阅源的文章并生成带原文引用的简报
- 数据默认保存在本地，应用不要求账号登录
- 三个平台均经过实际运行验证
- 每项任务能够通过项目文档和 Git 历史追溯到负责人和验证结果
