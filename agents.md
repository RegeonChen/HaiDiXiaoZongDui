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

截至 2026-07-23：

- **Phase 1、2、2.5、3、3.4、3.5、3.6 全部完成并通过验收（28 项 PASS）。**
- **Phase 4.1**（专题 UI）和 **Phase 4.2**（Topic-ready Content）已完成；等陈冠中 **Phase 4.3**（Topic Analysis 后端）接入。
- `electon-vite build` + `npm run typecheck` 均通过。
- **通用文章图片链路**已完成，不再按 Feed 或域名特判：
  - 清洗器统一处理 `data-src`、`data-original`、`srcset`、`picture`、`noscript` 和多图 `figure`
  - Renderer 将正文 HTTP(S) 图片统一改写为 `juhe-image://`，不再直接访问第三方图片
  - Main 进程代理使用原文来源、图片同源、无来源三种通用获取策略，并校验图片类型和 25 MB 上限
  - 数据库 migration 8 自动使旧 Cleaned HTML 失效，保留 Source HTML 并在下次打开时本地重洗
  - `npm run smoke:images` 覆盖打包 Renderer → CSP → 自定义协议 → Main fetch → 图片解码全链路
- **侧栏精确计数**：`ArticleRepository.countAll/countUnread/countStarred` + `article:counts` IPC 全链路。
- **翻译 UX**：`filterInlineMarkdown`（仅保留粗体/斜体/下划线）+ 翻译框纯中文展示。
- **同步进度条**：底部实时进度（"正在同步：XXX 进度：N/M"）+ 失败红点标记。
- **已读文章样式**：仅灰色文字，无删除线。
- **GitHub Release 自动化**：推送 `v*` tag → GitHub Actions 自动构建 macOS DMG + Windows NSIS。
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

1. Phase 1–3.6：✅ 全部完成
2. Phase 4：专题追踪端到端集成（张晨阳 4.1 + 张宇凡 4.2 已就绪，陈冠中 4.3 待接入）
3. Phase 5：三平台验证、问题修复、课程交付准备

详细任务和验收标准位于 `PLAN.md`，本文件不重复记录任务级进度。

## 已知问题

- **API Key 明文存储**：`ai_providers.api_key` 以明文写入 SQLite。计划 Phase 5 改用 `safeStorage` 加密。
- **Topic / Log stub**：12 个 Topic + 2 个 Log IPC handler 仍返回 `NOT_IMPLEMENTED`，等陈冠中 Phase 4.3 接入。
- **部分数据库仓储缺少单元测试**：Tag/Note/Digest/AIProvider/AiResultCache 的测试覆盖不足。
- **AI 真实生成未被自动化测试覆盖**：smoke 探针中 AI section 允许 skipped。
- **跨平台行为测试**：尚未在 macOS 和 Linux 上进行完整验证。
- **npm audit**：Electron 31、Vite 5/electron-vite 2 存在 4 组工具链公告（2 moderate、2 high），需在发布前升级。
- **不同 OpenAI-compatible Provider 兼容性**：需要在多 Provider 上进行兼容性测试。
