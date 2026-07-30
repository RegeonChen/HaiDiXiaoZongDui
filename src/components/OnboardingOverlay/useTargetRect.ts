import { useLayoutEffect, useRef, useState } from 'react';

export interface TargetRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

function readRect(element: Element, padding: number): TargetRect {
  const rect = element.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const snap = (value: number) => Math.round(value * pixelRatio) / pixelRatio;
  const left = snap(Math.max(4, rect.left - padding));
  const top = snap(Math.max(4, rect.top - padding));
  const right = snap(Math.min(window.innerWidth - 4, rect.right + padding));
  const bottom = snap(Math.min(window.innerHeight - 4, rect.bottom + padding));
  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function rectsMatch(previous: TargetRect | null, next: TargetRect | null): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return Math.abs(previous.top - next.top) < 0.25 &&
    Math.abs(previous.right - next.right) < 0.25 &&
    Math.abs(previous.bottom - next.bottom) < 0.25 &&
    Math.abs(previous.left - next.left) < 0.25 &&
    Math.abs(previous.width - next.width) < 0.25 &&
    Math.abs(previous.height - next.height) < 0.25;
}

export function useTargetRect(
  selector: string | null,
  padding: number,
  onMissing: () => void
): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const rectRef = useRef<TargetRect | null>(null);
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;

  useLayoutEffect(() => {
    if (!selector) {
      rectRef.current = null;
      setRect(null);
      return;
    }

    let frame = 0;
    let missingTimer: ReturnType<typeof setTimeout> | null = null;
    let observedElement: Element | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => schedule());
    const commitRect = (next: TargetRect | null) => {
      if (rectsMatch(rectRef.current, next)) return;
      rectRef.current = next;
      setRect(next);
    };

    const update = () => {
      frame = 0;
      const element = document.querySelector(selector);
      if (element !== observedElement) {
        resizeObserver?.disconnect();
        observedElement = element;
        if (element) resizeObserver?.observe(element);
      }
      if (!element) {
        commitRect(null);
        if (missingTimer === null) {
          missingTimer = setTimeout(() => {
            missingTimer = null;
            if (!document.querySelector(selector)) onMissingRef.current();
          }, 1200);
        }
        return;
      }
      if (missingTimer !== null) {
        clearTimeout(missingTimer);
        missingTimer = null;
      }
      commitRect(readRect(element, padding));
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    const mutationObserver = new MutationObserver((records) => {
      const appChanged = records.some((record) => {
        const target = record.target;
        const element = target instanceof Element ? target : target.parentElement;
        return !element?.closest('.onboarding-overlay');
      });
      if (appChanged) schedule();
    });
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-directory-mode'],
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('fullscreenchange', schedule);
    update();

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      if (missingTimer !== null) clearTimeout(missingTimer);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('fullscreenchange', schedule);
    };
  }, [padding, selector]);

  return rect;
}
