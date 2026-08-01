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
                  {recommendationError ? ` ${recommendationError}` : ''}
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
                        {suggestion.name}
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
