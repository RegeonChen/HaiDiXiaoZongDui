# 聚合拾遗

跨平台、本地优先的桌面 RSS 阅读器。Electron 43 + React 18 + TypeScript strict + SQLite。

**当前版本：0.3.1 | 开发阶段：Phase 5（交付准备）**

## 功能特性

- RSS / Atom / JSON Feed 解析 + OPML 导入导出
- 手动和批量同步（逐源进度反馈 + 失败红点）
- 三栏阅读界面（订阅源 / 文章列表 / 阅读区），拖拽调整宽度
- 正文提取与安全清洗（Readability + JSDOM + sanitize-html）
- AI 摘要、逐段双语翻译（流式）、标签建议
- 文章星标、已读状态、模糊搜索、标签管理
- Markdown 笔记 + 多篇文摘导出（Markdown / HTML）
- 3 套字体主题 + 2 套视觉主题（经典 / 纸质暖黄）
- 浅色 / 深色 / 跟随系统，纸质深色与经典深色一致
- 中英文界面切换
- 专题追踪与多源简报
- 首次启动新手教程（8 步聚光引导，可从设置中再次查看）

## 快速开始

### 安装依赖

```bash
npm install
```

国内用户推荐使用镜像加速：

```bash
npm install --registry=https://registry.npmmirror.com --electron_mirror=https://registry.npmmirror.com/-/binary/electron/
```

### 开发模式

```bash
npm run dev
```

启动 electron-vite 开发模式，支持 HMR 热更新。

### 构建

```bash
npm run build
```

产物输出到 `out/` 目录（main / preload / renderer 三段）。

### 打包安装包

```bash
# macOS DMG
npm run dist:mac

# Windows NSIS 安装程序
npm run dist:win

# 同时打包两个平台（需在 macOS 上运行）
npm run dist
```

### GitHub Release

推送 `v*` 格式的 tag 即可触发 GitHub Actions 自动构建并发布：

```bash
git tag -a v0.2.0 -m "版本说明"
git push origin v0.2.0
```

## 命令列表

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式（HMR） |
| `npm run build` | 构建到 `out/` |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run dist:mac` | 打包 macOS DMG |
| `npm run dist:win` | 打包 Windows NSIS |
| `npm run dist` | 同时打包 macOS + Windows |

### 烟测脚本

| 命令 | 覆盖范围 |
|---|---|
| `npm run smoke` | Phase 1.1：进程隔离 + IPC 基础 |
| `npm run smoke:ui` | Phase 2.1：三栏 UI + 主题切换（Mock 模式） |
| `npm run smoke:db` | Phase 2.3：CRUD + 持久化 |
| `npm run smoke:phase2` | Phase 2 集成：同步 + 入库 + 去重 + OPML |
| `npm run smoke:ui-ipc` | UI 端到端 IPC（P1 添加订阅源 + P2 OPML） |
| `npm run smoke:phase2.5` | Phase 2.5：删除 + 三栏拖拽 + OPML 自动同步 |
| `npm run smoke:task33` | Phase 3.3：AI Provider + Tag/Note/Digest CRUD |
| `npm run smoke:integration` | Phase 3 Integration：21 项 UI + IPC 全链路 |
| `npm run smoke:topic` | Phase 4.1：专题 UI（7 项校验） |
| `npm run smoke:summary` | Phase 3.5.1：摘要悬浮窗（10 项校验） |
| `npm run smoke:inline-trans` | Phase 3.5.2：段落内翻译（11 项校验） |
| `npm run smoke:onboarding` | Phase 4.3：首次启动、8 步引导、设置重开与持久化 |

烟测均通过无头 Electron 环境运行，可在 CI 中执行。

## 目录结构

```
.
├── electron/                    # 主进程 + preload
│   ├── main/
│   │   ├── index.ts             # 应用入口、窗口、IPC 注册
│   │   ├── db/                  # SQLite 连接、迁移、Repository
│   │   └── services/
│   │       ├── content-pipeline/ # Feed 解析、同步、清洗、OPML
│   │       └── ai/              # LLM Client、Summary/Translation/Tag Agent
│   └── preload/
│       └── index.ts             # contextBridge 安全桥
├── src/                         # 渲染进程（React）
│   ├── App.tsx                  # 根组件 + 三栏状态管理
│   ├── main.tsx                 # 入口
│   ├── components/              # UI 组件
│   │   ├── FeedList/            # 订阅源侧栏
│   │   ├── ArticleList/         # 文章列表
│   │   ├── ArticleReader/       # 阅读区 + AI 工具栏
│   │   ├── Layout/              # 三栏布局 + 顶栏导航
│   │   ├── SearchBar/           # 模糊搜索
│   │   ├── GeneralSettingsModal/ # 通用设置弹窗
│   │   ├── SummaryFloatingPanel/ # AI 摘要悬浮窗
│   │   ├── TranslatedArticleView/ # 逐段翻译视图
│   │   └── TranslationSlot/     # 单段翻译插槽
│   ├── pages/                   # 二级页面
│   │   ├── SettingsPage/        # AI Provider 设置
│   │   ├── TagsPage/            # 标签管理
│   │   ├── NotesPage/           # 笔记管理
│   │   ├── DigestsPage/         # 文摘导出
│   │   ├── TopicsPage/          # 专题追踪
│   │   └── LogsPage/            # 日志查看
│   ├── hooks/                   # React hooks（useTheme / useAppearance 等）
│   ├── data/                    # DataSource 抽象层（IpcDataSource / MockDataSource）
│   ├── utils/                   # 工具函数（markdown 渲染 / html 分块等）
│   └── index.css                # 全局样式 + CSS 变量
├── shared/                      # 跨进程共享
│   ├── types.ts                 # 核心领域类型 + 默认设置
│   └── ipc.ts                   # IPC 通道定义 + 请求/响应类型映射
├── scripts/                     # 烟测脚本
├── .github/workflows/           # GitHub Actions 自动发布
├── electron.vite.config.ts
├── tsconfig.node.json           # main + preload TypeScript
└── tsconfig.web.json            # renderer TypeScript
```

## 安全基线

- `contextIsolation: true` — Renderer 无法直接访问 Node.js
- `nodeIntegration: false` — 禁用 Node 集成
- `sandbox: true` — OS 级沙盒隔离
- preload 强制 CJS 输出，只通过 `contextBridge` 暴露 `shared/ipc.ts` 中的白名单通道
- 外部 HTML 全部经过 sanitize-html 白名单清洗后才渲染
- 清洗后正文中的公开 HTTP(S) 图片统一通过 `juhe-image://` 内部协议加载：
  Renderer 不直接请求第三方资源，Main 进程使用原文来源、图片同源和无来源三种
  通用策略获取图片，并验证响应类型与大小

## 开发进度

| Phase | 状态 | 内容 |
|-------|------|------|
| Phase 1 | ✅ | 项目基础 + 共享协议 |
| Phase 2 | ✅ | RSS 同步 + 阅读 + SQLite |
| Phase 2.5 | ✅ | 删除订阅源 + 三栏拖拽 + OPML 自动同步 |
| Phase 3 | ✅ | AI 摘要/翻译/标签 + 笔记/文摘 + 主题 |
| Phase 3.4 | ✅ | Bug 修复 + 搜索 + 通用设置弹窗 |
| Phase 3.5 | ✅ | 悬浮摘要窗 + 逐段翻译 + AI 持久化 |
| Phase 3.6 | ✅ | 翻译纯译文 + 同步进度 + 侧栏计数 |
| Phase 4 | ✅ | 专题追踪 + 8 步首次启动新手教程 |
| Phase 5 | 🟡 | 凭证加密与工具链升级已完成；三平台真机验收暂缓 |
