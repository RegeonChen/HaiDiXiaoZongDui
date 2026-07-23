# 聚合拾遗

跨平台、本地优先的桌面 RSS 阅读器。Electron + React + TypeScript。

## 目录结构

```
.
├── electron/              # 主进程 + preload
│   ├── main/index.ts
│   ├── main/db/            # SQLite 连接、迁移、Repository 与内容管线适配器
│   ├── main/services/content-pipeline/ # Feed、同步、清洗、OPML
│   └── preload/index.ts
├── src/                   # 渲染进程（React）
│   ├── App.tsx
│   ├── main.tsx
│   ├── env.d.ts
│   ├── index.css
│   └── index.html
├── shared/                # 跨进程共享的类型与 IPC 协议
│   ├── types.ts
│   └── ipc.ts
├── scripts/               # Task 1.1、2.3 与 Phase 2 无头烟雾测试
├── electron.vite.config.ts
├── tsconfig.json          # base（仅 references）
├── tsconfig.node.json     # main + preload
└── tsconfig.web.json      # renderer
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm install` | 装依赖（首次必跑，国内建议带 `--registry=https://registry.npmmirror.com`） |
| `npm run dev` | 启动 electron-vite 开发模式（HMR + 渲染进程热更新） |
| `npm run build` | 打包 main / preload / renderer 三段产物到 `out/` |
| `npm run preview` | 预览构建后的产物 |
| `npm run typecheck` | 同时校验 Node 与 Web 两侧的 TypeScript |
| `npm test` | 运行离线单元测试和本地 HTTP 集成测试 |
| `npm run test:real-feeds` | 验证 NASA RSS、Mozilla Atom 和 JSON Feed 官方源 |
| `npm run smoke` | 跑 Task 1.1 验收脚本（无头环境也能验证窗口 + IPC + 进程隔离） |
| `npm run smoke:ui` | 跑 Task 2.1 三栏 UI、交互与主题切换验收脚本 |
| `npm run smoke:db` | 在隔离临时数据库中跑 Task 2.3 CRUD、IPC 与跨重启持久化验收 |
| `npm run smoke:phase2` | 使用本地测试服务器跑同步、入库、按需清洗、去重、OPML 的离线端到端验收 |
| `npm run smoke:topic` | 在隔离数据库中验收专题 CRUD、文章关联与时间/方向演化图 |

## 国内装依赖

直接 `npm install` 容易卡在 Electron 二进制下载。推荐：

```bash
npm install \
  --registry=https://registry.npmmirror.com \
  --electron_mirror=https://registry.npmmirror.com/-/binary/electron/
```

## 安全基线（已落实）

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- preload **必须 CJS**（`out/preload/index.cjs`）—— Electron sandbox 不接受 ESM preload
- preload 只通过 `contextBridge` 暴露 `shared/ipc.ts` 里的通道，不暴露裸 `ipcRenderer`

## Task 1.1 验收

跑 `npm run smoke`，期望输出包含：

```
SMOKE_REPORT_JSON {"isolation":{"hasRequire":false,...},"ipc":{"ok":true,...}}
SMOKE_REPORT_PASS
[smoke] ✓ 全部验证项通过
```

含义：
- `isolation` 四项全 false：Renderer 拿不到 `require` / `process` / `module` / `Buffer`
- `ipc.ok: true`：preload 桥接成功，主进程 handler 返回了 `IpcResult<AppSettings>`

## Task 2.2 内容管线

内容管线位于 `electron/main/services/content-pipeline/`，只在 Main 进程运行：

- RSS、Atom、JSON Feed 解析为统一文章结构；
- HTTP 超时、有限重试、状态码和响应大小限制；
- 阅读或 AI 首次请求时才执行 Readability 正文提取、HTML 白名单清洗和 GFM Markdown 转换；
- 持久化原始网页、Cleaned HTML 和 Markdown 后直接复用，Feed 同步不批量抓取文章页；
- 单个/全部订阅源的手动同步与进度；
- OPML 分组、去重、导入和原子导出；
- 通过 `FeedSyncStore`、`ArticleContentStore`、`OpmlFeedStore` 与 Task 2.3 数据库模块连接。

三个 Store 已由 `electron/main/db/content-pipeline-store.ts` 实现，Main 已注册同步、正文和 OPML IPC。Schema v2 将 Feed 自带内容与按需获取的文章页分层保存，并以 `(feed_id, guid)` 避免重复文章。

## Phase 2 后端集成验收（不含 Renderer UI）

运行：

```bash
npm run smoke:phase2
```

脚本完全离线，会临时启动本地 Feed 和文章页面，直接通过 preload / IPC 验证以下后端闭环：

1. 添加订阅源并同步文章到 SQLite；
2. 再次同步不重复写入文章，同步成功/失败状态都能保存；
3. 第一次请求阅读正文时抓取并清洗文章页；
4. 后续 HTML/Markdown 请求复用缓存；
5. 已读、星标和 OPML 导入导出正常；
6. 临时数据库确实写入磁盘。

`smoke:phase2` 不会验证 React 界面是否已连接真实数据。`smoke:ui-ipc`（即 `npm run smoke:ui-ipc`）专做这件事：起 Electron + 走真 IPC 模式 + seed 数据 + 验证 React 组件从 IPC 拿到数据并展示。

## 专题演化图

专题不是普通文章收藏夹。新建专题后，应用先在本地根据专题名称和关键词匹配文章，再复用规范 URL、内容指纹和标题相似度合并重复报道。专题详情按时间横向排列事件节点，并将节点放入“发布与能力、产品与应用、安全与治理、成本与部署、观点与解读”等发展方向；点击节点可以查看全部来源并返回阅读器原文。

演化图和来源简报按关联文章内容签名缓存。反复打开专题不会重新分析；只有专题配置或关联文章发生变化时才重建，因此候选发现阶段不消耗模型 Token。
