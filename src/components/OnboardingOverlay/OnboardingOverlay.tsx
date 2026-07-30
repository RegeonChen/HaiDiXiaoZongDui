/**
 * Phase 4.3.1：新手引导浮层（Onboarding Overlay）
 *
 * 设计要点：
 *   - 全屏 fixed 半透明遮罩（rgba(0,0,0,0.65)）
 *   - 4 块"围挡"div 在遮罩层之上围出镂空区
 *   - 步骤卡片固定在视口底部中央（32px 边距），永远在遮罩之上
 *   - SVG 箭头 path 从卡片顶部中央指向目标元素中心
 *   - 200ms fade 过渡（is-visible 切换）
 *   - 多语言：根据 useAppearance.language 切换
 *   - 元素缺失：useOnboarding 内部自动跳到下一个 ready 步骤
 *   - 200ms 后台轮询 + resize/scroll/fullscreenchange 实时跟随
 *
 * 数据契约（PLAN 4.3.1）：
 *   - 入参：onComplete / onSkip + 当前 currentPage（多语言用 useAppearance）
 *   - 出参：无（父组件维护 persistence）
 */

import { useEffect, useMemo } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import type { AppPage } from '../Layout/Layout';
import {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  getOnboardingUiText,
  getStepText
} from './onboardingSteps';
import { useTargetRect } from './useTargetRect';
import { useOnboarding } from './useOnboarding';
import './OnboardingOverlay.css';

export interface OnboardingOverlayProps {
  /** 当前 currentPage（决定步骤可见性：步骤的 page 字段不匹配则视为缺失） */
  currentPage: AppPage;
  /**
   * 父组件通知用户主动"完成"时调用（点"开始使用"）。
   * 父组件负责：调 setOnboardingCompleted(true) + 关闭浮层。
   */
  onComplete: () => void;
  /**
   * 父组件通知用户主动"跳过"时调用（关右上角 × 按钮 / "跳过引导"按钮）。
   * 父组件负责：调 setOnboardingCompleted(true) + 关闭浮层。
   */
  onSkip: () => void;
}

const PADDING = 8;       // 镂空区与目标元素之间的间距
const CARD_GAP = 16;     // 卡片与视口边缘的间距
const CARD_MAX_WIDTH = 440;
const CARD_HEIGHT_ESTIMATE = 220;

interface SpotlightLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeSpotlight(target: { top: number; left: number; width: number; height: number }): SpotlightLayout {
  return {
    top: target.top - PADDING,
    left: target.left - PADDING,
    width: target.width + PADDING * 2,
    height: target.height + PADDING * 2
  };
}

export function OnboardingOverlay({
  currentPage,
  onComplete,
  onSkip
}: OnboardingOverlayProps) {
  const appearance = useAppearance();
  const language = appearance.language;
  const uiText = useMemo(() => getOnboardingUiText(language), [language]);

  // 元素就绪：目标元素存在 + 尺寸可见 + （按 page 决定是否在当前页）
  const isElementReady = useMemo(() => {
    return (idx: number): boolean => {
      const s = ONBOARDING_STEPS[idx];
      if (s.page && s.page !== currentPage) return false;
      if (s.skipIfHidden && typeof document !== 'undefined') {
        const el = document.querySelector(s.selector);
        if (!el) return false;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
      }
      return true;
    };
  }, [currentPage]);

  const onboarding = useOnboarding({ visible: true, isElementReady });
  const step = ONBOARDING_STEPS[onboarding.currentStepIndex];
  const stepText = getStepText(step, language);

  // 边界保护：最后一步目标也缺失 → 视为完成
  // （极端情况：例如所有 step 在当前 mock/界面下都不可见）
  useEffect(() => {
    if (onboarding.isLastStep && onboarding.currentStepIsHidden) {
      onComplete();
    }
  }, [onboarding.isLastStep, onboarding.currentStepIsHidden, onComplete]);

  // 动态定位（200ms 轮询 + resize/scroll/fullscreenchange 实时跟随）
  const { rect: target, existsButHidden } = useTargetRect(step.selector, true, 200);

  // 卡片位置 + 箭头几何
  const viewport = target?.viewportWidth
    ? { width: target.viewportWidth, height: target.viewportHeight }
    : { width: 1440, height: 900 };

  // 卡片固定在视口底部中央
  const cardWidth = Math.min(CARD_MAX_WIDTH, viewport.width - CARD_GAP * 2);
  const cardLeft = (viewport.width - cardWidth) / 2;
  const cardTop = viewport.height - CARD_HEIGHT_ESTIMATE - CARD_GAP;

  // 箭头：从卡片顶部中央 → 目标中心
  const cardTopY = cardTop;
  let arrowPath = '';
  if (target) {
    const targetCenterX = target.left + target.width / 2;
    const targetCenterY = target.top + target.height / 2;
    // 起点：把 X 钳到卡片内部，避免箭头从卡片外面射出
    const startX = clamp(targetCenterX, cardLeft + 32, cardLeft + cardWidth - 32);
    const startY = cardTopY;
    const midY = (startY + targetCenterY) / 2;
    arrowPath = `M ${startX} ${startY} C ${startX} ${midY}, ${targetCenterX} ${midY}, ${targetCenterX} ${targetCenterY}`;
  }

  const spotlight = target ? computeSpotlight(target) : null;
  const overlayClass = `onboarding-overlay ${target ? 'is-target-visible' : 'is-target-hidden'}`;

  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-overlay-title"
      data-testid="onboarding-overlay"
      data-onboarding-step={step.id}
      data-onboarding-step-index={onboarding.currentStepIndex}
    >
      {/* 4 块围挡挖出镂空区 */}
      {spotlight && (
        <>
          <div
            className="onboarding-overlay__pane onboarding-overlay__pane--top"
            style={{ top: 0, left: 0, width: '100%', height: spotlight.top }}
            aria-hidden="true"
          />
          <div
            className="onboarding-overlay__pane onboarding-overlay__pane--bottom"
            style={{
              top: spotlight.top + spotlight.height,
              left: 0,
              width: '100%',
              height: Math.max(0, viewport.height - (spotlight.top + spotlight.height))
            }}
            aria-hidden="true"
          />
          <div
            className="onboarding-overlay__pane onboarding-overlay__pane--left"
            style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }}
            aria-hidden="true"
          />
          <div
            className="onboarding-overlay__pane onboarding-overlay__pane--right"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              width: Math.max(0, viewport.width - (spotlight.left + spotlight.width)),
              height: spotlight.height
            }}
            aria-hidden="true"
          />
          {/* 镂空边框（高亮强调） */}
          <div
            className="onboarding-overlay__ring"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* 指示箭头 */}
      {target && (
        <svg
          className="onboarding-overlay__arrow"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="onboarding-overlay__arrow"
        >
          <defs>
            <marker
              id="onboarding-arrowhead"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--onboarding-accent, #4f8cff)" />
            </marker>
          </defs>
          <path
            d={arrowPath}
            fill="none"
            stroke="var(--onboarding-accent, #4f8cff)"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            markerEnd="url(#onboarding-arrowhead)"
          />
        </svg>
      )}

      {/* 步骤卡片（固定底部中央） */}
      <div
        className="onboarding-card"
        data-testid="onboarding-card"
        data-step-index={onboarding.currentStepIndex}
        style={{
          left: cardLeft,
          width: cardWidth
        }}
      >
        <header className="onboarding-card__header">
          <span
            className="onboarding-card__progress"
            data-testid="onboarding-card__progress"
          >
            {uiText.progress(
              onboarding.currentStepIndex + 1,
              ONBOARDING_TOTAL_STEPS
            )}
          </span>
          <button
            type="button"
            className="onboarding-card__close"
            onClick={onSkip}
            aria-label={uiText.close}
            title={uiText.close}
            data-testid="onboarding-card__skip"
          >
            ×
          </button>
        </header>
        <h2
          className="onboarding-card__title"
          id="onboarding-overlay-title"
          data-testid="onboarding-card__title"
        >
          {stepText.title}
        </h2>
        <p
          className="onboarding-card__description"
          data-testid="onboarding-card__description"
        >
          {stepText.description}
        </p>
        <div
          className="onboarding-card__dots"
          role="presentation"
          aria-hidden="true"
        >
          {ONBOARDING_STEPS.map((s, idx) => (
            <span
              key={s.id}
              className={`onboarding-card__dot ${idx === onboarding.currentStepIndex ? 'is-active' : ''} ${idx < onboarding.currentStepIndex ? 'is-passed' : ''}`}
              data-testid={`onboarding-card__dot-${idx}`}
            />
          ))}
        </div>
        <footer className="onboarding-card__footer">
          <button
            type="button"
            className="onboarding-card__btn onboarding-card__btn--ghost"
            onClick={onboarding.prev}
            disabled={onboarding.currentStepIndex === 0}
            data-testid="onboarding-card__prev"
          >
            {uiText.prev}
          </button>
          <span className="onboarding-card__spacer" />
          <button
            type="button"
            className="onboarding-card__btn onboarding-card__btn--primary"
            onClick={() => {
              if (onboarding.isLastStep) {
                onComplete();
              } else {
                onboarding.next();
              }
            }}
            data-testid="onboarding-card__next"
          >
            {onboarding.isLastStep ? uiText.finish : uiText.next}
          </button>
        </footer>
      </div>

      {/* 隐藏目标时的占位（debug + 探针可读） */}
      {existsButHidden && (
        <div className="onboarding-overlay__hidden-hint" data-testid="onboarding-overlay__hidden-hint" aria-hidden="true">
          {language === 'en' ? 'Element not visible' : '目标元素未显示'}
        </div>
      )}
    </div>
  );
}
