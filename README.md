# 聚合拾遗

跨平台、本地优先的桌面 RSS 阅读器。Electron + React + TypeScript。

## 目录结构

```
.
├── electron/              # 主进程 + preload
│   ├── main/index.ts
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
├── scripts/
│   └── smoke-1.1.cjs      # Task 1.1 验收用无头烟雾测试
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
| `npm run smoke` | 跑 Task 1.1 验收脚本（无头环境也能验证窗口 + IPC + 进程隔离） |

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
