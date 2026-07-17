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
import type { Topic } from '@shared/types';
import './TopicFormDialog.css';

export interface TopicFormValue {
  name: string;
  description: string;
  keywords: string[];
}

export interface TopicFormDialogProps {
  mode: 'create' | 'edit';
  initial?: Topic;
  onSubmit: (value: TopicFormValue) => void | Promise<void>;
  onClose: () => void;
}

function parseKeywords(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,,]/) // 中英文逗号
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    )
  );
}

function stringifyKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

export function TopicFormDialog({ mode, initial, onSubmit, onClose }: TopicFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [keywordsRaw, setKeywordsRaw] = useState(stringifyKeywords(initial?.keywords ?? []));
  const [submitting, setSubmitting] = useState(false);

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
              placeholder="如：AI 安全 / 加密货币 / 课程作业"
              required
              autoFocus
            />
          </div>
          <div className="topic-form-dialog__row">
            <label className="topic-form-dialog__label">描述</label>
            <textarea
              className="topic-form-dialog__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说清楚这个专题关注什么"
              rows={3}
            />
          </div>
          <div className="topic-form-dialog__row">
            <label className="topic-form-dialog__label">关键词</label>
            <input
              className="topic-form-dialog__input"
              type="text"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              placeholder="逗号分隔，如：llm, agent, rag"
            />
            <span className="topic-form-dialog__hint">
              关键词用于文章匹配，匹配时对文章标题和正文做模糊匹配（全部小写）。
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
            disabled={submitting || !name.trim()}
          >
            {submitting ? '提交中…' : mode === 'create' ? '创建' : '保存'}
          </button>
        </footer>
      </form>
    </div>
  );
}
