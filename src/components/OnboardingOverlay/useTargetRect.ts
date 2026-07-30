/**
 * Phase 4.3.1：动态跟踪目标元素的 getBoundingClientRect
 *
 * - 每 200ms 用 requestAnimationFrame 触发一次重测（避免拖动/全屏切换脱节）
 * - 监听 window resize / scroll / fullscreenchange 立即重测
 * - 当 target 元素在 DOM 中消失（querySelector 返回 null）时返回 null
 *   让上层决定如何 skip
 * - 目标元素 ≤ 1×1（隐藏 / 折叠 / display:none）时返回 null + 0 尺寸标记
 *
 * 使用方法：
 *   const rect = useTargetRect(selector, enabled);
 *   if (rect === null) skip step;
 *   if (rect !== null && rect.width < 8) skip step;
 */

import { useEffect, useState } from 'react';

export interface TargetRect {
  /** 视口坐标 */
  top: number;
  left: number;
  width: number;
  height: number;
  /** 视口尺寸（用于浮层全屏） */
  viewportWidth: number;
  viewportHeight: number;
}

interface UseTargetRectResult {
  rect: TargetRect | null;
  /**
   * 目标是否在 DOM 中存在但当前不可见（0 尺寸）。
   * 与 `rect === null` 区分：
   *   - null = 完全找不到（不在 DOM）
   *   - 0 尺寸 = 在 DOM 但 display:none / 隐藏
   */
  existsButHidden: boolean;
}

const MIN_VISIBLE_SIZE = 8;

export function useTargetRect(
  selector: string | null | undefined,
  enabled: boolean,
  pollIntervalMs: number = 200
): UseTargetRectResult {
  const [state, setState] = useState<UseTargetRectResult>({ rect: null, existsButHidden: false });

  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || !selector) {
      setState({ rect: null, existsButHidden: false });
      return;
    }

    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setState((prev) =>
          prev.rect === null && !prev.existsButHidden
            ? prev
            : { rect: null, existsButHidden: false }
        );
        return;
      }
      // 跳过 display:none / 0×0 元素（被 collapse / 折叠）
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_VISIBLE_SIZE || rect.height < MIN_VISIBLE_SIZE) {
        setState((prev) =>
          prev.existsButHidden
            ? prev
            : { rect: null, existsButHidden: true }
        );
        return;
      }
      const next: TargetRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
      setState((prev) => {
        if (
          prev.rect &&
          Math.abs(prev.rect.top - next.top) < 0.5 &&
          Math.abs(prev.rect.left - next.left) < 0.5 &&
          Math.abs(prev.rect.width - next.width) < 0.5 &&
          Math.abs(prev.rect.height - next.height) < 0.5 &&
          prev.rect.viewportWidth === next.viewportWidth &&
          prev.rect.viewportHeight === next.viewportHeight
        ) {
          return prev;
        }
        return { rect: next, existsButHidden: false };
      });
    };

    measure();
    // 主动轮询：处理外部 CSS 过渡、字体加载、内容变化引起的尺寸改变
    const interval = window.setInterval(measure, pollIntervalMs);
    const onResize = () => measure();
    const onScroll = () => measure();
    const onFullscreenChange = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [selector, enabled, pollIntervalMs]);

  return state;
}
