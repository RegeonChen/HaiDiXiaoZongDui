/**
 * TopicsPage — 专题追踪（Phase 4.1 完整化）
 *
 * 内部两个视图：
 *   - 列表（currentTopicId === null）：专题卡片列表 + 创建/编辑对话框
 *   - 详情（currentTopicId !== null）：TopicDetail 4 tab（Articles/Timeline/EventGroups/Briefing）
 *
 * 设计决策：
 *   - 列表/详情切换在 TopicsPage 内部用 state 管理，不污染 Layout.AppPage 类型
 *   - 4 tab 数据均通过 DataSource 拉取，loading/empty/error 三态统一
 *   - 后端仍是 stub（topic:* handler 返回 NOT_IMPLEMENTED），UI 端会显示"等待 4.3 接入"
 */
import { useCallback, useEffect, useState } from 'react';
import type { Topic, TopicCreateInput, TopicUpdateInput } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import { EmptyView } from '../../components/StatusView/EmptyView';
import { TopicDetail } from '../../components/TopicDetail/TopicDetail';
import { TopicFormDialog } from '../../components/TopicFormDialog/TopicFormDialog';
import './TopicsPage.css';

export interface TopicsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function TopicsPage({ onToast }: TopicsPageProps) {
  const ds = useDataSource();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
  const [formDialog, setFormDialog] = useState<
    | { mode: 'closed' }
    | { mode: 'create' }
    | { mode: 'edit'; topic: Topic }
  >({ mode: 'closed' });

  // 拉取专题列表
  const refresh = useCallback(async () => {
    const r = await ds.topicList();
    if (r.kind === 'ready') {
      setTopics(r.data);
      setError(null);
    } else {
      setError(r.kind === 'error' ? r.error : '正在加载专题');
      setTopics([]);
    }
  }, [ds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 详情视图
  if (currentTopicId !== null) {
    return (
      <TopicDetail
        topicId={currentTopicId}
        onBack={() => {
          setCurrentTopicId(null);
          void refresh();
        }}
        onToast={onToast}
      />
    );
  }

  // 列表视图
  if (error) {
    // 区分"后端 stub"和真实错误
    const isStub = /NOT_IMPLEMENTED|Phase 4|专题/i.test(error);
    return (
      <div className="topics-page">
        <header className="topics-page__header">
          <h1 className="topics-page__title">专题追踪</h1>
          <p className="topics-page__hint">
            创建专题并匹配文章，按事件分组生成多源简报。
          </p>
          {/* stub 状态下也允许用户尝试创建（IPC 会返回 NOT_IMPLEMENTED） */}
          <button
            type="button"
            className="topics-page__new-btn"
            onClick={() => setFormDialog({ mode: 'create' })}
          >
            + 新建专题
          </button>
        </header>
        {isStub ? (
          <EmptyView
            title="专题追踪等待 4.3 接入"
            hint="专题后端（Topic 仓储、匹配算法、Briefing Agent）由陈冠中在 Task 4.3 落地。UI 已就绪（列表 + 4 tab 详情），后端就绪后即可联调。"
          />
        ) : (
          <ErrorView message={error} onRetry={refresh} />
        )}
      </div>
    );
  }

  if (topics === null) {
    return (
      <div className="topics-page">
        <header className="topics-page__header">
          <h1 className="topics-page__title">专题追踪</h1>
        </header>
        <LoadingView message="正在加载专题…" />
      </div>
    );
  }

  return (
    <div className="topics-page">
      <header className="topics-page__header">
        <h1 className="topics-page__title">专题追踪</h1>
        <p className="topics-page__hint">
          创建专题并匹配文章，按事件分组生成多源简报。
        </p>
        <button
          type="button"
          className="topics-page__new-btn"
          onClick={() => setFormDialog({ mode: 'create' })}
        >
          + 新建专题
        </button>
      </header>

      {topics.length === 0 ? (
        <EmptyView
          title="还没有专题"
          hint="点击右上角「新建专题」开始创建。专题可以包含多篇文章的合并视角。"
        />
      ) : (
        <ul className="topics-page__list" role="list">
          {topics.map((t) => (
            <li key={t.id} className="topics-page__item">
              <button
                type="button"
                className="topics-page__item-main"
                onClick={() => setCurrentTopicId(t.id)}
                title={t.description || t.name}
              >
                <h3 className="topics-page__item-title">{t.name}</h3>
                {t.description && (
                  <p className="topics-page__item-desc">{t.description}</p>
                )}
                {t.keywords.length > 0 && (
                  <div className="topics-page__item-keywords">
                    {t.keywords.slice(0, 6).map((kw) => (
                      <span key={kw} className="topics-page__keyword-tag">
                        {kw}
                      </span>
                    ))}
                    {t.keywords.length > 6 && (
                      <span className="topics-page__keyword-tag topics-page__keyword-tag--more">
                        +{t.keywords.length - 6}
                      </span>
                    )}
                  </div>
                )}
                <div className="topics-page__item-meta">
                  创建于 {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </button>
              <div className="topics-page__item-actions">
                <button
                  type="button"
                  className="topics-page__item-btn"
                  onClick={() => setFormDialog({ mode: 'edit', topic: t })}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="topics-page__item-btn topics-page__item-btn--danger"
                  onClick={async () => {
                    if (!confirm(`确定要删除专题「${t.name}」？此操作不会删除已关联的文章。`)) return;
                    try {
                      await ds.topicDelete(t.id);
                      onToast(`已删除「${t.name}」`, 'success');
                      await refresh();
                    } catch (e) {
                      onToast(`删除失败：${e instanceof Error ? e.message : String(e)}`, 'error');
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formDialog.mode === 'create' && (
        <TopicFormDialog
          mode="create"
          onSubmit={async (value) => {
            const input: TopicCreateInput = {
              name: value.name,
              description: value.description,
              keywords: value.keywords
            };
            const r = await ds.topicCreate(input);
            if (r.kind === 'ready') {
              onToast(`已创建「${value.name}」`, 'success');
              setFormDialog({ mode: 'closed' });
              await refresh();
            } else {
              onToast(`创建失败：${r.kind === 'error' ? r.error : '尚未就绪'}`, 'error');
            }
          }}
          onClose={() => setFormDialog({ mode: 'closed' })}
        />
      )}
      {formDialog.mode === 'edit' && (
        <TopicFormDialog
          mode="edit"
          initial={formDialog.topic}
          onSubmit={async (value) => {
            const input: TopicUpdateInput = {
              name: value.name,
              description: value.description,
              keywords: value.keywords
            };
            const r = await ds.topicUpdate(formDialog.topic.id, input);
            if (r.kind === 'ready') {
              onToast(`已更新「${value.name}」`, 'success');
              setFormDialog({ mode: 'closed' });
              await refresh();
            } else {
              onToast(`更新失败：${r.kind === 'error' ? r.error : '尚未就绪'}`, 'error');
            }
          }}
          onClose={() => setFormDialog({ mode: 'closed' })}
        />
      )}
    </div>
  );
}
