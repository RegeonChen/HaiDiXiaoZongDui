import { useEffect, useRef } from 'react';
import type { AIChatMessage } from '@shared/types';
import { renderMarkdown } from '../../utils/markdown';
import { EmptyView } from '../StatusView/EmptyView';
import './ArticleAiChatPanel.css';

interface ArticleAiChatPanelProps {
  open: boolean;
  messages: AIChatMessage[];
  draft: string;
  busy: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function ArticleAiChatPanel({
  open,
  messages,
  draft,
  busy,
  error,
  onDraftChange,
  onSend
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
      <div className="article-ai-chat__messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <EmptyView
            className="article-ai-chat__empty"
            title="可以直接询问这篇文章"
            hint={
              <>
                例如询问作者的核心观点或论证是否成立。
                <br />
                也可以在正文中划选文字后右键翻译或询问 AI。
              </>
            }
          />
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
