import { useEffect, useRef, useState } from 'react';

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
  const left = Math.max(4, rect.left - padding);
  const top = Math.max(4, rect.top - padding);
  const right = Math.min(window.innerWidth - 4, rect.right + padding);
  const bottom = Math.min(window.innerHeight - 4, rect.bottom + padding);
  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

export function useTargetRect(
  selector: string | null,
  padding: number,
  onMissing: () => void
): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let missingTimer: ReturnType<typeof setTimeout> | null = null;
    let observedElement: Element | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => schedule());

    const update = () => {
      const element = document.querySelector(selector);
      if (element !== observedElement) {
        resizeObserver?.disconnect();
        observedElement = element;
        if (element) resizeObserver?.observe(element);
      }
      if (!element) {
        setRect(null);
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
      setRect(readRect(element, padding));
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('fullscreenchange', schedule);
    update();

    return () => {
      cancelAnimationFrame(frame);
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
