/**
 * TranslationSlot — 单个翻译插槽（Phase 3.5.2 张晨阳 前期准备）
 *
 * 三态：
 *   - pending：显示 spinner + "Waiting for AI response…"
 *   - ready：显示 Markdown 渲染后的译文
 *   - failed：显示错误提示
 */
import { renderMarkdown } from '../../utils/markdown';
import './TranslationSlot.css';

export type TranslationParagraphStatus = 'pending' | 'ready' | 'failed';

export interface TranslationSlotProps {
  index: number;
  original: string;
  translated: string;
  status: TranslationParagraphStatus;
}

export function TranslationSlot({ index, status, original, translated }: TranslationSlotProps) {
  // 始终展示原文（用于上下文对照）
  return (
    <div
      className={`translation-slot translation-slot--${status}`}
      data-translation-slot
      data-translation-index={index}
      data-translation-status={status}
    >
      <div
        className="translation-slot__original"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(original) }}
      />
      {status === 'ready' ? (
        <div
          className="translation-slot__translated"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(translated) }}
        />
      ) : status === 'pending' ? (
        <div className="translation-slot__status translation-slot__status--pending" role="status" aria-live="polite">
          <div className="translation-slot__spinner" aria-hidden="true" />
          <span>Waiting for AI response…</span>
        </div>
      ) : (
        <div className="translation-slot__status translation-slot__status--failed" role="status" aria-live="polite">
          翻译失败
        </div>
      )}
    </div>
  );
}
