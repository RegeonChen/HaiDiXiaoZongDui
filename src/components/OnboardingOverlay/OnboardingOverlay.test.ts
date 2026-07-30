// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingOverlay, getCoachmarkPosition } from './OnboardingOverlay';
import type { TargetRect } from './useTargetRect';

class MockResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

describe('OnboardingOverlay', () => {
  let container: HTMLDivElement;
  let targets: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    targets = document.createElement('div');
    targets.innerHTML = `
      <div class="pane-feeds"><button data-testid="feed-list__create">+</button></div>
      <div class="pane-list"><button data-testid="feed-action__sync">同步</button></div>
      <div class="app-editor"></div>
      <button data-page-key="reader">阅读</button>
      <button data-testid="app-header__ai">AI</button>
      <div class="app-header__search"></div>
    `;
    document.body.appendChild(targets);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    targets.remove();
    vi.unstubAllGlobals();
  });

  it('walks through all eight localized steps and completes', async () => {
    const onDismiss = vi.fn(async () => true);
    await act(async () => {
      root.render(createElement(OnboardingOverlay, {
        open: true,
        language: 'zh',
        onDismiss
      }));
    });

    expect(container.querySelector('[data-onboarding-step="feeds"]')).not.toBeNull();
    expect(container.textContent).toContain('从订阅源开始');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(container.querySelector('[data-testid="onboarding-previous"]')?.hasAttribute('disabled')).toBe(true);
    const card = container.querySelector<HTMLElement>('[data-testid="onboarding-card"]');
    card?.focus();
    await act(async () => {
      card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('onboarding-skip');
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent(
        'keydown',
        { key: 'Tab', shiftKey: true, bubbles: true }
      ));
    });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('onboarding-next');

    for (let index = 1; index < 8; index += 1) {
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-testid="onboarding-next"]')?.click();
      });
    }

    expect(container.querySelector('[data-onboarding-step="search"]')).not.toBeNull();
    expect(container.textContent).toContain('快速找到内容');
    expect(container.querySelector('[data-testid="onboarding-next"]')?.textContent).toBe('开始使用');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="onboarding-next"]')?.click();
    });
    expect(onDismiss).toHaveBeenCalledWith('completed');
  });

  it('switches copy immediately and supports skipping', async () => {
    const onDismiss = vi.fn(async () => true);
    await act(async () => {
      root.render(createElement(OnboardingOverlay, {
        open: true,
        language: 'en',
        onDismiss
      }));
    });

    expect(container.textContent).toContain('Start with your sources');
    expect(container.textContent).toContain('Step 1 of 8');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="onboarding-skip"]')?.click();
    });
    expect(onDismiss).toHaveBeenCalledWith('skipped');
  });
});

describe('getCoachmarkPosition', () => {
  const target: TargetRect = {
    top: 100,
    right: 260,
    bottom: 300,
    left: 40,
    width: 220,
    height: 200
  };

  it('prefers the open side and keeps the card inside the viewport', () => {
    expect(getCoachmarkPosition(target, 1280, 800).placement).toBe('right');
    const compact = getCoachmarkPosition(target, 600, 500);
    expect(compact.placement).toBe('center');
    expect(compact.left).toBeGreaterThanOrEqual(16);
    expect(compact.top).toBeGreaterThanOrEqual(16);
  });
});
