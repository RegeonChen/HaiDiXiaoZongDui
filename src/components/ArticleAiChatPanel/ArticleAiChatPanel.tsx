import { useEffect, useRef } from 'react';
import type { AIChatMessage } from '@shared/types';
import { renderMarkdown } from '../../utils/markdown';
import './ArticleAiChatPanel.css';

interface ArticleAiChatPanelProps {
  open: boolean;
  articleTitle: string;
  messages: AIChatMessage[];
  draft: string;
  busy: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function ArticleAiChatPanel({
  open,
  articleTitle,
  messages,
  draft,
  busy,
  error,
  onDraftChange,
  onSend,
  onClear,
  onClose
}: ArticleAiChatPanelProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [open, messages, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <aside
      className="article-ai-chat"
      aria-label="文章 AI 助手"
      data-ai-chat-panel
    >
      <header className="article-ai-chat__header">
        <div className="article-ai-chat__heading">
          <strong>文章 AI 助手</strong>
          <span title={articleTitle}>基于「{articleTitle}」回答</span>
        </div>
        <div className="article-ai-chat__header-actions">
          <button
            type="button"
            className="article-ai-chat__icon-btn"
            onClick={onClear}
            disabled={messages.length === 0 || busy}
            title="清空当前对话"
            data-ai-chat-clear
          >
            清空
          </button>
          <button
            type="button"
            className="article-ai-chat__icon-btn"
            onClick={onClose}
            title="关闭文章 AI 助手"
            aria-label="关闭文章 AI 助手"
          >
            ×
          </button>
        </div>
      </header>

      <div className="article-ai-chat__messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="article-ai-chat__empty">
            <strong>可以直接询问这篇文章</strong>
            <span>例如：作者的核心观点是什么？这段论证成立吗？</span>
            <span>也可以在正文中划选文字后右键翻译或询问 AI。</span>
          </div>
        ) : (
          messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`article-ai-chat__message article-ai-chat__message--${message.role}`}
              data-ai-chat-message-role={message.role}
            >
              <span className="article-ai-chat__role">
                {message.role === 'user' ? '你' : 'AI'}
              </span>
              <div
                className="article-ai-chat__message-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
            </article>
          ))
        )}
        {busy && (
          <div className="article-ai-chat__thinking" data-ai-chat-thinking>
            <span aria-hidden="true">◌</span>
            AI 正在阅读并回答…
          </div>
        )}
        {error && (
          <div className="article-ai-chat__error" role="alert">
            {error}
          </div>
        )}
      </div>

      <form
        className="article-ai-chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={inputRef}
          className="article-ai-chat__input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="询问这篇文章…（Enter 发送，Shift+Enter 换行）"
          rows={3}
          maxLength={6000}
          disabled={busy}
          data-ai-chat-input
        />
        <button
          type="submit"
          className="article-ai-chat__send"
          disabled={busy || !draft.trim()}
          data-ai-chat-send
        >
          {busy ? '回答中…' : '发送'}
        </button>
      </form>
    </aside>
  );
}
