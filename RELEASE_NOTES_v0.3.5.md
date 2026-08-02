# 聚合拾遗 v0.3.5 Release Notes

发布日期：2026-08-02

Git Tag：`v0.3.5`

本次补丁更新重点解决系统代理环境下的订阅与 AI 网络兼容问题，并加固 OpenAI-compatible 模型的结构化响应、错误诊断、表单输入和阅读区布局。

## 主要更新

### 系统代理与订阅同步

- Feed 同步和懒加载文章正文改用 Electron `net.fetch`，继承 Chromium 的系统代理、PAC、HTTPS 隧道和代理认证能力。
- HTTP 客户端继续执行协议白名单、15/20 秒超时、一次重试和 5/10 MB 大小限制。
- DNS、代理、证书、连接拒绝、连接重置和超时会转换为稳定错误码与可读提示；本地日志不记录完整 URL 或文章正文。
- 真实 Feed smoke 改为断言内层 `SyncResult.success`，并通过正文 IPC 验证实际阅读内容，避免只检查 IPC 外层成功。

### AI Provider 兼容与延迟控制

- 所有 OpenAI-compatible 请求改用 Electron `net.fetch`，与订阅同步共享系统代理能力。
- Provider 或模型拒绝 `response_format` 后，会在当前应用进程内记住兼容性，后续结构化任务直接降级，避免重复失败。
- Tag Agent 兼容 `reasoning_content`、Markdown 代码围栏、分析文字、尾逗号和旧版顶层数组；普通摘要与对话不会读取或展示推理内容。
- 专题命名推荐正文输入从 12,000 字收紧到 6,000 字，首次请求最多 45 秒；只有本地无法解析结构时才追加一次最多 15 秒的受控修复。
- 专题推荐按超时、鉴权、限流、网络、Provider 故障、空响应、格式异常和无可用候选返回可操作提示。
- Main 进程诊断只记录模型名、耗时、请求次数、格式降级和错误类别等脱敏元数据。

### 阅读与工作台交互

- 摘要内容取消固定 `76ch` 上限，在收起一、二级目录后随灵活窗口扩展，并保持在底部面板边界内。
- AI 标签建议在文章只有 Cleaned HTML 时也可使用，不再错误提示正文尚未准备完成。
- 通用设置的系统字号、正文字号和阅读宽度输入恢复原生数字编辑、方向键调整与持久化。
- 修复工作台预览标签固定时打断表单输入的问题；点击会阻止冒泡的设置控件时仍会先固定预览标签。

## 验证

- TypeScript Main/Renderer 双端检查通过。
- 183 项单元测试通过；6 项真实网络 Feed 测试按设计跳过。
- 应用图标格式、尺寸和透明通道校验通过。
- Electron 生产构建和本地 macOS Apple Silicon DMG 打包通过。
- 24 个独立 Electron/IPC smoke 全部通过，且关键报告内部状态均为 true。
- 生产依赖与完整依赖审计均为 0 项已知漏洞。
- 本地 `Juhe-Shiyi-0.3.5-arm64.dmg` 校验通过：132,601,110 bytes，SHA-256 `275ecc3ae33cd0146bfa9fcdddc65d05b14a4a00769f5fd7d0d185fc2d8e2f68`；包内 `Info.plist`、`app.asar`、ICNS 和运行时 PNG 均已复核。

## 安装包

- macOS Apple Silicon：`Juhe-Shiyi-0.3.5-arm64.dmg`
- Windows x64：`Juhe-Shiyi-Setup-0.3.5-x64.exe`

## 已知限制

- macOS 安装包未进行 Apple Developer ID 签名和公证，仅适合课程展示、开发测试和团队内部分发。
- Windows 安装包未使用商业代码签名证书，首次运行可能出现系统安全提示。
- Linux 安装包不在本次 Release 范围内。

## 回退方式

- 本版本没有数据库 Schema 迁移；如需回退，可重新安装 GitHub Release 中的 `v0.3.4` 安装包。
