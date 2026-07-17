/**
 * TopicTimelineTab — 合并多源时间线
 *  - 每条：日期 / 标题 / 来源 / newInformation
 *  - 按时间倒序
 *  - newInformation 字段高亮"新增信息"
 */
import type { TimelineEntry } from '@shared/types';
import { LoadingView } from '../../StatusView/LoadingView';
import { EmptyView } from '../../StatusView/EmptyView';
import './TopicTimelineTab.css';

export interface TopicTimelineTabProps {
  timeline: TimelineEntry[] | null;
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function formatTimelineDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function TopicTimelineTab({ timeline, onToast: _onToast }: TopicTimelineTabProps) {
  if (timeline === null) {
    return <LoadingView message="正在加载时间线…" />;
  }
  if (timeline.length === 0) {
    return (
      <EmptyView
        title="还没有时间线条目"
        hint="该专题需要先有关联文章才能生成时间线。"
      />
    );
  }

  // 按时间倒序
  const sorted = [...timeline].sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    return tb - ta;
  });

  return (
    <ol className="topic-timeline" role="list">
      {sorted.map((entry, idx) => (
        <li key={`${entry.articleId}-${idx}`} className="topic-timeline__item">
          <div className="topic-timeline__rail">
            <div className="topic-timeline__dot" />
            {idx < sorted.length - 1 && <div className="topic-timeline__line" />}
          </div>
          <div className="topic-timeline__content">
            <div className="topic-timeline__date">{formatTimelineDate(entry.date)}</div>
            <h4 className="topic-timeline__title">{entry.title}</h4>
            <div className="topic-timeline__meta">
              <span className="topic-timeline__source">{entry.feedTitle}</span>
            </div>
            {entry.newInformation && (
              <div className="topic-timeline__new-info">
                <span className="topic-timeline__new-info-label">新增</span>
                <span>{entry.newInformation}</span>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
