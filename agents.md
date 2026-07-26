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
- 桌面框架：Electron 31
- 构建工具：electron-vite
- Renderer：React 18 + TypeScript strict
- 自动化测试：Vitest
- 本地数据库：SQLite（sql.js WASM，内存态 + 磁盘持久化）
- AI 接入：用户可配置的 OpenAI-compatible Provider
- 打包发布：electron-builder（macOS DMG + Windows NSIS）+ GitHub Actions
- 目标平台：Windows、macOS、Linux

## 核心功能

- RSS、Atom、JSON Feed 和 OPML 解析
- 手动和批量 Feed 同步（逐源进度反馈 + 失败红点标记）
- 三栏阅读界面（订阅源 / 文章列表 / 阅读区）+ 拖拽调整宽度
- 文章列表、已读/未读、星标、模糊搜索和筛选
- 正文提取（Readability + JSDOM）、HTML 安全清洗（sanitize-html）、Cleaned HTML + Markdown
- 通用文章图片链路（懒加载/srcset/picture 规范化 + 多图保留 +
  `juhe-image://` Main 进程代理 + 旧缓存自动重洗）
- 可配置的 Summary Agent 和 Translation Agent（逐段流式翻译）
- 手动标签、标签筛选、Tag Agent 和标签管理
- 文章摘录、Markdown 笔记、多篇文摘导出（Markdown / HTML）
- 3 套字体主题（默认衬线 / 黑体无衬线 / 楷体）+ 2 套视觉主题（经典 / 纸质暖黄）
- 浅色 / 深色 / 跟随系统三档，纸质深色与经典深色一致
- 中文和英文界面即时切换
- 本地日志、日志导出和调试工具
- 专题创建、文章匹配、报道分组、时间线、来源比较和带来源引用的专题简报（Phase 4）

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
- 当修改对项目产生实质影响时，更新"当前状态"和"已知问题"。
- 将有价值的 Coding Agent 决策保存在项目文档和 Git 历史中，但不要记录普通对话和无关过程细节。

## 当前状态

截至 2026-07-26：

- **Phase 1–4.3、3.7、4.1 全部完成并通过验收**。`electron-vite build` + `npm run typecheck` 双端通过。
- **Phase 4.1 UI 完整闭环**（`8c410db` 张晨阳，4.1.2/4.1.3/4.1.5/4.1.6 由张宇凡/陈冠中在 `b0a7187`/`7478ae9` 落地）：
  - **Task 4.1.1 中栏顶部操作按钮**：`ArticleList` 加 `actionBar` slot（`data-testid="article-list__action-bar"`），仅具体 feed 显示（`all`/`unread`/`starred`/`tag:` 不显示，避免误操作）。同步按钮调 `ds.syncFeed(feedId)` + 底部进度条 + "新增 X，更新 Y" toast；全部已读按钮调 `ds.markAllReadByFeed(feedId)` + confirm dialog + 侧栏未读数实时更新。
  - **Task 4.1.1 标题前彩色标签 chips**（`ArticleList` + `ArticleReader`）：新建 `src/utils/article-title-tags.ts` 的 `parseArticleTitleTags(title)` 解析后端嵌的 `[tag:NAME|COLOR]` 前缀。`ArticleReader` 优先用 `articleTags` state + 兜底用 title 解析（处理 150ms 异步空窗期），按 name 去重。**Mock 模式同步行为**：`MockDataSource.rebuildArticleTitleTags(articleId)` 让 `tagAddToArticle` / `tagRemoveFromArticle` / `tagDelete` / `tagUpdate` 同步更新 `article.title` 前缀，与 IPC 后端一致（前端不需要再拉 IPC 拿 tag）。
  - **Task 4.1.1 TagsPage 双栏布局**：左栏标签 CRUD（picker 按钮整行可点 + 选中态 `is-selected`）+ 右栏选中标签下的文章列表（标题 + 来源 + 时间 + 点击跳阅读器）。实时同步：标签增删 / 选中切换 / 文章加 tag → 右栏文章列表 + 中栏标题 chips 同步更新。
  - **Task 4.1.4 OPML 选择性导出子界面**（`src/pages/OpmlExportPage/`）：列表展示订阅源（`checkbox` + name + url），默认全选，顶栏"全选"/"取消全选"切换，已选 `N/N` 计数实时显示，取消/确认按钮（确认 disabled 当 0 已选）。确认导出调 `ds.opmlExport(feedIds)` → IPC `opml:export` 传 `feedIds`。`AppPage` 加 `'opml-export'`，`OpmlButtons.onExport` 改 `setCurrentPage('opml-export')` 路由跳转。**真根因修复**：默认全选 `useEffect` 监听 `[feeds, selected.size]` → 用户点"取消全选"→ `selected.size=0` → useEffect 重置全选（死循环）。**修法**：加 `initialized` 标志，只在首次加载默认全选。
  - **新探针**：`smoke:feed-actions` 18 项全过（action bar 显示/隐藏 + 标签渲染 + TagsPage 双栏 + UI 创建 tag）；`smoke:opml-export-selection` 17 项全过（默认全选 5/5 + 取消全选 0/5 + 取消勾选 1/2 项 + 确认导出 hook 验证传 `N-2` 个 feedId + 回到 reader）。
  - **smoke-2.4 探针适配**：`handleOpmlExport` 改路由后，原探针"点导出按钮"破坏三栏（currentPage 跳到 `opml-export` → article list unmount）。**修法**：探针直接调 `window.api.opml.export()` 验证 IPC 链路，不再点按钮（点按钮的 UI 测试归 smoke-4.1.4）。
  - **数据层**：`dataSourceFactory` 在 `?mock=1` 时把 `MockDataSource` 实例挂到 `window.__JUHE_DS__`（smoke 探针 hook mock 端方法用，零侵入生产）。`console-message` 转发兼容 Electron 28+ 新签名（event 对象含 message）。
- **Phase 4.1 内容管线后端增量完成**（`b0a7187` 张宇凡 + `7478ae9` 陈冠中）：
  - 单源同步结果包含 `fetching / parsing / saving / completed / failed` 阶段历史、当前进度、新增/更新数与稳定错误码。
  - `ArticleRepository.markAllReadByFeed(feedId)` 批量标已读 + `tagAddToArticle` / `tagRemoveFromArticle` / `batchAdd` 同步回写文章标题标签标记（事务性）。
  - 选择性 OPML 导出支持已选 Feed ID、空选择回退全量、未知 ID 跳过，并在 Main IPC 入口校验参数。
  - `smoke:phase2` 10 项报告字段全部通过，覆盖单源阶段、失败错误码及选择性 OPML 导出/导回。
- **Phase 3.7 搜索解耦 + 列表分页**（`1a84fbd` 张晨阳，3.7.2/3.7.3 由张宇凡/陈冠中在 `32b5b38`/`03432f8` 落地）：
  - **搜索解耦（核心修复）**：`SearchBar.onSelect` 签名 `(articleId: string)` → `(article: Article)` 完整对象。`App.handleSearchSelect` 复用 `handleTopicOpenArticle` 同款 `externalSelectedArticle` 模式，不再依赖 `articles.find()` 内存数组查找。**真根因**：旧实现用 `articles.find((a) => a.id === articleId) ?? allArticles.find(...)`，但内存数组只有当前分页前 50 条，搜索结果在第 51+ 篇时找不到 → `pushToast('该文章已不在当前列表中')`。
  - **列表分页（50/页）**：`DataSource.articles` 透传 `limit + offset` 给后端（`ArticleRepository.list` 已支持 `LIMIT ? OFFSET ?`）。App 维护 `articleOffsetRef` (useRef 而非 state) + `articleTotal` state + `loadingMore` state。**死循环真根因**：`articleOffset` 改成 state 后，setState 让 `refreshArticles` 引用变 (deps 包含 offset) → useEffect 2 (selection.feedId 监听) 重跑 → refreshArticles 再调 → setArticleOffset 再变 → 死循环 ("App refreshArticles" 日志刷屏 100+ 次)。**修复**：用 `useRef` 替代 state，set 不触发 re-render，refreshArticles 引用稳定，useEffect 只在 `selection.feedId` 变时跑。
  - **DataSource interface 扩展**：`getArticle(id)` (陈冠中 3.7.3) + `lastArticleTotal(): number` (UI 端同步 getter，IPC 已从 `result.total` 缓存)。IpcDataSource + MockDataSource 各自实现。
  - **ArticleList UI 扩展**：新增 `total` / `hasMore` / `onLoadMore` / `loadingMore` props；countText 显示 `X / Y` (有更多时) 或 `X` (无更多时)；底部"加载更多"按钮 (`data-testid="article-list__load-more"`)，按 `hasMore` 条件渲染。
  - **新 smoke 探针**：`smoke:search-pagination` 9 项全过（计数 testid / hasMore 边界 / starred=3 / all=10 重置 / 搜索解耦 reader 标题 === 下拉项标题）。
- **侧栏 2 个 bug 修复**（`01e4e0a` + `0cc80a6`）：侧栏可滚动（`.feed-list__body` flex:1 1 0 + overflow-y:auto）+ `...` 改为"批量管理"模式（替代展开/折叠/删未用三个低频操作；`batchMode` + `selectedForBatch: Set<string>` + batch toolbar + 每行 checkbox + 选中行加 accent-soft 背景；批量模式点击行 toggle 选中 + 右键菜单禁用）。`smoke:feeds-group` 36 → 39 项。
- **... 菜单 escape 定位真根因修复**（`87d3830` + `78db525`）：`.feed-list__topbar-actions` 加 `position: relative`（最近 positioned 祖先之前都没设 → 菜单逃到 body 级别被 `.feed-list` `overflow:hidden` 裁掉）。**DOM 存在 ≠ 视觉可见**：smoke 探针加 4 项 visual check (`moreMenuHasSize` / `moreMenuInViewport` / `moreMenuInsideFeedList` / `moreMenuHitTest`)。
- **P2 体验打磨**（`f6468df` + `21d86d6`）：黑暗模式对比度审计（WCAG AA 4.5:1，11 个 CSS 文件硬编码错误色 → `var(--err)` / `var(--ok)` / `var(--warn)`；index.css 新增 `--warn` 变量 light #d97706 / dark #fbbf24）。Empty state 文案统一为"还没有 X" + 操作指引。键盘快捷键 j/k 切文章（自动 mark read）、Shift+J/K 切订阅源、o 打开原文、s 切换星标、Cmd/Ctrl+F 聚焦搜索框、Esc 退出。新增 IPC `SHELL_OPEN_EXTERNAL: 'shell:openExternal'`（URL 协议白名单 http(s)）。
- **v0.3.0 release 已发布**（`bed056f` + tag `v0.3.0` + `26a29dc`）：`package.json` 0.2.2 → 0.3.0，RELEASE_NOTES_v0.3.0.md 5.5KB（侧栏三件套 + 专题演化图 + 通用图片代理 + 三种阅读模式）。GitHub Actions 自动构建 + 2 个 artifact 发布：Juhe-Shiyi-0.3.0-arm64.dmg (104.7 MB) + Juhe-Shiyi-Setup-0.3.0-x64.exe (83.3 MB)，总耗时 2m20s。
- **订阅源侧栏真分组**（`c1325df`）：添加组 / 移动到组 / 删组（组内移到"未分组"） + ContextMenu `submenu` 字段。
- **侧栏三件套落地**（`e1aee96`）：`...` 菜单（tab=sources 展开/折叠、tab=tags 删除未使用标签）、标签 `×` 单删 / 批量删未用、组别 `▸/▾` 折叠（localStorage 持久化）、**tab 状态 localStorage 持久化**（修复 `refreshFeeds` 触发 unmount/remount 后 tab 被踢回 sources 的隐藏 bug）。
- **专题演化图 + 端到端接入**（`c428688` 张宇凡）：v7 migration 增 `topics` / `topic_articles` / `topic_graph_cache`；5 方向泳道（发布与能力 / 产品与应用 / 安全与治理 / 成本与部署 / 观点与解读）；TopicDetail 4 tab → 3 tab（graph / articles / briefing）；MVP 不消耗 AI token（候选发现阶段用 `source_signature` 缓存）。
- **通用文章图片链路**（`399d3c8` 张宇凡 + `bb57450` 陈冠中 + `f1eeb48` 陈冠中）：清洗器统一处理 `data-src` / `data-original` / `srcset` / `picture` / `noscript` / 多图 `figure`；Renderer 将正文 HTTP(S) 图片改写为 `juhe-image://`；Main 代理三策略（原文来源 / 图片同源 / 无来源）+ 25 MB 上限 + 图片类型校验；`file://` 协议不发 Referer 修少数派 CDN 防盗链；migration 8 自动重洗旧 Cleaned HTML。
- **侧栏精确计数**：`ArticleRepository.countAll/countUnread/countStarred` + `article:counts` IPC。
- **侧栏按 tag 分类**（`ec0c49e`）：`ARTICLE_COUNTS_BY_TAG` IPC + `tag:${string}` 模板字面量类型 FeedSelector + `parseTagSelector`；`useSelection` 闭包陈旧 bug 修复（用 `stickyTabRef` 替代 `useCallback` 闭包）。
- **翻译 UX**：`filterInlineMarkdown` 仅保留粗体/斜体/下划线；逐段流式翻译 + 翻译/摘要并存（`activePanel: Set<AiPanel>`）；`SplitController` token 计数修 React 18 StrictMode dev 双调永远卡 loading。
- **同步进度条**：底部实时进度（"正在同步：XXX 进度：N/M"）+ done 态 3 秒延迟 + 失败红点。
- **三种阅读模式**（`e25343a` 张宇凡 + `9aef239` 张宇凡）：精简阅读 / 网页 / 分栏（左右各半），通过 `useReaderMode` hook + `shared/article-webview.ts` + 主进程 `installArticleWebviewSecurity`。
- **GitHub Release 自动化**：`.github/workflows/release.yml` 推 `v*` tag → build-mac (DMG) + build-win (NSIS) + release job。
- **20 个 smoke + 104 单元测试全过（另 6 个需外网的真实 Feed 测试按设计跳过）**：smoke-1.1 / 2.1 / 2.3 / 2.4-ui-ipc / 2.5 / 3.3 / 3.4-integration / 3.5.1 / 3.5.2-ui / 3.5.2-split-error / 3.5.3-coexist / 3.5.4-tagmanage / 4.1 / phase2 / reader-modes / taglist / feeds-group / **search-pagination** / **feed-actions** (Phase 4.1.1：action bar 显示/隐藏 + 标签渲染 + TagsPage 双栏 + UI 创建 tag) / **opml-export-selection** (Phase 4.1.4：默认全选 + 取消/确认 + 传 N-2 feedId)。以上 20 个 smoke 均已在本轮逐项复验并核对报告字段。
- `shared/types.ts` + `shared/ipc.ts` 作为权威协议源；跨模块接口变更需同步更新并通知。

## 设计决策

- 已确定使用 Electron + React + TypeScript 开发跨平台应用。
- 已确定使用 SQLite（sql.js WASM）作为本地持久化层。
- 应用采用本地优先设计，不要求自有账号或自有云服务。
- AI Provider 由用户配置，并通过统一的 Provider 接口访问。
- 只有在用户启用相关 AI 功能时，才可以将文章内容发送给用户配置的模型服务。
- 外部文章内容必须经过正文提取和安全清洗后才能显示。
- Renderer 不得获得不受限制的 Node.js 访问能力。
- 专题追踪和带来源引用的多源简报是项目的核心差异化功能。
- AI 结论必须保留支持该结论的原始文章引用。
- 开发过程按照 `PLAN.md` 中的阶段和验收节点进行。

## 路线图

1. Phase 1–4.3、3.7：✅ 全部完成
2. Phase 5：v0.3.0 release 已发布（`v0.3.0` tag + 2 个 artifact）/ 三平台 UI 验证 / 课程交付资料准备（进行中）

详细任务和验收标准位于 `PLAN.md`，本文件不重复记录任务级进度。

## 近期记录（按 commit 倒序）

- **`1a84fbd`（张晨阳）**：Phase 3.7.1 搜索解耦（核心修复） + 列表分页（50/页） + 加载更多按钮 + 计数 testid。`SearchBar.onSelect` 签名 `(articleId: string)` → `(article: Article)` 完整对象，App `handleSearchSelect` 复用 `handleTopicOpenArticle` 同款 `externalSelectedArticle` 模式不再依赖 `articles.find()` 内存数组查找（旧 bug：第 51+ 篇搜索结果找不到 → `pushToast('该文章已不在当前列表中')`）。`articleOffsetRef` 改 `useRef` 修死循环真根因（state 模式 → setState 让 `refreshArticles` 引用变 → useEffect 重跑 → setArticleOffset 再变 → 死循环，"App refreshArticles" 日志刷屏 100+ 次）。DataSource interface 加 `lastArticleTotal(): number` 同步 getter（IPC 已从 `result.total` 缓存）；ArticleList 新增 `total` / `hasMore` / `onLoadMore` / `loadingMore` props + `data-testid="article-list__count"` + 底部"加载更多"按钮。新增 `smoke:search-pagination` 9 项全过。
- **`87d3830`（张晨阳）**：... 菜单 escape 定位真根因 — `.feed-list__topbar-actions` 加 `position: relative`（最近 positioned 祖先之前都没设 → 菜单逃到 body 级别被 `.feed-list` `overflow:hidden` 裁掉）。**DOM 存在 ≠ 视觉可见**：smoke 探针加 4 项 visual check (`moreMenuHasSize` / `moreMenuInViewport` / `moreMenuInsideFeedList` / `moreMenuHitTest`)。
- **`01e4e0a`（张晨阳）**：侧栏 2 个 bug — 可滚动（`.feed-list__body` flex:1 1 0 + overflow-y:auto）+ `...` 改为"批量管理"模式（替代展开/折叠/删未用三个低频操作；`batchMode` + `selectedForBatch: Set<string>` + batch toolbar + 每行 checkbox + 选中行加 accent-soft 背景；批量模式点击行 toggle 选中 + 右键菜单禁用）。`smoke:feeds-group` 36 → 39 项。
- **`f6468df`（张晨阳）**：P2 体验打磨 — 黑暗模式对比度审计（WCAG AA 4.5:1，11 个 CSS 文件硬编码错误色 → `var(--err)` / `var(--ok)` / `var(--warn)`；index.css 新增 `--warn` 变量 light #d97706 / dark #fbbf24）。Empty state 文案统一为"还没有 X" + 操作指引。键盘快捷键 j/k 切文章（自动 mark read）、Shift+J/K 切订阅源、o 打开原文、s 切换星标、Cmd/Ctrl+F 聚焦搜索框、Esc 退出。新增 IPC `SHELL_OPEN_EXTERNAL: 'shell:openExternal'`（URL 协议白名单 http(s)）。
- **`bed056f`（张晨阳）**：v0.3.0 release — AGENTS.md 同步到 2026-07-24，`package.json` 0.2.2 → 0.3.0，RELEASE_NOTES_v0.3.0.md 5.5KB。GitHub Actions 自动构建 + 2 个 artifact 发布：Juhe-Shiyi-0.3.0-arm64.dmg (104.7 MB) + Juhe-Shiyi-Setup-0.3.0-x64.exe (83.3 MB)，总耗时 2m20s。
- **`e1aee96`（张晨阳）**：侧栏 3 个 bug — `...` 菜单（展开/折叠 / 删未用标签）/ 标签 `×` 单删 + 批量删 / 组别 `▸/▾` 折叠 + tab state localStorage 持久化。**真根因是 `refreshFeeds` 第一行 `setFeedsState({kind:'loading'})` 触发 FeedList unmount/remount，tab state 丢失**。`smoke:feeds-group` 17 → 36 项。
- **`c1325df`（张晨阳）**：订阅源侧栏真分组（添加组 / 移动到组 / 删组）+ `ContextMenu` `submenu` 字段 + `AddGroupDialog`。
- **`ff4b9a8`（张晨阳）**：AGENTS.md 同步 4.3 + 侧栏 tag 修复；`smoke:topic` 9 → 13 项。
- **`ec0c49e`（张晨阳）**：侧栏按 tag 真分类 + `ARTICLE_COUNTS_BY_TAG` IPC + `tag:${string}` 模板字面量类型 FeedSelector + 修 `handleSuggestTags` 闭包陈旧。
- **`ff54505`（张晨阳）**：单添加入口（删 FeedList 内联表单）+ 落地标签管理（5 handlers 接 IPC）+ 粘性底部面板（mousemove 全局 + 高度 localStorage 持久化）。
- **`996b322`（张晨阳）**：摘要 toggle + 摘要/翻译并存（`activePanel: Set<AiPanel>` + 4 辅助函数）。
- **`7fce48c`（张晨阳）**：split 永远卡 loading 真根因 — `SplitController` token ref 跨 mount 共享 + 8 单元测试覆盖 StrictMode 双调。
- **`c428688`（张宇凡）**：专题演化图 + 文章关联（v7 migration + `topics`/`topic_articles`/`topic_graph_cache` + 5 方向泳道 + `topicGetGraph` IPC + `TopicGraphView` 组件 + `smoke-4.1` 升级）。
- **`399d3c8`（张宇凡）**：统一代理文章图片并兼容跨站显示。
- **`e25343a`（张宇凡）**：网页与分栏阅读模式（`useReaderMode` + `installArticleWebviewSecurity`）。
- **`d834b59`（张宇凡）**：v0.2.2 release tag。

## 已知问题

- **API Key 明文存储**：`ai_providers.api_key` 以明文写入 SQLite。计划 Phase 5 用 `safeStorage.encryptString/decryptString` 加密（Linux 降级到 libsecret）。A 写主进程集成 + smoke 探针；陈冠中 review + 同步 migration。
- **部分数据库仓储缺少单元测试**：Tag / Note / Digest / AIProvider / AiResultCache 的测试覆盖不足（Phase 5 增量补齐）。
- **AI 真实生成未被自动化测试覆盖**：smoke 探针中 AI section 允许 skipped（需真 API key）。
- **跨平台行为测试**：仅在 Windows 跑过完整 smoke + dist:win；macOS / Linux 待张宇凡、陈冠中验证（`npm run dist:mac` / Linux build）。
- **npm audit**：Electron 31、Vite 5/electron-vite 2 存在 4 组工具链公告（2 moderate、2 high），需在发布前升级。
- **不同 OpenAI-compatible Provider 兼容性**：当前默认测过 1 家 Provider，需在多 Provider 上兼容性测试。
