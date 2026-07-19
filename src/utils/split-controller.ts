/**
 * 翻译 split 控制器（Phase 3.5.2）
 *
 * 封装 "cleanedHtml → HtmlBlock[]" 的异步切分逻辑，处理 React 18 StrictMode
 * dev 模式双调 effect 的场景。
 *
 * 为什么需要 controller：
 *   useEffect 内部 `let cancelled = false` + cleanup `cancelled = true` 在
 *   StrictMode dev 模式（mount → cleanup → mount）下会让第一次 effect 启动的
 *   async 任务完成时 setState 被 cancel 掉，导致 split 永远卡在 loading。
 *
 *   用 token ref 替代 cancelled：每次 effect 启动时 ++token，async 完成时
 *   检查 token 仍是最新值才 setState。跨 mount 共享，StrictMode 双调不会卡住。
 *
 * 用法：
 *   const controller = useRef(new SplitController()).current;
 *   useEffect(() => {
 *     controller.start(cleanedHtml, async (html) => ds.htmlBlockSplit(html), {
 *       onLoading: () => setState(loading),
 *       onReady: (blocks) => setState(ready, blocks),
 *       onError: (err) => setState(error, err),
 *       onFallback: (html) => setState(ready, fallbackBlock(html))
 *     });
 *   }, [cleanedHtml, ds]);
 */

import type { DataSourceState } from '../types/dataSource';
import type { HtmlBlock } from '@shared/types';

export type SplitCallback = {
  onLoading: () => void;
  onReady: (blocks: HtmlBlock[]) => void;
  onError: (error: string) => void;
  onFallback: (html: string) => void;
};

export class SplitController {
  private token = 0;
  /** 上次切分成功的 cleanedHtml，避免重复切分 */
  private lastHtml: string = '';

  /**
   * 启动一次 split。
   *  - html 跟上一次相同 → no-op（除非 forceRestart=true）
   *  - 空字符串 → 立即触发 onReady([])
   *  - 否则 setLoading + 异步切分 + 校验 token 后触发回调
   *
   * 多次调用会触发"竞态"：后续 start 会让前一次 async 的回调被忽略（token 失效）。
   */
  start(
    html: string,
    splitter: (html: string) => Promise<DataSourceState<HtmlBlock[]>>,
    cb: SplitCallback,
    options?: { forceRestart?: boolean }
  ): void {
    if (!options?.forceRestart && html === this.lastHtml) {
      return;
    }
    if (!html.trim()) {
      this.lastHtml = html;
      cb.onReady([]);
      return;
    }
    this.lastHtml = html;
    cb.onLoading();
    const myToken = ++this.token;
    void (async () => {
      try {
        const r = await splitter(html);
        if (myToken !== this.token) return; // 已被新 start 顶替
        if (r.kind === 'ready' && Array.isArray(r.data)) {
          cb.onReady(r.data);
        } else if (r.kind === 'error') {
          cb.onError(r.error);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[SplitController] 未识别的 kind，fallback 单块:', r.kind);
          cb.onFallback(html);
        }
      } catch (e) {
        if (myToken !== this.token) return;
        // eslint-disable-next-line no-console
        console.error('[SplitController] splitter 异常，fallback 单块:', e);
        cb.onFallback(html);
      }
    })();
  }

  /**
   * 重置 controller（清空 token 和 lastHtml）。组件 unmount 时调用。
   * 注意：因为是 token 计数，重置后再 start 会从 1 开始——这是有意的，
   * 防止 stale callback 触发 setState。
   */
  reset(): void {
    this.token++;
    this.lastHtml = '';
  }
}
