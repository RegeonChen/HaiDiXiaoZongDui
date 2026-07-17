/**
 * TopicDetail — 专题详情（4 tab）
 *
 * 4 tab 内部 sub-state 切换，不污染 Layout.AppPage。
 * 4 tab 复用同一个 Article 列表 / 简报组件，差异化展示。
 */
import { useCallback, useEffect, useState } from 'react';
import type { Article, Briefing, EventGroup, Feed, Topic, TimelineEntry } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../StatusView/LoadingView';
import { ErrorView } from '../StatusView/ErrorView';
import { EmptyView } from '../StatusView/EmptyView';
import { TopicArticlesTab } from './tabs/TopicArticlesTab';
import { TopicTimelineTab } from './tabs/TopicTimelineTab';
import { TopicEventGroupsTab } from './tabs/TopicEventGroupsTab';
import { TopicBriefingTab } from './tabs/TopicBriefingTab';
import { TopicFormDialog } from '../TopicFormDialog/TopicFormDialog';
import './TopicDetail.css';

export type TopicTab = 'articles' | 'timeline' | 'events' | 'briefing';

export interface TopicDetailProps {
  topicId: string;
  onBack: () => void;
  onEdit: (topic: Topic) => void;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

const TAB_ITEMS: Array<{ id: TopicTab; label: string; icon: string; description: string }> = [
  { id: 'articles', label: '文章', icon: '📰', description: '该专题关联的所有文章' },
  { id: 'timeline', label: '时间线', icon: '⏱', description: '多源合并时间线，标出每篇新增信息' },
  { id: 'events', label: '事件分组', icon: '◐', description: '按事件聚类，呈现报道脉络' },
  { id: 'briefing', label: '简报', icon: '📋', description: 'AI 生成的多源带引用简报' }
];

export function TopicDetail({ topicId, onBack, onEdit, onToast }: TopicDetailProps) {
  const ds = useDataSource();
  const [topic, setTopic] = useState<Topic | null | undefined>(undefined);
  const [tab, setTab] = useState<TopicTab>('articles');
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
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [eventGroups, setEventGroups] = useState<EventGroup[] | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // 切到 tab 时按需加载
  useEffect(() => {
    if (tab === 'articles' && articles === null) {
      void (async () => {
        const r = await ds.topicGetArticles(topicId);
        setArticles(r.kind === 'ready' ? r.data : []);
      })();
    } else if (tab === 'timeline' && timeline === null) {
      void (async () => {
        const r = await ds.topicGetTimeline(topicId);
        setTimeline(r.kind === 'ready' ? r.data : []);
      })();
    } else if (tab === 'events' && eventGroups === null) {
      void (async () => {
        const r = await ds.topicGetEventGroups(topicId);
        setEventGroups(r.kind === 'ready' ? r.data : []);
      })();
    } else if (tab === 'briefing' && briefing === undefined) {
      void (async () => {
        const r = await ds.topicGetBriefing(topicId);
        setBriefing(r.kind === 'ready' ? r.data : null);
      })();
    }
  }, [tab, topicId, articles, timeline, eventGroups, briefing, ds]);

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
          onToast(`读取简报失败：${r2.error}`, 'error');
        }
      } else {
        onToast(`简报生成失败：${r.message}`, 'error');
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
        {tab === 'articles' && (
          <TopicArticlesTab
            articles={articles}
            feeds={feeds}
            onToast={onToast}
          />
        )}
        {tab === 'timeline' && (
          <TopicTimelineTab
            timeline={timeline}
            onToast={onToast}
          />
        )}
        {tab === 'events' && (
          <TopicEventGroupsTab
            eventGroups={eventGroups}
            feeds={feeds}
            onToast={onToast}
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
              onToast(`保存失败：${r.error}`, 'error');
              return false;
            }}
            onExport={async (format) => {
              const r = await ds.topicExportBriefing(topicId, format);
              if (r.kind === 'ready') {
                onToast(`已导出 ${format.toUpperCase()}（${r.data.length} 字符）`, 'success');
                return r.data;
              }
              onToast(`导出失败：${r.error}`, 'error');
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
              onToast(`更新失败：${r.error}`, 'error');
            }
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
