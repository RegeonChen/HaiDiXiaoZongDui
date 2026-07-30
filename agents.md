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
- 桌面框架：Electron 43
- 构建工具：electron-vite 5 + Vite 7
- Renderer：React 18 + TypeScript strict
- 自动化测试：Vitest 4
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

截至 2026-07-30：

- **Phase 4.3.1 新手引导浮层 UI 落地**（张晨阳，4.3.2 陈冠中在 `71abd32` 提前落地 `onboardingCompleted` 字段 + 持久化）：
  - **触发机制**（`App.tsx`）：检测 `appearance.onboardingCompleted=false` + `feedsState.ready` + `articlesState !== 'loading'` → 200ms 缓冲后自动开浮层。**真根因**：仅等 `appearance.loaded` 会让 `feedsState.loading` 期间浮层先开 → Layout 内是 LoadingView → `useOnboarding.isElementReady(0)` 看 DOM 找不到 `.pane-feeds .feed-list` → useEffect 内部自动 next 跳到 step 4 (reader)，所有引导步骤错位（initialStepIsSidebarFeeds=false, step0_index=false, …, step7_index=true）。**修法**：触发条件加 `mainUiReady = feedsState.ready && articlesState !== 'loading'`，等主界面 DOM 准备好再开。
  - **浮层组件**（`src/components/OnboardingOverlay/`，4 文件 + 1 CSS）：8 步全屏遮罩 + 4 块围挡挖出镂空区 + 强调色边框 + 固定底部中央卡片（标题/描述/进度点/上一步/下一步/开始使用/关闭）+ SVG 曲线箭头（卡片顶部中央 → 目标元素中心）。200ms fade 过渡。
  - **8 步定义**（`onboardingSteps.ts`）：侧栏订阅源 / 添加订阅 / 文章列表 / 同步按钮 / 阅读区 / 隐藏左栏 / AI 助手 / 搜索框；每步 selector + 中英 i18n。
  - **动态定位 Hook**（`useTargetRect`）：`getBoundingClientRect` + 200ms 轮询 + `resize` / `scroll` (capture) / `fullscreenchange` 事件实时跟随；返回 null 当元素 0×0 / display:none。
  - **步骤状态 Hook**（`useOnboarding`）：`currentStepIndex` + 元素缺失自动 next 跳到 ready 步 + 边界保护（最后一步全缺失 → 视为完成，由父组件 `onComplete`）。
  - **多语言**（`onboardingSteps.ts` + `useAppearance`）：8 步 title/description 中英双语；按钮文案 + 进度文案通过 `appearance.language` 即时切换。
  - **设置页入口**（`UnifiedSettingsPage.tsx`）：通用 / AI / 日志设置区上方加"新手引导"快速入口卡片（仅在 `onStartOnboardingTour` prop 提供时显示）；点击 → `App.startOnboardingTour` → 重置 `onboardingResetKey` 重新打开浮层。
  - **App 集成**（`App.tsx`）：`closeOnboarding` 调 `appearance.setOnboardingCompleted(true)` 持久化；`startOnboardingTour` 重置 reset key 强制重新从 step 0 开始。
  - **useAppearance 扩展**：`AppearanceSettings` 加 `onboardingCompleted: boolean`（默认 false） + `setOnboardingCompleted` setter；监听 `juhe:settings-changed` 事件让 mock 模式下直接调 `ds.settingsUpdate` 改语言时 React 同步刷新。
  - **MockDataSource 同步**：`MockDataSource.settingsUpdate` 派发 `CustomEvent('juhe:settings-changed', { detail })` → 跨组件同步 settings 变更（IPC 模式不派发，依赖 `useAppearance.setXxx()` 直接 setState）。
  - **runSmokeTest 统一关闭引导**（`electron/main/index.ts`）：除 `smokeOnboarding` 探针外，所有 smoke 探针在 800ms 等待后**先**用 `executeJavaScript` 点 skip 按钮关闭 OnboardingOverlay，避免 z-index 9999 遮罩影响其他探针的 hit test / click（smoke:feeds-group 改前 `moreMenuHitTest=false`，加这一步后 PASS）。
  - **新 smoke 探针** `smoke:onboarding`（`scripts/smoke-4.3.1.cjs`）：走 mock 模式，9 项验收（首次启动自动弹 / 8 步按 next 推进 / 跳过 → 持久化 / 走完最后一步 → 完成 / 设置页入口重启 / resize 事件跟随 / 收起目录跟随 / 中英文切换 / 三主题卡片可读 / 每步 querySelector + boundingRect 实测）。
- **22/22 smoke + 130 单测全过**（2026-07-30 22:30）：新增 `smoke:onboarding` 后 22 个 smoke 探针全过；smoke:feeds-group 等 13 个既有探针加 runSmokeTest skip-onboarding 保护后无回归；130 单测全过。
- **v0.3.1 release 已发布**（`639de80` + tag `v0.3.1`）：完成 IDE 四段式工作台、文章上下文 AI 对话、搜索分页与订阅源操作闭环、新应用图标和内容清洗增强；同步将 `fast-xml-parser` 升级至 5.10.1，生产依赖审计为 0 项已知漏洞。发布前通过 typecheck、130 项单测、生产构建与 12 组关键 Electron/IPC smoke；GitHub Actions 成功生成并发布 `Juhe-Shiyi-0.3.1-arm64.dmg` 与 `Juhe-Shiyi-Setup-0.3.1-x64.exe`，远端下载后的版本、图标资源与 SHA-256 均已复核。
- **应用图标已完成跨平台工程化（`0497eb6` 原始设计 + `f437fad` 圆角方向 + `6e2c596` 资源处理，合并于 `1b74960`）**：保留团队提交的象牙米黄奏章造型与透明圆角意图，将误用 `.png` 扩展名的 JPEG 美术源改为 `art/icon-source.jpg`，裁去过量外边距并增加透明圆角安全区；输出 1024×1024 打包 PNG、512×512 运行时 PNG 和 128×128 favicon。生产环境通过 `extraResources` 从 `process.resourcesPath/icon.png` 读取窗口图标，避免引用不会进入应用包的 `build/` 路径。`verify:icons` 检查真实格式、尺寸、RGBA 与透明/不透明像素；macOS DMG 的 ICNS 与源 PNG 逐像素一致，Windows EXE 内含 16–256 七档图标。
- **IDE 工作台四段式布局（`8ca0998`，已发布）**：页面固定为“竖向功能栏 / 一级订阅源目录 / 二级文章目录 / 灵活窗口”。打开文章、标签、笔记、文摘、专题或设置时，前两级目录保持挂载且不被页面替换；仅最右灵活窗口切换内容。灵活窗口顶部保留可切换、可关闭的 IDE 标签条，但不创建永久“阅读器”标签。一级/二级目录分别设 218px/260px 最小宽度，工具按钮统一禁止文字换行。添加订阅源、导入 OPML、导出 OPML和添加订阅源组统一收进一级目录右上角“+”菜单。顶栏小三角、左上角重复阅读入口和右上角全局同步按钮均已移除；在阅读界面重复点击竖向首个“阅读”功能键，目录按“全开 → 收起一级 → 再收起二级 → 全开”循环，从其他页面点击则只返回阅读。“所有订阅源”与具体订阅源统一在二级目录标题下显示“同步 / 全部已读”，前者作用于全部源、后者只作用于当前源；未读、星标和标签筛选不显示范围含糊的批量操作。`Layout.test.ts` 验证固定结构、最小宽度、重复入口移除和三态目录，`FeedList.test.ts` 锁定“+”菜单操作。
- **灵活窗口采用 VS Code 预览标签语义**：普通单击文章、标签、笔记、文摘、专题或设置时，只复用一个斜体预览标签，后续普通打开原位替换；双击文章或双击标签页后转为固定标签，固定项不再被预览替换。关闭和切换标签继续保留原有行为。
- **代码审查修复（`8ca0998`，已发布）**：移除受 50 条分页限制却被误当作全集的 `allArticles` 缓存；删除确认和单源未读数改用数据库精确计数。切换订阅源会退出旧文章标签态，关闭文章或删除来源会同步清理文章快照；已读/星标写入改为成功后更新界面并显式报告失败。本地日志已接入设置工作区，Main 进程以 2 MB 轮转 JSONL 持久化脱敏后的启动、同步和 OPML 事件，并支持原生保存对话框导出。
- **AI Provider 凭证安全存储（Phase 5）**：新建和更新的 API Key 通过 Electron `safeStorage` 加密后，以 `safe-storage:v1:` 版本化密文写入 SQLite；应用启动时幂等迁移历史明文。macOS 使用 Keychain、Windows 使用 DPAPI；Linux 只接受 libsecret/KWallet 等安全后端，检测到 `basic_text` 时拒绝保存新 Key。列表与 Renderer 仍只获得 `apiKeySet`，解密后的 Key 仅在 Main 进程调用 Provider 时短暂使用。
- **开发工具链升级（Phase 5）**：Electron 31 → 43、electron-vite 2 → 5、Vite 5 → 7、Vitest 3 → 4、electron-builder 26.15.3 → 26.15.7；完成 TypeScript 双端检查、136 项单测、生产构建以及凭证、UI/IPC、阅读模式三组 Electron smoke。生产依赖审计保持 0 项；Electron/Vite 直接公告已消除。
- **Phase 1–4.2、3.7、4.1、4.2 已完成并通过验收；Phase 4.3 仅完成数据库设置字段，UI 新手引导与端到端验收仍在进行。**
- **Phase 4.2.1 Navbar 图标 + 系统字号 + 侧栏折叠**（张晨阳，4.2.3 陈冠中在 `ec45c68` 落地 AppSettings 字段 + 持久化）：
  - **Task 4.2.1.1 AI 入口图标 → 粗体 "AI" 字母**（`Layout.tsx`）：navItems 用 `iconType='ai-bold'` 渲染 `<strong class="app-header__nav-icon--ai">AI</strong>`，font-weight 800 + letter-spacing -0.04em 让两字母紧凑如一个 logo；三主题下 active 态 `var(--accent)`、hover 态继承 fg-soft。
  - **Task 4.2.1.2 专题入口图标 → 多源聚合 SVG**（`Layout.tsx`）：navItems 用 `iconType='topics-svg'` 渲染一个 14×14 SVG（两个左侧源点 + 一个右侧中心点 + 两条汇聚线），stroke 颜色继承 currentColor，`var(--fg-soft)` 默认色 / `var(--accent)` active 态。
  - **Task 4.2.1.3+4 系统字号 + 正文字号独立滑块**（`GeneralSettingsModal.tsx`）：在"排版"section 加"系统字号"行（10-24 范围，默认 14，testid `general-modal__system-font-size`，hint 文案"影响左/中栏"）+ 调整现有"正文字号"hint 文案"仅影响右栏"。两字号各自通过 `useAppearance.setSystemFontSize` / `setFontSize` 走 IPC 持久化。
  - **Task 4.2.1.5 阅读键三级目录循环**（`Layout.tsx` + `App.tsx`）：原应用名右侧 `app-header__sidebar-toggle` 小三角已移除。阅读页重复点击竖向首个“阅读”功能键，`DirectoryMode` 按 `both → secondary → none → both` 循环；从其它页面点击只返回阅读，不触发折叠。
  - **Layout 主区折叠**（`Layout.tsx` + `Layout.css`）：`directoryMode='both'` 渲染两级目录与 2 个 ResizeHandle；`secondary` 收起一级目录、保留二级目录与 1 个 ResizeHandle；`none` 收起两级目录、只保留灵活窗口且无 ResizeHandle。三态均不改变最右灵活窗口及其 IDE 标签条。
  - **CSS 变量应用**（`index.css` + `FeedList.css` + `ArticleList.css`）：index.css 加 `--ui-font-size: 14px; --font-size: 16px; --reading-width: 800px;` 默认值（深色主题同样）。`FeedList` / `ArticleList` 根容器 `font-size: var(--ui-font-size)`，子元素用 em（13/14=0.93、12/14=0.86、11/14=0.79、10/14=0.71、9/14=0.64）相对缩放。`ArticleReader` **不**引用 `--ui-font-size`（保持阅读区独立），确认 PLAN 4.2.1.4 验收。
  - **useAppearance 扩展**（`useAppearance.ts`）：`AppearanceSettings` 加 `systemFontSize: number` + `sidebarVisible: boolean` 字段；`DEFAULTS` 默认 14 / true；`applyToHtml` 新增两个参数（独立写 `--ui-font-size` 和 `data-sidebar-visible`）；hook 返回 `systemFontSize` / `sidebarVisible` + `setSystemFontSize` / `setSidebarVisible` setters。`update` 函数 patch 类型扩展支持新字段。
  - **MockDataSource 设置支持**（`mockDataSource.ts`）：mock 模式维护 `private settingsState: AppSettings`（含 systemFontSize/sidebarVisible），`settingsGet` 返回 ready + state，`settingsUpdate` 修改 state 并返回，与 IPC 后端行为一致；`sidebarVisible` 继续持久化一级目录是否展开。
  - **App.tsx 接线**（`App.tsx`）：本地 `directoryMode` 控制即时三态，首次加载用 `appearance.sidebarVisible` 恢复“全开/仅二级”状态；第一次收起一级和第三次全部展开时同步 `setSidebarVisible(false/true)`。
  - **升级探针** `smoke:phase4.2`（`scripts/smoke-4.2.cjs` + `electron/main/index.ts`）覆盖
    - AI 粗体字母（strong 元素 + 文本 "AI"）
    - 专题 SVG（svg 元素 + 3 个 circle + 2 个 path）
    - 顶栏小三角不存在，阅读键初始 title 为“收起一级目录”
    - 第一次点击：一级目录隐藏、二级目录保留、1 个 ResizeHandle
    - 第二次点击：两级目录均隐藏、0 个 ResizeHandle、只剩灵活窗口
    - 第三次点击：两级目录及 2 个 ResizeHandle 同时恢复
    - 通用设置弹窗"系统字号"滑块存在 + 默认值 14
    - 改到 20 → `<html>` `--ui-font-size: 20px` + FeedList + ArticleList 根 fontSize=20px + 子元素 em 缩放 18.6px
    - 关闭弹窗后 ArticleReader 不受影响（fontSize 仍 14px + `--font-size` 仍 16px）
    - MockDataSource state systemFontSize=20（持久化语义）
  - **smoke 模式扩展**：`useMock` 判定扩展支持 `smokePhase42` 走 mock 模式（之前只 `smokeUi && !smokeUiReal`）；探针设 `JUHE_SHIVI_SMOKE_PHASE42=1` 但**不**设 `JUHE_SHIVI_SMOKE_UI`（否则 smokeUI 探针会先命中 if/else 链、smokePhase42 永不执行）。
  - **smoke:phase4.2 全过**：AI 粗体字母 / 专题 SVG / 小三角移除 / 阅读键 `both → secondary → none → both` 完整循环 / ResizeHandle 2→1→0→2 / 系统字号 14→20 / reader 字号独立 / MockDataSource 持久化。
- **Phase 4.1 UI 完整闭环**（`8c410db` 张晨阳，4.1.2/4.1.3/4.1.5/4.1.6 由张宇凡/陈冠中在 `b0a7187`/`7478ae9` 落地）：
  - **Task 4.1.1 中栏顶部操作按钮**：`ArticleList` 加 `actionBar` slot（`data-testid="article-list__action-bar"`）。“所有订阅源”和具体 feed 统一显示“同步 / 全部已读”；`unread`/`starred`/`tag:` 不显示，避免作用范围含糊。具体源同步调 `ds.syncFeed(feedId)` 并轮询 `ds.syncProgress()`；全局同步复用 `handleSyncAll`。具体源全部已读先通过 `ds.articleCount({ feedId, isRead:false })` 取精确数量；全局则通过 `ds.articleCount({ isRead:false })` 取精确总数并逐源调用现有 `markAllReadByFeed`，不扩大共享 IPC 协议。成功与失败均刷新列表和侧栏计数。
  - **Task 4.1.1 标题前彩色标签 chips**（`ArticleList` + `ArticleReader`）：新建 `src/utils/article-title-tags.ts` 的 `parseArticleTitleTags(title)` 解析后端嵌的 `[tag:NAME|COLOR]` 前缀。标签名中的 `%` / `|` / `]` 采用最小转义，兼容原有普通中英文标记。`ArticleReader` 优先用 `articleTags` state + 兜底用 title 解析（处理 150ms 异步空窗期），按 name 去重。**Mock 模式同步行为**：`MockDataSource.rebuildArticleTitleTags(articleId)` 让 `tagAddToArticle` / `tagRemoveFromArticle` / `tagDelete` / `tagUpdate` 同步更新 `article.title` 前缀，与 IPC 后端一致（前端不需要再拉 IPC 拿 tag）。
  - **Task 4.1.1 TagsPage 双栏布局**：左栏标签 CRUD（picker 按钮整行可点 + 选中态 `is-selected`）+ 右栏选中标签下的文章列表（标题 + 来源 + 时间 + 点击跳阅读器）。右栏按 50 篇分页，显示精确 `已加载/总数` 并支持“加载更多”；切标签会立即清空旧列表，查询失败显示可重试错误，不再伪装成空标签。实时同步：标签增删 / 选中切换 / 文章加 tag → 右栏文章列表 + 中栏标题 chips 同步更新。
  - **Task 4.1.4 OPML 选择性导出子界面**（`src/pages/OpmlExportPage/`）：列表展示订阅源（`checkbox` + name + url），默认全选，顶栏"全选"/"取消全选"切换，已选 `N/N` 计数实时显示，取消/确认按钮（确认 disabled 当 0 已选）。确认导出调 `ds.opmlExport(feedIds)` → IPC `opml:export` 传 `feedIds`；应用层返回错误时保留页面和勾选，允许原地重试，仅成功或用户取消系统保存框后关闭页面。`AppPage` 加 `'opml-export'`，`OpmlButtons.onExport` 改 `setCurrentPage('opml-export')` 路由跳转。**真根因修复**：默认全选 `useEffect` 监听 `[feeds, selected.size]` → 用户点"取消全选"→ `selected.size=0` → useEffect 重置全选（死循环）。**修法**：加 `initialized` 标志，只在首次加载默认全选。
  - **回归探针**：`smoke:feed-actions` 真实点击并验证同步阶段、同步期间切换选择、失败红点刷新、精确全部已读、标签绑定和 TagsPage 关联文章；`smoke:opml-export-selection` 覆盖默认全选、取消勾选、应用层错误保留与成功重试，两次均核对 `N-2` 个 feedId。
  - **smoke-2.4 探针适配**：`handleOpmlExport` 改路由后，原探针"点导出按钮"破坏三栏（currentPage 跳到 `opml-export` → article list unmount）。**修法**：探针直接调 `window.api.opml.export()` 验证 IPC 链路，不再点按钮（点按钮的 UI 测试归 smoke-4.1.4）。
  - **数据层**：`dataSourceFactory` 在 `?mock=1` 时把 `MockDataSource` 实例挂到 `window.__JUHE_DS__`（smoke 探针 hook mock 端方法用，零侵入生产）。`console-message` 转发兼容 Electron 28+ 新签名（event 对象含 message）。
- **Phase 4.1 内容管线后端增量完成**（`b0a7187` 张宇凡 + `7478ae9` 陈冠中）：
  - 单源同步结果包含 `fetching / parsing / saving / completed / failed` 阶段历史、当前进度、新增/更新数与稳定错误码。
  - `ArticleRepository.markAllReadByFeed(feedId)` 批量标已读 + `tagAddToArticle` / `tagRemoveFromArticle` / `batchAdd` 同步回写文章标题标签标记（事务性）。
  - 选择性 OPML 导出支持已选 Feed ID、空选择回退全量、未知 ID 跳过，并在 Main IPC 入口校验参数。
  - `smoke:phase2` 10 项报告字段全部通过，覆盖单源阶段、失败错误码及选择性 OPML 导出/导回。
- **正文复杂结构清洗修复（2026-07-27）**：简单表格继续输出 GFM，合并单元格/无表头表格和特殊编号/描述列表使用安全 HTML 回退；任务列表保留 `[x]/[ ]`，代码围栏按正文反引号长度动态扩展。精简与翻译阅读模式均补齐宽表格、表注和描述列表样式；migration 9 保留原始网页 HTML 并让旧派生正文按需重洗。
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
- **21 个 smoke + 130 个单元测试**（另 6 个需外网的真实 Feed 测试按设计跳过）：smoke-1.1 / 2.1 / 2.3 / 2.4-ui-ipc / 2.5 / 3.3 / 3.4-integration / 3.5.1 / 3.5.2-ui / 3.5.2-split-error / 3.5.3-coexist / 3.5.4-tagmanage / 4.1 / phase2 / reader-modes / taglist / feeds-group / search-pagination / feed-actions / opml-export-selection / **phase4.2**。2026-07-28 的 Phase 4.2.1 落地新增 `smoke:phase4.2` 30 项 check。
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

1. Phase 1–4.3、3.7、4.1、4.2、**4.3**：✅ 全部完成
2. Phase 5：v0.3.1 release 已发布（`v0.3.1` tag + 2 个 artifact）+ Phase 4.3.1 引导浮层落地 / Windows 真机与 Linux 验证 / 课程交付资料准备（进行中）

详细任务和验收标准位于 `PLAN.md`，本文件不重复记录任务级进度。

## 近期记录（按 commit 倒序）

- **`4.3.1`（张晨阳，待 commit）**：Phase 4.3.1 新手引导浮层 — 8 步全屏遮罩 + 4 块围挡挖镂空 + 强调色边框 + 固定底部中央卡片 + SVG 曲线箭头；`useTargetRect` 动态定位（200ms 轮询 + resize/scroll/fullscreenchange 实时跟随）+ `useOnboarding` 步骤状态（缺失自动 next）；8 步中英 i18n（侧栏 / 添加 / 列表 / 同步 / 阅读 / 隐藏左栏 / AI / 搜索）；UnifiedSettingsPage 加"新手引导"快速入口；`useAppearance` 扩展 `onboardingCompleted` 字段 + setter + 监听 `juhe:settings-changed` 事件；MockDataSource 派发 settings 变化事件；`runSmokeTest` 统一关闭引导避免影响其他 smoke 探针 hit test；22/22 smoke + 130 单测全过。
- **`b02da80`（张晨阳）**：批量全选/清空合并为 toggle 按钮 + AI 设置名称"AI 与模型"→"AI模型"。
- **`71abd32`（陈冠中）**：Phase 4.3 AppSettings 新增 `onboardingCompleted` 字段 + `isSettingValue` 安全校验。
- **`639de80`（张宇凡）**：v0.3.1 release — 版本升至 0.3.1，修复 `fast-xml-parser` 生产依赖漏洞并补充完整发布说明；本地与 GitHub Actions 双平台打包成功，Release 资产下载复核通过。
- **`1b74960`（合并提交）**：合并团队并行提交的圆角图标实现 `f437fad`，保留其提交历史与跨平台圆角方向；最终统一使用分尺寸资源、可重复生成/校验脚本和包外运行时路径。
- **`f437fad`（xingguang0626）**：将奏章图标升级为带透明圆角的 RGBA 版本，并提供首版 Python 生成原型。
- **`6e2c596`（张宇凡）**：将团队奏章 Logo 处理为真实 RGBA PNG 与跨平台尺寸，修正打包后窗口图标路径，移除重复资源和误提交的 `commit-msg.txt`，增加可重复生成脚本及格式/透明度校验。`typecheck`、130 项单元测试、`build`、基础 smoke、`smoke:phase4.2`、macOS DMG 和 Windows NSIS 均通过。
- **`0497eb6`（xingguang0626）**：提交象牙米黄竹纸奏章、朱红印章与流苏的应用图标原始设计，并完成首版 Electron/favicon 接入。
- **`fb49361`（合并提交）**：将团队仓库 `e1af19e` 的订阅源分组字号修复与工作台版本 `8ca0998` 合并；保留组名与订阅源同字号、SVG 折叠箭头和统一计数排版。`build`、`smoke:phase4.2`、`smoke:feeds-group` 均通过，并同步发布到团队仓库与个人仓库的 `main`。
- **`8ca0998`（张宇凡）**：完成 IDE 工作台收尾、文章状态与订阅源操作可靠性修复、本地日志查看/导出以及对应测试。`typecheck`、130 项单元测试、`build`、`smoke:phase4.2`、`smoke:feed-actions` 均通过。
- **`1d07b05`（张晨阳）**：Phase 4.2.1 Navbar 图标 + 系统字号 + 侧栏折叠 UI 完整闭环。
  - **AI 入口图标**：navItems 用 `iconType='ai-bold'` 渲染 `<strong class="app-header__nav-icon--ai">AI</strong>`（font-weight 800 + letter-spacing -0.04em），三主题下视觉协调。
  - **专题入口图标**：navItems 用 `iconType='topics-svg'` 渲染 14×14 多源聚合 SVG（两个左侧源点 + 右侧中心点 + 两条汇聚线），stroke 颜色继承 currentColor。
  - **系统字号 + 正文字号独立滑块**：GeneralSettingsModal 加"系统字号"行（10-24，默认 14，hint"影响左/中栏"），改"正文字号"hint 为"仅影响右栏"。两字号各自持久化到 AppSettings。
  - **阅读键三级目录循环**：顶栏小三角已移除；阅读页重复点击首个功能键按“全开 → 仅二级 → 仅灵活窗口 → 全开”循环，从其他页面点击只返回阅读。
  - **Layout 折叠**：`DirectoryMode` 控制两级目录与 ResizeHandle 数量 2→1→0→2，灵活窗口始终保留。
  - **CSS 变量**：index.css 加 `--ui-font-size` 默认值；FeedList + ArticleList 根 `font-size: var(--ui-font-size)`，子元素用 em 缩放；ArticleReader 不引用此变量。
  - **useAppearance 扩展**：新增 `systemFontSize` / `sidebarVisible` 字段 + setters，`applyToHtml` 写 `--ui-font-size` + `data-sidebar-visible`。
  - **MockDataSource 修复**：mock 维护 `private settingsState`，`settingsGet` 返回 ready + state；`sidebarVisible` 用于恢复一级目录展开状态。
  - **smoke:phase4.2 全过**：AI 粗体 / 专题 SVG / 阅读键三级目录循环 / ResizeHandle 2→1→0→2 / 系统字号 14→20 / reader 字号独立 / MockDataSource 持久化。
- **`0e33eb5`（张晨阳）**：同步失败 toast 显示具体原因 + 列表滚动到底自动加载 — `handleSyncAll` 收集 `failedFeedErrors: Array<{name, error}>` + 多行 toast（>5 个截断"…还有 N 个"），Toast.css `white-space: pre-line` 让 `\n` 真正换行；ArticleList 末尾加 1px 哨兵 `<div ref={sentinelRef}>` + IntersectionObserver（`root = ul 滚动容器`，`rootMargin=200px` 提前触发），保留"加载更多"按钮作为兜底。
- **`f8ee173`（张宇凡）**：Phase 4 内容清洗 / 同步 / migration 加深 — 11 项新单测覆盖（同步 6 阶段 + 标签嵌入 + 复杂结构 + migration 9），`smoke:4.1.1` 加深 9 项 check。
- **`ec45c68`（陈冠中）**：Phase 4.2.3 AppSettings 新增 `systemFontSize` + `sidebarVisible` 字段 + 持久化：`shared/types.ts` `AppSettings` interface 加 2 字段（`systemFontSize: number` 范围 10-24 默认 14；`sidebarVisible: boolean` 默认 true），`DEFAULT_SETTINGS` 默认值同步；`electron/main/db/sqlite-settings.ts` `isSettingValue` 加两 case 校验（`isNumberInRange(10, 24)` / `typeof boolean`）；`merge()` 自动读出已存 key，**老版本升级无数据迁移负担**（缺失字段自动填默认值）；`validateSettingsUpdate` 透传新字段，无需额外代码。
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

- **Linux 凭证后端要求**：AI Provider API Key 已接入 `safeStorage`；Linux 必须提供 libsecret/KWallet 等安全后端。若 Electron 只能选择 `basic_text`，应用会保留历史 Key 的兼容读取，但拒绝新增或更新 Key，避免重新写入弱保护凭证。
- **部分数据库仓储缺少单元测试**：Tag / Note / Digest / AIProvider / AiResultCache 的测试覆盖不足（Phase 5 增量补齐）。
- **AI 真实生成未被自动化测试覆盖**：smoke 探针中 AI section 允许 skipped（需真 API key）。
- **跨平台行为测试**：macOS 已完成完整 smoke、DMG 挂载与图标核验；Windows NSIS 已完成本地和云端构建及资源解析，但仍需 Windows 真机安装验证；Linux 尚未构建。
- **electron-builder 上游依赖公告**：生产依赖 `npm audit --omit=dev` 为 0；完整审计仍报告 16 项 high，全部来自 electron-builder 26.15.7 的打包期传递依赖。npm 当前给出的自动修复会反向安装 25.1.8，不能在未验证的情况下强制执行；等待上游稳定版更新并继续复核。GitHub Actions 同时提示部分官方 actions 的 Node 20 运行时已由平台强制切换到 Node 24。
- **不同 OpenAI-compatible Provider 兼容性**：当前默认测过 1 家 Provider，需在多 Provider 上兼容性测试。
