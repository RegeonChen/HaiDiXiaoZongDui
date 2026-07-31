# 聚合拾遗 v0.3.3 Release Notes

发布日期：2026-07-31

Git Tag：`v0.3.3`

本次补丁更新集中修复 macOS 窗口顶部的视觉与交互问题，使应用工具栏与原生标题栏合并为更协调的单层布局。

## 主要更新

### macOS 单层标题栏

- 使用 Electron `hiddenInset` 标题栏，让红黄绿窗口按钮、应用名、搜索框和右侧工具按钮位于同一行。
- 为原生交通灯设置专用坐标，使其与应用标题及搜索框的视觉中心对齐。
- 为交通灯预留稳定的左侧安全区，避免应用名与窗口按钮重叠。
- 顶栏空白区域支持拖动窗口，搜索框、设置、AI 和主题按钮仍保持正常点击。

### 跨平台与安全边界

- Windows 和 Linux 继续使用各自的原生标题栏，不受 macOS 专属布局影响。
- preload 只向页面写入受控的平台标记，不向 Renderer 暴露 `process`、文件系统或其他 Node.js 能力。
- 保留 Windows/Linux 默认 Electron 菜单栏移除行为，避免出现重复菜单和工具栏。

## 验证

- TypeScript Main/Renderer 双端检查通过。
- 150 项单元测试通过；6 项真实网络 Feed 测试按设计跳过。
- 应用图标格式、尺寸和透明通道校验通过。
- Electron 生产构建通过。
- 19 组关键 Electron/IPC smoke 通过，覆盖基础隔离、UI/IPC、Feed/OPML、摘要与翻译、标签、阅读模式、AI 对话、图片、搜索分页、专题、工作台和新手教程。
- macOS 真实开发窗口确认标题栏为单层，交通灯与文字对齐，设置按钮和搜索框可正常交互。

## 安装包

- macOS Apple Silicon：`Juhe-Shiyi-0.3.3-arm64.dmg`
- Windows x64：`Juhe-Shiyi-Setup-0.3.3-x64.exe`

## 已知限制

- macOS 安装包未进行 Apple Developer ID 签名和公证，仅适合课程展示、开发测试和团队内部分发。
- Windows 安装包未使用商业代码签名证书，首次运行可能出现系统安全提示。
- Linux 安装包不在本次 Release 范围内。
