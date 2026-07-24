# 聚合拾遗 v0.3.0 Release Notes

发布日期：2026-07-24
Git Tag：`v0.3.0`

> **本期主题：侧栏三件套 + 专题演化图 + 通用图片代理**
> 从 v0.2.2 到 v0.3.0 累计 **80+ commits**，覆盖 Phase 3 全部 UI、Phase 4 专题端到端、跨平台图片代理、阅读模式扩展。

---

## ✨ 新功能

### 订阅源侧栏真分组（c1325df, e1aee96）
- **添加组**：顶栏 `+` 按钮，弹 `AddGroupDialog` 文本输入 + Esc/点 backdrop 关闭 + 同名检测
- **移动到组**：右键订阅源 → "移动到…"子菜单（hover 弹出，边界检测）
- **删除组**：组标题旁 `×` 按钮，组内订阅源自动移到"未分组"兜底组
- **组别折叠**：组标题可点击，▸/▾ 箭头切换；"..." 菜单"全部展开 / 全部折叠"
- **持久化**：折叠状态写到 `localStorage['juhe-shivi.feed-list.collapsed-groups']`

### 侧栏按 tag 分类（ec0c49e）
- 切到 `tab=tags`，按用户所有 tag 列出，文章数来自 `ARTICLE_COUNTS_BY_TAG` IPC（SQL 精确聚合）
- 每个 tag 标签旁 `×` 单删按钮（hover 显示）
- `...` 菜单"删除未使用标签"（count === 0 的批量清理 + confirm 弹前 5 个名字）
- `FeedSelector` 模板字面量类型 `tag:${string}` + `isTagSelector` / `parseTagSelector`

### 专题演化图（c428688 张宇凡）
- 4 tab → 3 tab：`graph` / `articles` / `briefing`
- 5 方向泳道（**MVP 默认**）：发布与能力 / 产品与应用 / 安全与治理 / 成本与部署 / 观点与解读
- 节点点击 → 弹来源列表 → 来源点击跳到 reader
- v7 migration：`topics` / `topic_articles` / `topic_graph_cache`
- 候选发现阶段不消耗 AI Token（用 `source_signature` 缓存）

### 通用文章图片链路（399d3c8, bb57450, f1eeb48）
- 清洗器统一处理：`data-src` / `data-original` / `srcset` / `picture` / `noscript` / 多图 `figure`
- Renderer 把正文 HTTP(S) 图片统一改写为 `juhe-image://`，不再直接访问第三方
- Main 代理三策略：原文来源（带 Referer）/ 图片同源 / 无来源（裸 GET）
- 25 MB 上限 + 图片类型校验（白名单 PNG/JPEG/GIF/WebP/SVG）
- 旧缓存 migration 8：自动使 `cleanedHtml` 失效，保留 `sourceHtml` 下次打开时本地重洗
- `file://` 协议不发 Referer，少数派 CDN 防盗链不再 403

### 三种阅读模式（e25343a, 9aef239 张宇凡）
- **精简阅读**（默认）：只显示正文，无侧栏
- **网页模式**：保留原文，顶部加 `juhe://` 进度条 + 原文链接
- **分栏模式**：左 reader / 右原文 WebView，左右各半
- 通过 `useReaderMode` hook + `shared/article-webview.ts` + 主进程 `installArticleWebviewSecurity`

### AI 工具栏 8 按钮（Phase 3.4）
- ☆ 加星标 / 打开原文 ↗ / ✨ 摘要 / 🌐 翻译 / 🏷 标签 / 🪄 标签建议 / ✎ 笔记 / ★ 专题
- 摘要 / 翻译并存：`activePanel: Set<AiPanel>`（4 辅助函数支持 toggle / switch / 单开）

### 同步进度条（Phase 3.6.2）
- 底部"正在同步：XXX 进度：N/M" + 失败红点（订阅源标题前红点 + tooltip 错误原因）
- done 态 3 秒延迟自动消失

### 视觉主题 + 字体主题
- **3 套字体**：默认衬线 / 黑体无衬线 / 楷体
- **2 套视觉**：经典 / 纸质暖黄
- **3 档外观**：浅色 / 深色 / 跟随系统（纸质深色与经典深色一致）

---

## 🐛 关键 Bug 修复

- **split 永远卡 loading**（7fce48c）— `SplitController` token ref 跨 mount 共享；React 18 StrictMode dev 双调不再吞回调
- **useSelection 闭包陈旧**（ec0c49e）— `handleSuggestTags` 用 `stickyTabRef` 替代 `useCallback` 闭包
- **侧栏 tab 状态被踢回 sources**（e1aee96）— `refreshFeeds` setState loading 触发 unmount/remount，tab state 丢失；**localStorage 持久化** 根因解决
- **少数派 / 简书 / CSDN 防盗链 403**（399d3c8, bb57450）— `juhe-image://` Main 代理 + `file://` 不发 Referer
- **少数派等站点插图不显示**（f1eeb48）— `data-src` 懒加载 + 清洗器统一兜底
- **CRLF 翻译输出 fixture 拆分**（5dbb23f）— 兼容 Windows git autocrlf 回归

---

## 🧪 测试

- **18 个 smoke 探针全过**：smoke-1.1 / 2.1 / 2.3 / 2.4-ui-ipc / 2.5 / 3.3 / 3.4-integration / 3.5.1 / 3.5.2-ui / 3.5.2-split-error / 3.5.3-coexist / 3.5.4-tagmanage / 4.1 / phase2 / reader-modes / taglist / feeds-group
- **97 单元测试 + 6 skipped**（AI 真实生成需真 API key）
- **typecheck 双端通过**（`tsconfig.node.json` + `tsconfig.web.json`）
- **`smoke:feeds-group` 36 项**：种子 / 初始 / 添加组 / 移动 / 未分组 / 删除组 / 拒绝 / **组折叠** / **... 菜单** / **标签删除**

---

## 📦 安装包

GitHub Actions 自动构建：
- **macOS**：DMG（`Juhe-Shiyi-0.3.0-x64.dmg` / `-arm64.dmg`）
- **Windows**：NSIS 安装包（`Juhe-Shiyi-0.3.0-x64.exe`）

下载：[GitHub Releases v0.3.0](https://github.com/RegeonChen/HaiDiXiaoZongDui/releases/tag/v0.3.0)

---

## 🔜 下一版（v0.3.1 / v0.4.0 候选）

- **API Key safeStorage 加密**：A 写主进程集成 + smoke 探针
- **键盘快捷键**：侧栏 j/k 切订阅源、文章 j/k 切文章
- **黑暗模式对比度审计**：跑所有页面截图，找 < 4.5:1 文字
- **三平台 UI 验证**：张宇凡跑 macOS / Linux；陈冠中跑 Windows NSIS

---

## 🙏 致谢

v0.3.0 由 **聚合拾遗** 团队（张晨阳 / 张宇凡 / 陈冠中）协作完成。`shared/types.ts` + `shared/ipc.ts` 作为权威协议源，跨模块接口变更严格走协调流程。
