/**
 * TranslatedArticleView — 段落内翻译视图（Phase 3.5.2）
 *
 * 渲染逻辑：
 *   1. 用 useEffect 通过 DataSource.htmlBlockSplit 切分 cleanedHtml
 *   2. 每块渲染原文（dangerouslySetInnerHTML）
 *   3. 紧跟一个 TranslationSlot
 *   4. Slot 的 index 与块 index 对应；translationParagraphs[i] 缺失则保持 pending 占位
 *
 * 数据流：
 *   - blocks: 主进程 splitCleanedHtmlIntoBlocks 返回（IPC `content:splitHtmlBlocks`）
 *   - paragraphs: AITranslationProgressEvent.paragraphs（IPC 流式推送或 aiGetTranslation）
 *   - 与 blocks[i] 一一对应（按 index）
 */
import { useEffect, useRef, useState } from 'react';
import type { HtmlBlock } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
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

type SplitState =
  | { kind: 'loading' }
  | { kind: 'ready'; blocks: HtmlBlock[] }
  | { kind: 'error'; error: string };

export function TranslatedArticleView({ cleanedHtml, paragraphs }: TranslatedArticleViewProps) {
  const ds = useDataSource();
  const [split, setSplit] = useState<SplitState>({ kind: 'ready', blocks: [] });
  // 缓存上次切分的 cleanedHtml，避免 React 18 父组件 re-render 时 useEffect
  // 反复跑导致 ready 状态被 setLoading 覆盖的无限循环
  // （cleanedHtml prop 引用每次 render 都新，依赖 [cleanedHtml] 会持续触发）
  const lastSplitHtmlRef = useRef<string>('');

  // Phase 3.5.2：每篇文章用 DataSource.htmlBlockSplit 切块（走 IPC 调到张宇凡的
  // splitCleanedHtmlIntoBlocks）。
  // 关键：只在 cleanedHtml 实际内容变化时重跑（用 useRef 比较避免引用比较的循环）。
  useEffect(() => {
    if (cleanedHtml === lastSplitHtmlRef.current) {
      // 引用虽然变了（每次 render 新字符串），但内容相同——不重跑
      return;
    }
    if (!cleanedHtml.trim()) {
      lastSplitHtmlRef.current = cleanedHtml;
      setSplit({ kind: 'ready', blocks: [] });
      return;
    }
    lastSplitHtmlRef.current = cleanedHtml;
    setSplit({ kind: 'loading' });
    let cancelled = false;
    void (async () => {
      const r = await ds.htmlBlockSplit(cleanedHtml);
      if (cancelled) return;
      if (r.kind === 'ready') {
        setSplit({ kind: 'ready', blocks: r.data });
      } else if (r.kind === 'error') {
        setSplit({ kind: 'error', error: r.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cleanedHtml, ds]);

  // 把 paragraphs 按 index 索引化，方便按块查找
  const paragraphByIndex = new Map<number, (typeof paragraphs)[number]>();
  for (const p of paragraphs) paragraphByIndex.set(p.index, p);

  // 始终渲染外层 div（即使在 loading 状态），让调用方能立即检测组件挂载
  // 并按 data-split-state 区分 ready/loading/error。
  if (split.kind === 'loading') {
    return (
      <div
        className="translated-article-view translated-article-view--loading"
        data-split-state="loading"
      >
        <LoadingView message="正在切分段落…" />
      </div>
    );
  }
  if (split.kind === 'error') {
    return (
      <div
        className="translated-article-view translated-article-view--error"
        data-split-state="error"
      >
        <ErrorView message={split.error} />
      </div>
    );
  }

  const { blocks } = split;

  // fallback：如果切出来是 0 块，把整篇当一块
  const effectiveBlocks: HtmlBlock[] = blocks.length > 0
    ? blocks
    : [{ index: 0, html: cleanedHtml, tag: 'DIV' }];

  return (
    <div
      className="translated-article-view"
      data-split-state="ready"
      data-fallback={blocks.length === 0 ? 'true' : 'false'}
    >
      {effectiveBlocks.map((block) => {
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
