/**
 * 三栏布局
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ Header (logo · 同步 · +添加 · OPML · 主题)            │
 *  ├────────┬──────────┬────────────────────────────────────┤
 *  │ Feeds  │ Articles │ Reader                             │
 *  └────────┴──────────┴────────────────────────────────────┘
 */
import { ReactNode } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { OpmlButtons } from '../OpmlButtons/OpmlButtons';
import './Layout.css';

export interface LayoutProps {
  feedsSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  syncing: boolean;
  syncLabel?: string;
  onSync?: () => void;
  onAddFeed?: () => void;
  onOpmlImport?: () => Promise<{
    ok: boolean;
    message: string;
    result?: { feedsImported: number; feedsSkipped: number; errors: string[] } | null;
  }>;
  onOpmlExport?: () => Promise<{ ok: boolean; message: string }>;
}

export function Layout({
  feedsSlot,
  articlesSlot,
  readerSlot,
  syncing,
  syncLabel,
  onSync,
  onAddFeed,
  onOpmlImport,
  onOpmlExport
}: LayoutProps) {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">📚</span>
          <h1 className="app-header__title">聚合拾遗</h1>
          <span className="app-header__phase">Phase 2 · 集成完成</span>
        </div>
        <div className="app-header__right">
          {onAddFeed && (
            <button
              type="button"
              className="app-header__add-btn"
              onClick={onAddFeed}
              title="添加订阅源"
            >
              + 添加订阅源
            </button>
          )}
          {onOpmlImport && onOpmlExport && (
            <OpmlButtons onImport={onOpmlImport} onExport={onOpmlExport} />
          )}
          {onSync && (
            <button
              type="button"
              className="app-header__sync-btn"
              onClick={onSync}
              disabled={syncing}
              title="立即同步所有订阅源"
            >
              {syncing ? '同步中…' : '立即同步'}
            </button>
          )}
          {syncing && (
            <span className="app-header__sync" aria-live="polite">
              <span className="sync-dot" /> {syncLabel ?? ''}
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="app-main">
        <aside className="pane pane-feeds">{feedsSlot}</aside>
        <section className="pane pane-list">{articlesSlot}</section>
        <section className="pane pane-reader">{readerSlot}</section>
      </main>
    </div>
  );
}
