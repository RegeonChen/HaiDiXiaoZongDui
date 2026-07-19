/**
 * TranslatedArticleView — 段落内翻译视图（Phase 3.5.2）
 *
 * 渲染逻辑：
 *   1. 用 useEffect 通过 DataSource.htmlBlockSplit 切分 cleanedHtml
 *   2. 每块渲染原文（dangerouslySetInnerHTML）
 *   3. 有正文文本的块紧跟一个 TranslationSlot；纯图片/分隔线块不创建插槽
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
import { SplitController } from '../../utils/split-controller';
import { htmlBlockHasTranslatableText } from '../../utils/html-split';
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
  /** 隐藏双语视图并回到原始正文。 */
  onClose: () => void;
}

type SplitState =
  | { kind: 'loading' }
  | { kind: 'ready'; blocks: HtmlBlock[] }
  | { kind: 'error'; error: string };

export function TranslatedArticleView({ cleanedHtml, paragraphs, onClose }: TranslatedArticleViewProps) {
  const ds = useDataSource();
  const [split, setSplit] = useState<SplitState>({ kind: 'ready', blocks: [] });
  // SplitController：用 token 计数替代 effect 局部 cancelled，
  // 避免 React 18 StrictMode dev 双调 mount 把 split 永远卡在"正在切分段落…"
  // （之前局部 cancelled 变量方案在 dev 模式会因 cleanup1 把 async 取消，
  // 即使 mount 2 没重跑，async 完成时 setSplit({ready}) 也被 cancel 掉）。
  // 详见 src/utils/split-controller.ts 单元测试。
  const controllerRef = useRef<SplitController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SplitController();
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.start(
      cleanedHtml,
      (html) => ds.htmlBlockSplit(html),
      {
        onLoading: () => setSplit({ kind: 'loading' }),
        onReady: (blocks) => setSplit({ kind: 'ready', blocks }),
        onError: (error) => setSplit({ kind: 'error', error }),
        onFallback: (html) => setSplit({
          kind: 'ready',
          blocks: [{ index: 0, html, tag: 'DIV' }]
        })
      }
    );
    // 不需要 cleanup：SplitController.start 内部用 token 校验，
    // 下次 start 会让前一次 async 回调自动忽略
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
      <div className="translated-article-view__controls">
        <button
          type="button"
          className="translated-article-view__hide-button"
          onClick={onClose}
        >
          隐藏翻译，返回原文
        </button>
      </div>
      {effectiveBlocks.map((block) => {
        const slot = paragraphByIndex.get(block.index);
        const hasTranslatableText = htmlBlockHasTranslatableText(block.html);
        return (
          <div key={block.index} className="translated-article-view__block-pair">
            <div
              className="translated-article-view__block"
              data-block-index={block.index}
              data-block-tag={block.tag}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
            {hasTranslatableText && (
              <TranslationSlot
                index={block.index}
                original={slot?.original ?? ''}
                translated={slot?.translated ?? ''}
                status={slot?.status ?? 'pending'}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
