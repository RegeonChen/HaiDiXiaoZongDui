/**
 * OpmlExportPage — 选择性 OPML 导出子界面
 * Phase 4.1.4
 *
 *  - 列表展示所有订阅源（id / siteTitle / url）+ 勾选框
 *  - 默认全选
 *  - 顶栏"全选"/"取消全选"切换
 *  - 单选 + 已选数量实时显示
 *  - 底部"取消导出" / "确认导出"两个按钮
 *  - 确认导出：调 window.api.opml.export(feedIds)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feed } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import { EmptyView } from '../../components/StatusView/EmptyView';
import './OpmlExportPage.css';

export interface OpmlExportPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  /** 关闭页面（返回原页） */
  onClose: () => void;
}

export function OpmlExportPage({ onToast, onClose }: OpmlExportPageProps) {
  const ds = useDataSource();
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 4.1.4:用 Set 跟踪已选 feedId
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const r = await ds.feeds();
    if (r.kind === 'ready') {
      setFeeds(r.data);
      setError(null);
    } else {
      setError(r.kind === 'error' ? r.error : '加载失败');
    }
  }, [ds]);

  useEffect(() => {
    void load();
  }, [load]);

  // Phase 4.1.4:首次加载完 feeds 后默认全选
  //   只在 selected 还没初始化时设置(避免用户手动取消全选后被 useEffect 自动恢复)
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (feeds && !initialized) {
      setSelected(new Set(feeds.map((f) => f.id)));
      setInitialized(true);
    }
  }, [feeds, initialized]);

  const sortedFeeds = useMemo(
    () => (feeds ?? []).slice().sort((a, b) => {
      const an = a.siteTitle || a.title;
      const bn = b.siteTitle || b.title;
      return an.localeCompare(bn, 'zh');
    }),
    [feeds]
  );

  const allSelected = sortedFeeds.length > 0 && selected.size === sortedFeeds.length;
  const noneSelected = selected.size === 0;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedFeeds.map((f) => f.id)));
    }
  }, [allSelected, sortedFeeds]);

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (noneSelected) {
      onToast('请至少选择一个订阅源', 'info');
      return;
    }
    setExporting(true);
    try {
      const r = await ds.opmlExport(Array.from(selected));
      if (r.kind === 'ready') {
        if (r.data === true) {
          onToast(`已导出 ${selected.size} 个订阅源`, 'success');
        } else {
          onToast('已取消导出', 'info');
        }
        onClose();
      } else {
        onToast(`OPML 导出失败：${r.kind === 'error' ? r.error : '未知错误'}`, 'error');
      }
    } catch (e) {
      onToast(`OPML 导出失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setExporting(false);
    }
  }, [noneSelected, selected, ds, onToast, onClose]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (feeds === null) return <LoadingView message="正在加载订阅源…" />;

  return (
    <div className="opml-export-page" data-testid="opml-export-page">
      <header className="opml-export-page__header">
        <h1 className="opml-export-page__title">导出 OPML</h1>
        <p className="opml-export-page__subtitle">
          勾选要导出的订阅源（共 {sortedFeeds.length} 个，已选 {selected.size} 个）
        </p>
      </header>

      <div className="opml-export-page__toolbar">
        <button
          type="button"
          className="opml-export-page__toolbar-btn"
          onClick={handleToggleAll}
          data-testid="opml-export__toggle-all"
          title={allSelected ? '取消全选' : '全选'}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
        <span className="opml-export-page__counter" data-testid="opml-export__counter">
          已选 {selected.size} / {sortedFeeds.length}
        </span>
      </div>

      {sortedFeeds.length === 0 ? (
        <EmptyView
          className="opml-export-page__empty"
          title="还没有订阅源"
          hint="先在一级目录添加订阅源，再返回这里导出。"
        />
      ) : (
        <ul className="opml-export-page__list" data-testid="opml-export__list">
          {sortedFeeds.map((f) => {
            const isChecked = selected.has(f.id);
            return (
              <li
                key={f.id}
                className={`opml-export-page__item ${isChecked ? 'is-checked' : ''}`}
                data-testid={`opml-export__item-${f.id}`}
              >
                <label className="opml-export-page__item-label">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(f.id)}
                    className="opml-export-page__checkbox"
                  />
                  <div className="opml-export-page__item-info">
                    <span className="opml-export-page__item-title">
                      {f.siteTitle || f.title}
                    </span>
                    <span className="opml-export-page__item-url" title={f.url}>
                      {f.url}
                    </span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="opml-export-page__footer">
        <button
          type="button"
          className="opml-export-page__btn opml-export-page__btn--cancel"
          onClick={onClose}
          disabled={exporting}
          data-testid="opml-export__cancel"
        >
          取消导出
        </button>
        <button
          type="button"
          className="opml-export-page__btn opml-export-page__btn--primary"
          onClick={() => void handleConfirm()}
          disabled={noneSelected || exporting}
          data-testid="opml-export__confirm"
        >
          {exporting ? '导出中…' : `确认导出（${selected.size}）`}
        </button>
      </footer>
    </div>
  );
}
