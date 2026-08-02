/**
 * TopicDetail — 专题详情（脉络图 / 文章 / 简报）
 *
 * 4 tab 内部 sub-state 切换，不污染 Layout.AppPage。
 * 4 tab 复用同一个 Article 列表 / 简报组件，差异化展示。
 */
import { useCallback, useEffect, useState } from 'react';
import type { Article, Briefing, Feed, Topic, TopicGraph } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import { TopicArticlesTab } from './tabs/TopicArticlesTab';
import { TopicBriefingTab } from './tabs/TopicBriefingTab';
import { TopicFormDialog } from '../TopicFormDialog/TopicFormDialog';
import { TopicGraphView } from '../TopicGraph/TopicGraphView';
import { formatUserFacingError } from '../../utils/user-facing-error';
import './TopicDetail.css';

export type TopicTab = 'graph' | 'articles' | 'briefing';

export interface TopicDetailProps {
  topicId: string;
  onBack: () => void;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  onOpenArticle: (article: Article) => void;
}

const TAB_ITEMS: Array<{ id: TopicTab; label: string; icon: string; description: string }> = [
  { id: 'graph', label: '脉络图', icon: '⌁', description: '按时间与发展方向展示事件演化' },
  { id: 'articles', label: '文章', icon: '📰', description: '该专题关联的所有文章' },
  { id: 'briefing', label: '简报', icon: '📋', description: '从演化图生成带原文引用的专题简报' }
];

export function TopicDetail({ topicId, onBack, onToast, onOpenArticle }: TopicDetailProps) {
  const ds = useDataSource();
  const [topic, setTopic] = useState<Topic | null | undefined>(undefined);
  const [tab, setTab] = useState<TopicTab>('graph');
  const [editing, setEditing] = useState(false);

  // 缓存 feeds（用于 Articles tab 显示订阅源名）
  const [feeds, setFeeds] = useState<Feed[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await ds.feeds();
      if (r.kind === 'ready') setFeeds(r.data);
    })();
  }, [ds]);

  // 加载专题本身
  const refreshTopic = useCallback(async () => {
    const r = await ds.topicGet(topicId);
    if (r.kind === 'ready') {
      setTopic(r.data);
    } else {
      setTopic(null);
    }
  }, [ds, topicId]);

  useEffect(() => {
    void refreshTopic();
  }, [refreshTopic]);

  // 详情 tab 共享数据（按需 lazy load）
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [graph, setGraph] = useState<TopicGraph | null | undefined>(undefined);
  const [graphRefreshing, setGraphRefreshing] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const loadGraph = useCallback(async () => {
    setGraphRefreshing(true);
    try {
      const [graphResult, articleResult] = await Promise.all([
        ds.topicGetGraph(topicId),
        ds.topicGetArticles(topicId)
      ]);
      if (graphResult.kind === 'ready') {
        setGraph(graphResult.data);
      } else {
        setGraph(null);
        onToast(
          `脉络图生成失败：${graphResult.kind === 'error' ? formatUserFacingError(graphResult.error, 'load') : '数据尚未准备完成，请重试。'}`,
          'error'
        );
      }
      if (articleResult.kind === 'ready') {
        setArticles(articleResult.data);
      } else {
        setArticles([]);
        onToast(
          `专题文章加载失败：${articleResult.kind === 'error' ? formatUserFacingError(articleResult.error, 'load') : '数据尚未准备完成，请重试。'}`,
          'error'
        );
      }
    } finally {
      setGraphRefreshing(false);
    }
  }, [ds, onToast, topicId]);

  // 切到 tab 时按需加载
  useEffect(() => {
    if (tab === 'graph' && graph === undefined && !graphRefreshing) {
      void loadGraph();
    } else if (tab === 'articles' && articles === null) {
      void (async () => {
        const r = await ds.topicGetArticles(topicId);
        if (r.kind === 'ready') {
          setArticles(r.data);
        } else {
          setArticles([]);
          onToast(
            `专题文章加载失败：${r.kind === 'error' ? formatUserFacingError(r.error, 'load') : '数据尚未准备完成，请重试。'}`,
            'error'
          );
        }
      })();
    } else if (tab === 'briefing' && briefing === undefined) {
      void (async () => {
        const r = await ds.topicGetBriefing(topicId);
        if (r.kind === 'ready') {
          setBriefing(r.data);
        } else {
          setBriefing(null);
          onToast(
            `专题简报加载失败：${r.kind === 'error' ? formatUserFacingError(r.error, 'load') : '数据尚未准备完成，请重试。'}`,
            'error'
          );
        }
      })();
    }
  }, [tab, topicId, articles, graph, graphRefreshing, briefing, ds, loadGraph, onToast]);

  if (topic === undefined) {
    return <LoadingView message="正在加载专题…" />;
  }
  if (topic === null) {
    return <ErrorView message="专题不存在或加载失败" onRetry={onBack} />;
  }

  const handleGenerateBriefing = async () => {
    setBusy(true);
    try {
      const r = await ds.topicGenerateBriefing(topicId);
      if (r.ok) {
        onToast('简报生成中…', 'info');
        // 重新拉一次
        const r2 = await ds.topicGetBriefing(topicId);
        if (r2.kind === 'ready') {
          setBriefing(r2.data);
          onToast('简报已生成', 'success');
        } else {
          onToast(
            `读取简报失败：${r2.kind === 'error' ? formatUserFacingError(r2.error, 'load') : '结果尚未准备完成，请重试。'}`,
            'error'
          );
        }
      } else {
        onToast(`简报生成失败：${formatUserFacingError(r.message, 'ai')}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="topic-detail">
      <header className="topic-detail__header">
        <button
          type="button"
          className="topic-detail__back-btn"
          onClick={onBack}
          title="返回专题列表"
        >
          ← 返回专题列表
        </button>
        <div className="topic-detail__title-row">
          <h1 className="topic-detail__title">{topic.name}</h1>
          <div className="topic-detail__actions">
            <button
              type="button"
              className="topic-detail__action-btn"
              onClick={() => setEditing(true)}
            >
              编辑
            </button>
          </div>
        </div>
        {topic.description && (
          <p className="topic-detail__desc">{topic.description}</p>
        )}
        {topic.keywords.length > 0 && (
          <div className="topic-detail__keywords">
            {topic.keywords.map((kw) => (
              <span key={kw} className="topic-detail__keyword">
                {kw}
              </span>
            ))}
          </div>
        )}
      </header>

      <nav className="topic-detail__tabs" role="tablist">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`topic-detail__tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
            title={t.description}
            data-tab={t.id}
          >
            <span className="topic-detail__tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="topic-detail__tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <section className="topic-detail__content" data-active-tab={tab}>
        {tab === 'graph' && (
          graph === undefined ? (
            <LoadingView message="正在关联文章并生成专题脉络…" />
          ) : graph === null ? (
            <ErrorView message="专题脉络生成失败" onRetry={() => void loadGraph()} />
          ) : (
            <TopicGraphView
              graph={graph}
              articles={articles ?? []}
              feeds={feeds}
              refreshing={graphRefreshing}
              onRefresh={() => void loadGraph()}
              onOpenArticle={onOpenArticle}
            />
          )
        )}
        {tab === 'articles' && (
          <TopicArticlesTab
            articles={articles}
            feeds={feeds}
            onToast={onToast}
            onOpenArticle={onOpenArticle}
          />
        )}
        {tab === 'briefing' && (
          <TopicBriefingTab
            briefing={briefing}
            busy={busy}
            onGenerate={handleGenerateBriefing}
            onSaveEdited={async (content) => {
              const r = await ds.topicUpdateBriefing(topicId, content);
              if (r.kind === 'ready') {
                setBriefing(r.data);
                onToast('简报已保存', 'success');
                return true;
              }
              onToast(
                `保存失败：${r.kind === 'error' ? formatUserFacingError(r.error, 'save') : '简报尚未准备完成，请重试。'}`,
                'error'
              );
              return false;
            }}
            onExport={async (format) => {
              const r = await ds.topicExportBriefing(topicId, format);
              if (r.kind === 'ready') {
                onToast(`已导出 ${format.toUpperCase()}（${r.data.length} 字符）`, 'success');
                return r.data;
              }
              onToast(
                `导出失败：${r.kind === 'error' ? formatUserFacingError(r.error, 'general') : '简报尚未准备完成，请重试。'}`,
                'error'
              );
              return null;
            }}
            onToast={onToast}
          />
        )}
      </section>

      {editing && (
        <TopicFormDialog
          mode="edit"
          initial={topic}
          onSubmit={async (value) => {
            const r = await ds.topicUpdate(topicId, {
              name: value.name,
              description: value.description,
              keywords: value.keywords
            });
            if (r.kind === 'ready') {
              setTopic(r.data);
              onToast(`已更新「${value.name}」`, 'success');
              setEditing(false);
            } else {
              onToast(
                `更新失败：${r.kind === 'error' ? formatUserFacingError(r.error, 'save') : '专题尚未准备完成，请重试。'}`,
                'error'
              );
            }
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
