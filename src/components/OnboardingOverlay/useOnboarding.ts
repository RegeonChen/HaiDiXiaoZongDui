/**
 * Phase 4.3.1：新手引导浮层状态管理
 *
 * 状态：
 *   - currentStepIndex: 当前展示的步骤下标（0..N-1）
 *   - 全部 step 都不 ready（极端情况）→ currentStepIsHidden=true 持续，
 *     调用方需要决定是自动 onComplete() 还是显示"无内容"提示
 *
 * API：
 *   - next() / prev(): 上一步/下一步，自动跳过缺失步骤
 *   - skip() / complete(): 由调用方直接通过 props 通知父组件
 *   - restart(): 显式重置（用于设置页"新手引导"入口）
 *
 * 元素缺失处理：
 *   - 每次 currentStepIndex 或 isElementReady 变化时，如果当前 step 不 ready → 自动跳
 *   - 全部 step 都不 ready 时 currentStepIsHidden 保持 true
 *   - 跳到末位后仍不 ready → isLastStep=true + currentStepIsHidden=true
 *     调用方用 useEffect 监测这种情况并自动 onComplete()
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ONBOARDING_STEPS } from './onboardingSteps';

export interface UseOnboardingArgs {
  /** 浮层是否对外可见（由父组件控制） */
  visible: boolean;
  /** 步骤就绪判定：返回 false 时视为缺失，自动跳到下一个 */
  isElementReady: (stepIndex: number) => boolean;
}

export interface UseOnboardingResult {
  currentStepIndex: number;
  totalSteps: number;
  /** 当前是否在"最后一步" */
  isLastStep: boolean;
  /** 当前步骤是否被 skip（用于显示"该步骤在当前界面下不可见"提示） */
  currentStepIsHidden: boolean;
  /** 跳到下一步（缺失自动 skip 多个） */
  next: () => void;
  /** 跳到上一步（缺失自动 skip 多个） */
  prev: () => void;
  /** 重置到第一步（用于设置页"新手引导"入口） */
  restart: () => void;
}

export function useOnboarding({ isElementReady }: UseOnboardingArgs): UseOnboardingResult {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const totalSteps = ONBOARDING_STEPS.length;

  // 找到一个 ready 的 step 从 start 出发沿 direction 方向搜索
  // 找不到时返回 -1
  const findReady = useCallback(
    (start: number, direction: 1 | -1): number => {
      let next = start + direction;
      let guard = 0;
      while (next >= 0 && next < totalSteps) {
        if (isElementReady(next)) return next;
        next += direction;
        guard += 1;
        if (guard > totalSteps) return -1;
      }
      return -1;
    },
    [isElementReady, totalSteps]
  );

  // 当 currentStepIndex 或 isElementReady 变化时，如果当前 step 不 ready → 自动跳
  useEffect(() => {
    if (isElementReady(currentStepIndex)) return;
    const found = findReady(currentStepIndex, 1);
    if (found === -1) return; // 找不到 ready 的 → 保持 currentStepIsHidden=true（由父处理）
    setCurrentStepIndex(found);
  }, [currentStepIndex, isElementReady, findReady]);

  const next = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const found = findReady(prev, 1);
      if (found === -1) {
        // 已到末位 + 全部不 ready → 跳到 totalSteps-1 视为到达末尾
        return Math.min(totalSteps - 1, prev);
      }
      return found;
    });
  }, [findReady, totalSteps]);

  const prev = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const found = findReady(prev, -1);
      if (found === -1) return 0;
      return found;
    });
  }, [findReady]);

  const restart = useCallback(() => {
    setCurrentStepIndex(0);
  }, []);

  const isLastStep = currentStepIndex >= totalSteps - 1;
  const currentStepIsHidden = useMemo(
    () => !isElementReady(currentStepIndex),
    [isElementReady, currentStepIndex]
  );

  return {
    currentStepIndex,
    totalSteps,
    isLastStep,
    currentStepIsHidden,
    next,
    prev,
    restart
  };
}
