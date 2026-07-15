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

- **Task Detail:** 实现 Provider 设置、摘要、双语翻译、标签管理、笔记文摘、导出、多语言切换和日志查看界面。
    追加（字体与视觉主题）：字体主题选择器 UI 组件（至少 3 套预设：宋体/黑体/楷体等中文字体栈 + serif/sans-serif/monospace 英文字体栈）、视觉主题选择器 UI 组件（至少 2 套："经典"白色简约 / "纸质"暖黄护眼）、CSS 变量驱动全局即时切换（字体 + 色彩），无需重启。
- **Affected Areas:** 设置页、阅读器工具区、标签页、笔记与文摘页、本地化资源、全局 CSS 变量体系（`--bg-primary` / `--text-primary` / `--accent` / `--sidebar-bg` / `--toolbar-bg`）、`AppSettings.fontTheme` 和 `AppSettings.visualTheme` 字段。
- **Verification:** 所有功能都有完整的正常、加载、空数据和错误状态，界面能够调用约定的本地接口。切换字体/视觉主题后全界面即时刷新，无闪烁或布局错位。

### Task 3.2 - Content Support and Reliability (张宇凡)

- **Task Detail:** 改进不同 Feed 和网页的兼容性，处理同步失败、重试、内容编码、图片和复杂正文结构，并提供适合 AI 处理的干净内容。
    追加（字体与视觉主题）：确认 Cleaned HTML/Markdown 在不同字体主题下中英文混排、代码块、表格、列表渲染正常；在不同视觉主题下色彩对比度、图片透明背景、代码高亮可读性均正常。
- **Affected Areas:** 同步任务、正文清洗、内容转换、错误日志。
- **Verification:** 选定的测试订阅源可以重复同步，单个源失败不会中断全部同步，AI 输入不包含明显导航和广告内容。

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

## Phase 4: Topic Tracking

**Overall Goal:** 汇合三条主线，实现项目的特色功能“专题追踪与多源简报”。

### Task 4.1 - Topic Page (张晨阳)

- **Task Detail:** 实现专题创建、专题文章列表、事件分组、时间线、来源对比和简报展示界面。
- **Affected Areas:** 专题页面、时间线组件、简报编辑与导出交互。
- **Verification:** 用户可以创建专题，并清楚看到相关文章、来源和简报引用关系。

### Task 4.2 - Topic-ready Content (张宇凡)

- **Task Detail:** 为专题分析提供稳定的标题、发布时间、来源、正文和摘要文本，处理缺失字段与重复报道。
- **Affected Areas:** 内容标准化、去重信息、同步后的分析输入。
- **Verification:** 来自不同 Feed 的文章能够转换为统一、可比较的输入数据。

### Task 4.3 - Topic Analysis (陈冠中)

- **Task Detail:** 保存专题及文章关联，实现文章匹配、相似报道分组、时间线数据和带来源引用的多源简报生成。
- **Affected Areas:** Topic 数据模型、匹配与分组服务、Briefing Agent、结果缓存。
- **Verification:** 新文章能够加入相关专题；相似报道可以被分组；简报中的每条结论可以返回支持它的原文。

### Phase 4 Integration (张晨阳 + 张宇凡 + 陈冠中)

- 三人共同完成专题页面的端到端连接和演示数据准备。
- **Verification:** 从同步多篇真实文章开始，可以生成一个包含事件分组、时间线、观点差异和来源引用的专题简报。

## Phase 5: Cross-platform Acceptance

**Overall Goal:** 完成三平台验证、问题修复和课程交付准备。

- **张晨阳：** 检查 Windows、macOS、Linux 的窗口、字体、布局、快捷操作和多语言界面。
- **张宇凡：** 检查三平台网络请求、Feed 同步、文件导入导出和内容呈现。
- **陈冠中：** 检查 SQLite、凭证存储、AI Provider 和专题分析在三平台的运行情况。
- **全员：** 修复集成问题，整理演示数据、使用说明、开发文档和 Git 提交记录。
- **Verification:** 三个平台均能启动应用并完成核心阅读流程；至少一个平台能够完整演示所有课程功能和专题简报流程；已知限制被明确记录。

## Project Completion Criteria

- 课程要求的 Feed/OPML、同步、内容清洗、摘要、翻译、多语言、日志、笔记导出和标签功能均可演示
- 专题追踪能够处理来自多个订阅源的文章并生成带原文引用的简报
- 数据默认保存在本地，应用不要求账号登录
- 三个平台均经过实际运行验证
- 每项任务能够通过项目文档和 Git 历史追溯到负责人和验证结果
