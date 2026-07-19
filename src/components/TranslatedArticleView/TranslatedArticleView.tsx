/**
 * TranslatedArticleView — 段落内翻译视图（Phase 3.5.2 张晨阳 前期准备）
 *
 * 渲染逻辑：
 *   1. 用 splitCleanedHtmlIntoBlocks 把 cleanedHtml 切分为独立块
 *   2. 每块渲染原文（dangerouslySetInnerHTML）
 *   3. 紧跟一个 TranslationSlot
 *   4. Slot 的 index 与块 index 对应；translationParagraphs[i] 缺失则保持 pending 占位
 *
 * 数据流：
 *   - paragraphs: AITranslationProgressEvent.paragraphs（IPC 已按段切分好的纯文本）
 *   - 与 blocks[i] 一一对应（按 index）
 */
import { useMemo } from 'react';
import { splitCleanedHtmlIntoBlocks } from '../../utils/html-split';
import { TranslationSlot, type TranslationParagraphStatus } from '../TranslationSlot/TranslationSlot';
import './TranslatedArticleView.css';

export interface TranslatedArticleViewProps {
  cleanedHtml: string;
  /**
   * 翻译段落数组（来自 IPC aiSubscribeTranslationProgress.paragraphs 或 aiGetTranslation）
   *  - 长度可能小于 blocks 数量（AI 还没返回足够多）
   *  - status 由调用方根据 IPC 事件推断（pending / ready / failed）
   */
  paragraphs: Array<{
    index: number;
    original: string;
    translated: string;
    status: TranslationParagraphStatus;
  }>;
}

export function TranslatedArticleView({ cleanedHtml, paragraphs }: TranslatedArticleViewProps) {
  const { blocks, fallback } = useMemo(() => splitCleanedHtmlIntoBlocks(cleanedHtml), [cleanedHtml]);

  // 把 paragraphs 按 index 索引化，方便按块查找
  const paragraphByIndex = useMemo(() => {
    const m = new Map<number, (typeof paragraphs)[number]>();
    for (const p of paragraphs) m.set(p.index, p);
    return m;
  }, [paragraphs]);

  return (
    <div className="translated-article-view" data-fallback={fallback ? 'true' : 'false'}>
      {blocks.map((block) => {
        const slot = paragraphByIndex.get(block.index);
        return (
          <div key={block.index} className="translated-article-view__block-pair">
            <div
              className="translated-article-view__block"
              data-block-index={block.index}
              data-block-tag={block.tag}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
            <TranslationSlot
              index={block.index}
              original={slot?.original ?? ''}
              translated={slot?.translated ?? ''}
              status={slot?.status ?? 'pending'}
            />
          </div>
        );
      })}
    </div>
  );
}
