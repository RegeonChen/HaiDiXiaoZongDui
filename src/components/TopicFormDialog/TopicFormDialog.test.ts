// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopicNameSuggestion } from '@shared/types';
import { TopicFormDialog } from './TopicFormDialog';

const suggestions: TopicNameSuggestion[] = [
  {
    name: 'GPT 模型演进',
    description: '追踪 GPT 系列的能力与评测变化。',
    keywords: ['GPT', 'OpenAI'],
    reason: '可连接后续版本与多源评测。'
  },
  {
    name: '编程智能体进展',
    description: '关注编程智能体的工具使用与长任务可靠性。',
    keywords: ['coding agent', '工具调用'],
    reason: '可跨模型和产品持续追踪。'
  }
];

describe('TopicFormDialog AI recommendations', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('默认使用第一个 AI 草案，选择备选时同步替换名称、描述和关键词', async () => {
    const onSubmit = vi.fn();
    await act(async () => {
      root.render(createElement(TopicFormDialog, {
        mode: 'create',
        initialValue: suggestions[0],
        recommendationStatus: 'ready',
        recommendations: suggestions,
        onSubmit,
        onClose: () => undefined
      }));
    });

    const name = container.querySelector<HTMLInputElement>('.topic-form-dialog__input');
    const description = container.querySelector<HTMLTextAreaElement>('.topic-form-dialog__textarea');
    const inputs = container.querySelectorAll<HTMLInputElement>('.topic-form-dialog__input');
    expect(name?.value).toBe('GPT 模型演进');
    expect(container.querySelectorAll('[data-testid^="topic-form__recommendation-"]')).toHaveLength(2);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="topic-form__recommendation-1"]')?.click();
    });

    expect(name?.value).toBe('编程智能体进展');
    expect(description?.value).toBe('关注编程智能体的工具使用与长任务可靠性。');
    expect(inputs[1]?.value).toBe('coding agent, 工具调用');

    await act(async () => {
      container.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });
    expect(onSubmit).toHaveBeenCalledWith({
      name: '编程智能体进展',
      description: '关注编程智能体的工具使用与长任务可靠性。',
      keywords: ['coding agent', '工具调用']
    });
  });

  it('等待 AI 时禁用创建，失败后保留本地草案并允许重试', async () => {
    const retry = vi.fn();
    await act(async () => {
      root.render(createElement(TopicFormDialog, {
        mode: 'create',
        initialValue: { name: '本地草案' },
        recommendationStatus: 'loading',
        onRefreshRecommendations: retry,
        onSubmit: () => undefined,
        onClose: () => undefined
      }));
    });
    expect(container.querySelector('[data-testid="topic-form__recommendations-loading"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.topic-form-dialog__btn--primary')?.disabled).toBe(true);

    await act(async () => {
      root.render(createElement(TopicFormDialog, {
        mode: 'create',
        initialValue: { name: '本地草案' },
        recommendationStatus: 'error',
        recommendationError: 'NO_PROVIDER',
        onRefreshRecommendations: retry,
        onSubmit: () => undefined,
        onClose: () => undefined
      }));
    });
    expect(container.querySelector('[data-testid="topic-form__recommendations-error"]')?.textContent)
      .toContain('NO_PROVIDER');
    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="topic-form__refresh-recommendations"]');
    expect(refresh?.disabled).toBe(false);
    await act(async () => refresh?.click());
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
