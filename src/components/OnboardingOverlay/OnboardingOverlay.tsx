import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ONBOARDING_COPY,
  ONBOARDING_STEPS,
  type OnboardingLanguage
} from './onboarding-copy';
import { type TargetRect, useTargetRect } from './useTargetRect';
import './OnboardingOverlay.css';

type Placement = 'left' | 'right' | 'top' | 'bottom' | 'center';
const STEP_TRANSITION_MS = 220;

type SpotlightStyle = CSSProperties & {
  '--onboarding-spotlight-x'?: string;
  '--onboarding-spotlight-y'?: string;
  '--onboarding-spotlight-width'?: string;
  '--onboarding-spotlight-height'?: string;
};

export interface CoachmarkPosition {
  left: number;
  top: number;
  placement: Placement;
}

export function getCoachmarkPosition(
  target: TargetRect | null,
  viewportWidth: number,
  viewportHeight: number,
  cardWidth = 380,
  cardHeight = 300
): CoachmarkPosition {
  const gap = 18;
  const margin = 16;
  const clampLeft = (value: number) => Math.max(
    margin,
    Math.min(value, viewportWidth - cardWidth - margin)
  );
  const clampTop = (value: number) => Math.max(
    margin,
    Math.min(value, viewportHeight - cardHeight - margin)
  );

  if (!target || viewportWidth < 720) {
    return {
      left: clampLeft((viewportWidth - cardWidth) / 2),
      top: clampTop(viewportHeight - cardHeight - 22),
      placement: 'center'
    };
  }
  if (target.right + gap + cardWidth <= viewportWidth - margin) {
    return {
      left: target.right + gap,
      top: clampTop(target.top + (target.height - cardHeight) / 2),
      placement: 'right'
    };
  }
  if (target.left - gap - cardWidth >= margin) {
    return {
      left: target.left - gap - cardWidth,
      top: clampTop(target.top + (target.height - cardHeight) / 2),
      placement: 'left'
    };
  }
  if (target.bottom + gap + cardHeight <= viewportHeight - margin) {
    return {
      left: clampLeft(target.left + (target.width - cardWidth) / 2),
      top: target.bottom + gap,
      placement: 'bottom'
    };
  }
  return {
    left: clampLeft(target.left + (target.width - cardWidth) / 2),
    top: clampTop(target.top - gap - cardHeight),
    placement: 'top'
  };
}

export interface OnboardingOverlayProps {
  open: boolean;
  language: OnboardingLanguage;
  onDismiss: (reason: 'completed' | 'skipped') => Promise<boolean>;
}

export function OnboardingOverlay({
  open,
  language,
  onDismiss
}: OnboardingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = ONBOARDING_STEPS[stepIndex];
  const copy = ONBOARDING_COPY[language];
  const stepCopy = copy.steps[step.id];
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    setStepIndex(0);
    setStepTransitioning(false);
    setSaveError(false);
    requestAnimationFrame(() => cardRef.current?.focus());
  }, [open]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
  }, []);

  const moveToStep = (nextIndex: number) => {
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
    setStepTransitioning(true);
    setStepIndex(Math.max(0, Math.min(nextIndex, ONBOARDING_STEPS.length - 1)));
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      setStepTransitioning(false);
    }, STEP_TRANSITION_MS);
  };

  const commitDismiss = async (reason: 'completed' | 'skipped') => {
    if (busy) return;
    setBusy(true);
    setSaveError(false);
    const ok = await onDismiss(reason);
    if (!ok) setSaveError(true);
    setBusy(false);
  };

  const advanceMissingTarget = () => {
    if (!open || busy) return;
    if (isLast) {
      void commitDismiss('completed');
      return;
    }
    moveToStep(stepIndex + 1);
  };

  const targetRect = useTargetRect(
    open ? step.target : null,
    step.padding,
    advanceMissingTarget
  );
  const position = useMemo(
    () => getCoachmarkPosition(
      targetRect,
      typeof window === 'undefined' ? 1280 : window.innerWidth,
      typeof window === 'undefined' ? 800 : window.innerHeight
    ),
    [targetRect]
  );
  const spotlightStyle = useMemo<SpotlightStyle | undefined>(() => {
    if (!targetRect) return undefined;
    return {
      '--onboarding-spotlight-x': `${targetRect.left}px`,
      '--onboarding-spotlight-y': `${targetRect.top}px`,
      '--onboarding-spotlight-width': `${targetRect.width}px`,
      '--onboarding-spotlight-height': `${targetRect.height}px`
    };
  }, [targetRect]);

  if (!open) return null;

  const goNext = () => {
    setSaveError(false);
    if (isLast) {
      void commitDismiss('completed');
      return;
    }
    moveToStep(stepIndex + 1);
  };

  const goPrevious = () => {
    setSaveError(false);
    moveToStep(stepIndex - 1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (busy) return;
    if (event.key === 'Tab') {
      const focusable = Array.from(
        cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
      );
      if (focusable.length === 0) return;
      event.preventDefault();
      const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
      const next = current < 0
        ? (event.shiftKey ? focusable.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      void commitDismiss('skipped');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
      event.preventDefault();
      goPrevious();
    }
  };

  return (
    <div
      className="onboarding-overlay"
      data-testid="onboarding-overlay"
      data-onboarding-step={step.id}
      data-step-transitioning={stepTransitioning ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      style={spotlightStyle}
    >
      <svg className="onboarding-overlay__shade" aria-hidden="true">
        <defs>
          <mask id="onboarding-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                className="onboarding-overlay__mask-cutout"
                rx="7"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(8, 11, 18, 0.72)"
          mask="url(#onboarding-spotlight-mask)"
        />
      </svg>

      {targetRect && (
        <div
          className="onboarding-overlay__spotlight"
          data-testid="onboarding-spotlight"
        />
      )}

      <div
        className="onboarding-card-positioner"
        data-placement={position.placement}
        style={{
          transform: `translate3d(${position.left}px, ${position.top}px, 0)`
        }}
      >
        <div
          ref={cardRef}
          className="onboarding-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-description"
          data-placement={position.placement}
          data-testid="onboarding-card"
          tabIndex={-1}
        >
          <header className="onboarding-card__header">
            <div className="onboarding-card__brand" aria-hidden="true">
              <span className="onboarding-card__brand-mark">拾</span>
              <span>{copy.eyebrow}</span>
            </div>
            <button
              type="button"
              className="onboarding-card__skip"
              onClick={() => void commitDismiss('skipped')}
              disabled={busy}
              data-testid="onboarding-skip"
            >
              {copy.skip}
            </button>
          </header>

          <div
            className="onboarding-card__progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={ONBOARDING_STEPS.length}
            aria-valuenow={stepIndex + 1}
            aria-label={copy.progress(stepIndex + 1, ONBOARDING_STEPS.length)}
          >
            <div className="onboarding-card__progress-meta">
              <span>{copy.progress(stepIndex + 1, ONBOARDING_STEPS.length)}</span>
              <span>{stepCopy.hint}</span>
            </div>
            <div className="onboarding-card__progress-track">
              <span style={{ width: `${((stepIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
            </div>
          </div>

          <main key={step.id} className="onboarding-card__body">
            <span className="onboarding-card__step-number" aria-hidden="true">
              {String(stepIndex + 1).padStart(2, '0')}
            </span>
            <div>
              <h2 id="onboarding-title">{stepCopy.title}</h2>
              <p id="onboarding-description">{stepCopy.description}</p>
              {!targetRect && (
                <p className="onboarding-card__locating" role="status">{copy.locating}</p>
              )}
            </div>
          </main>

          <footer className="onboarding-card__footer">
            <div>
              <p className="onboarding-card__reopen-hint">{copy.reopenHint}</p>
              {saveError && (
                <p className="onboarding-card__error" role="alert">{copy.saveError}</p>
              )}
            </div>
            <div className="onboarding-card__actions">
              <button
                type="button"
                className="onboarding-card__button"
                onClick={goPrevious}
                disabled={stepIndex === 0 || busy}
                data-testid="onboarding-previous"
              >
                {copy.previous}
              </button>
              <button
                type="button"
                className="onboarding-card__button onboarding-card__button--primary"
                onClick={goNext}
                disabled={busy}
                data-testid="onboarding-next"
              >
                {isLast ? copy.finish : copy.next}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
