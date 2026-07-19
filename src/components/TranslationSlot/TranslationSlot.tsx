/**
 * TranslationSlot — 单个翻译插槽（Phase 3.5.2 + Phase 3.6.1）
 *
 * Phase 3.6.1：翻译框只展示中文译文（不展示英文原文），
 * 并使用 filterInlineMarkdown 过滤只保留粗体/斜体/下划线。
 *
 * 三态：
 *   - pending：显示 spinner + "Waiting for AI response…"
 *   - ready：显示过滤后的中文译文
 *   - failed：显示错误提示
 */
import { filterInlineMarkdown } from '../../utils/markdown';
import './TranslationSlot.css';

export type TranslationParagraphStatus = 'pending' | 'ready' | 'failed';

export interface TranslationSlotProps {
  index: number;
  original: string;
  translated: string;
  status: TranslationParagraphStatus;
}

export function TranslationSlot({ index, status, translated }: TranslationSlotProps) {
  return (
    <div
      className={`translation-slot translation-slot--${status}`}
      data-translation-slot
      data-translation-index={index}
      data-translation-status={status}
    >
      {status === 'ready' ? (
        <div
          className="translation-slot__translated"
          dangerouslySetInnerHTML={{ __html: filterInlineMarkdown(translated) }}
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
