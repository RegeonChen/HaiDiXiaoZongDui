/**
 * TopicBriefingTab — 来源可追溯简报展示 + 生成 + 导出
 *  - 内容：renderMarkdown 渲染简报
 *  - 结论列表：每条 [N] + 支撑文章 ID 链接 + viewpointDiff
 *  - 操作：生成 / 保存编辑 / 导出 Markdown / 导出 HTML
 *  - 来源引用：使用 [来源: 订阅源名](文章URL) 格式
 */
import { useState } from 'react';
import type { Briefing, ExportFormat } from '@shared/types';
import { LoadingView } from '../../StatusView/LoadingView';
import { EmptyView } from '../../StatusView/EmptyView';
import { renderMarkdown } from '../../../utils/markdown';
import './TopicBriefingTab.css';

export interface TopicBriefingTabProps {
  briefing: Briefing | null | undefined;
  busy: boolean;
  onGenerate: () => Promise<void>;
  onSaveEdited: (content: string) => Promise<boolean>;
  onExport: (format: ExportFormat) => Promise<string | null>;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function TopicBriefingTab({
  briefing,
  busy,
  onGenerate,
  onSaveEdited,
  onExport,
  onToast: _onToast
}: TopicBriefingTabProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (briefing === undefined) {
    return <LoadingView message="正在加载简报…" />;
  }
  if (briefing === null) {
    return (
      <div className="topic-briefing__empty-state">
        <EmptyView
          title="还没有简报"
          hint="点击下方「生成简报」，系统会根据已缓存的专题脉络整理多源引用，不会额外调用模型。"
        />
        <button
          type="button"
          className="topic-briefing__generate-btn"
          onClick={() => void onGenerate()}
          disabled={busy}
        >
          {busy ? '生成中…' : '生成简报'}
        </button>
      </div>
    );
  }

  const startEdit = () => {
    setDraft(briefing.editedContent ?? briefing.content);
    setEditing(true);
  };

  const saveEdit = async () => {
    const ok = await onSaveEdited(draft);
    if (ok) setEditing(false);
  };

  const exportToFile = async (format: ExportFormat) => {
    const text = await onExport(format);
    if (text !== null) {
      // 触发浏览器下载
      const blob = new Blob([text], { type: format === 'html' ? 'text/html' : 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${briefing.title.replace(/[\\/:*?"<>|]/g, '-')}.${format === 'html' ? 'html' : 'md'}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <article className="topic-briefing">
      <header className="topic-briefing__header">
        <h2 className="topic-briefing__title">{briefing.title}</h2>
        <div className="topic-briefing__actions">
          {!editing && (
            <>
              <button
                type="button"
                className="topic-briefing__btn"
                onClick={() => void onGenerate()}
                disabled={busy}
                title="重新生成简报"
              >
                {busy ? '⏳ 生成中…' : '🔄 重新生成'}
              </button>
              <button
                type="button"
                className="topic-briefing__btn"
                onClick={startEdit}
              >
                ✎ 编辑
              </button>
              <button
                type="button"
                className="topic-briefing__btn"
                onClick={() => void exportToFile('markdown')}
              >
                ↓ Markdown
              </button>
              <button
                type="button"
                className="topic-briefing__btn"
                onClick={() => void exportToFile('html')}
              >
                ↓ HTML
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                type="button"
                className="topic-briefing__btn topic-briefing__btn--primary"
                onClick={() => void saveEdit()}
              >
                保存
              </button>
              <button
                type="button"
                className="topic-briefing__btn"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
            </>
          )}
        </div>
      </header>

      <div className="topic-briefing__meta">
        <span>生成于 {new Date(briefing.generatedAt).toLocaleString('zh-CN')}</span>
        <span>·</span>
        <span>覆盖 {briefing.sourceArticleIds.length} 篇文章</span>
        {briefing.editedContent && (
          <>
            <span>·</span>
            <span className="topic-briefing__edited-tag">已编辑</span>
          </>
        )}
      </div>

      <div className="topic-briefing__body">
        {editing ? (
          <textarea
            className="topic-briefing__editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
          />
        ) : (
          <div
            className="topic-briefing__content"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(briefing.editedContent ?? briefing.content)
            }}
          />
        )}
      </div>

      {briefing.conclusions.length > 0 && !editing && (
        <section className="topic-briefing__conclusions">
          <h3 className="topic-briefing__conclusions-title">
            结论追溯（{briefing.conclusions.length}）
          </h3>
          <ol className="topic-briefing__conclusions-list">
            {briefing.conclusions.map((c) => (
              <li key={c.index} className="topic-briefing__conclusion">
                <div className="topic-briefing__conclusion-head">
                  <span className="topic-briefing__conclusion-num">[{c.index}]</span>
                  <span className="topic-briefing__conclusion-text">{c.text}</span>
                </div>
                {c.supportingArticleIds.length > 0 && (
                  <div className="topic-briefing__conclusion-support">
                    <span className="topic-briefing__conclusion-support-label">
                      支撑文章（{c.supportingArticleIds.length}）：
                    </span>
                    <code className="topic-briefing__conclusion-ids">
                      {c.supportingArticleIds.join(', ')}
                    </code>
                  </div>
                )}
                {c.viewpointDiff && (
                  <div className="topic-briefing__conclusion-diff">
                    <span className="topic-briefing__conclusion-diff-label">观点差异：</span>
                    <span>{c.viewpointDiff}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
