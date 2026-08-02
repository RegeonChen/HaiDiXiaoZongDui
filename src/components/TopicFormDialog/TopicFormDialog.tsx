/**
 * TopicFormDialog — 专题创建/编辑对话框
 *
 * Phase 4.1：
 *   - name（必填）
 *   - description（可选）
 *   - keywords（可选，逗号分隔，自动去空 + 去重 + 转小写）
 *   - Esc / 点 backdrop 关闭
 */
import { useEffect, useState } from 'react';
import type { Topic, TopicNameSuggestion } from '@shared/types';
import './TopicFormDialog.css';

export interface TopicFormValue {
  name: string;
  description: string;
  keywords: string[];
}

export interface TopicFormDialogProps {
  mode: 'create' | 'edit';
  initial?: Topic;
  initialValue?: Partial<TopicFormValue>;
  recommendationStatus?: 'loading' | 'ready' | 'error';
  recommendations?: TopicNameSuggestion[];
  recommendationError?: string | null;
  onRefreshRecommendations?: () => void;
  onSubmit: (value: TopicFormValue) => void | Promise<void>;
  onClose: () => void;
}

function parseKeywords(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,，]/) // 中英文逗号
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    )
  );
}

function stringifyKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

function recommendationErrorHint(error: string): string {
  if (/NO_PROVIDER|未设置默认 AI Provider|Provider 不存在/i.test(error)) {
    return '请先在设置中配置并启用默认 AI Provider。';
  }
  if (/AI_TOPIC_TIMEOUT|超时|timeout/i.test(error)) {
    return '模型响应超时，可稍后重新推荐。';
  }
  if (/AI_TOPIC_AUTH_FAILED|HTTP\s+(?:401|403)|unauthori[sz]ed|forbidden/i.test(error)) {
    return 'AI Provider 鉴权失败，请检查 API Key 和模型权限。';
  }
  if (/AI_TOPIC_RATE_LIMITED|HTTP\s+429|rate[ _-]*limit|too many requests/i.test(error)) {
    return '模型服务当前请求较多，请稍后重新推荐。';
  }
  if (/AI_TOPIC_NETWORK_FAILED|AI_TOPIC_PROVIDER_UNAVAILABLE|fetch failed|network|HTTP\s+5\d\d/i.test(error)) {
    return '暂时无法连接模型服务，请检查网络或稍后重试。';
  }
  if (/AI_TOPIC_EMPTY_RESPONSE|模型返回空内容|未返回 choices/i.test(error)) {
    return '模型没有返回可用答案，可点击“重新推荐”再试。';
  }
  if (/AI_TOPIC_NO_USABLE_SUGGESTIONS|模型未生成可用的专题推荐/i.test(error)) {
    return '模型候选与文章内容不够匹配，可调整本地草案或重新推荐。';
  }
  if (/AI_TOPIC_INVALID_RESPONSE|不是有效 JSON|invalid\s+json|json\s+parse/i.test(error)) {
    return '模型返回格式异常，可点击“重新推荐”再试。';
  }
  return '可点击“重新推荐”再试。';
}

export function TopicFormDialog({
  mode,
  initial,
  initialValue,
  recommendationStatus,
  recommendations = [],
  recommendationError,
  onRefreshRecommendations,
  onSubmit,
  onClose
}: TopicFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? initialValue?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? initialValue?.description ?? '');
  const [keywordsRaw, setKeywordsRaw] = useState(
    stringifyKeywords(initial?.keywords ?? initialValue?.keywords ?? [])
  );
  const [submitting, setSubmitting] = useState(false);
  const waitingForRecommendation = recommendationStatus === 'loading';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        keywords: parseKeywords(keywordsRaw)
      });
    } finally {
      setSubmitting(false);
    }
  };

  const applyRecommendation = (suggestion: TopicNameSuggestion) => {
    setName(suggestion.name);
    setDescription(suggestion.description);
    setKeywordsRaw(stringifyKeywords(suggestion.keywords));
  };

  return (
    <div className="topic-form-dialog__backdrop" onClick={onClose}>
      <form
        className="topic-form-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-form-dialog-title"
      >
        <header className="topic-form-dialog__header">
          <h2 id="topic-form-dialog-title" className="topic-form-dialog__title">
            {mode === 'create' ? '新建专题' : '编辑专题'}
          </h2>
          <button
            type="button"
            className="topic-form-dialog__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="topic-form-dialog__body">
          <div className="topic-form-dialog__row">
            <label className="topic-form-dialog__label">
              名称 <span className="topic-form-dialog__required">*</span>
            </label>
            <input
              className="topic-form-dialog__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：GPT-5.6 / AI 安全 / 开源模型"
              required
              autoFocus
              disabled={waitingForRecommendation || submitting}
            />
          </div>
          {mode === 'create' && recommendationStatus && (
            <section
              className="topic-form-dialog__recommendations"
              aria-label="AI 推荐专题名"
              data-testid="topic-form__recommendations"
            >
              <div className="topic-form-dialog__recommendations-header">
                <div>
                  <strong>AI 推荐专题名</strong>
                  <span>选择时会同步更新描述和匹配关键词</span>
                </div>
                {onRefreshRecommendations && (
                  <button
                    type="button"
                    className="topic-form-dialog__refresh"
                    onClick={onRefreshRecommendations}
                    disabled={waitingForRecommendation || submitting}
                    data-testid="topic-form__refresh-recommendations"
                  >
                    {waitingForRecommendation ? '分析中…' : '重新推荐'}
                  </button>
                )}
              </div>
              {waitingForRecommendation ? (
                <div
                  className="topic-form-dialog__recommendation-state"
                  role="status"
                  data-testid="topic-form__recommendations-loading"
                >
                  AI 正在识别适合跨文章追踪的主体与范围…
                </div>
              ) : recommendationStatus === 'error' ? (
                <div
                  className="topic-form-dialog__recommendation-state topic-form-dialog__recommendation-state--error"
                  role="status"
                  data-testid="topic-form__recommendations-error"
                >
                  AI 推荐暂不可用，已保留可编辑的本地草案。
                  {recommendationError ? ` ${recommendationErrorHint(recommendationError)}` : ''}
                </div>
              ) : (
                <div className="topic-form-dialog__recommendation-list">
                  {recommendations.map((suggestion, index) => (
                    <button
                      key={suggestion.name}
                      type="button"
                      className={`topic-form-dialog__recommendation ${name === suggestion.name ? 'is-selected' : ''}`}
                      onClick={() => applyRecommendation(suggestion)}
                      disabled={submitting}
                      aria-pressed={name === suggestion.name}
                      data-testid={`topic-form__recommendation-${index}`}
                    >
                      <span className="topic-form-dialog__recommendation-name">
                        <span className="topic-form-dialog__recommendation-title">
                          {suggestion.name}
                        </span>
                        {index === 0 && <span className="topic-form-dialog__primary-badge">默认</span>}
                      </span>
                      {suggestion.reason && (
                        <span className="topic-form-dialog__recommendation-reason">
                          {suggestion.reason}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="topic-form-dialog__row">
            <label className="topic-form-dialog__label">描述</label>
            <textarea
              className="topic-form-dialog__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说清楚这个专题关注什么"
              rows={3}
              disabled={waitingForRecommendation || submitting}
            />
          </div>
          <div className="topic-form-dialog__row">
            <label className="topic-form-dialog__label">关键词</label>
            <input
              className="topic-form-dialog__input"
              type="text"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              placeholder="逗号分隔，如：GPT-5.6, OpenAI, benchmark"
              disabled={waitingForRecommendation || submitting}
            />
            <span className="topic-form-dialog__hint">
              系统先在本地匹配标题、摘要和清洗正文；反复打开专题不会重复消耗 Token。
            </span>
          </div>
        </div>
        <footer className="topic-form-dialog__footer">
          <button
            type="button"
            className="topic-form-dialog__btn"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            className="topic-form-dialog__btn topic-form-dialog__btn--primary"
            disabled={submitting || waitingForRecommendation || !name.trim()}
          >
            {submitting ? '提交中…' : mode === 'create' ? '创建' : '保存'}
          </button>
        </footer>
      </form>
    </div>
  );
}
