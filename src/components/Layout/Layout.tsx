/**
 * 三栏布局
 *
 *  ┌────────────────────────────────────┐
 *  │ Header (logo · 同步状态 · 主题)    │
 *  ├────────┬──────────┬────────────────┤
 *  │ Feeds  │ Articles │ Reader         │
 *  └────────┴──────────┴────────────────┘
 *
 * 响应式：≥ 960px 三栏并排；< 960 时 sidebar 缩到 200px，list 缩到 280px。
 */
import { ReactNode } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import './Layout.css';

export interface LayoutProps {
  feedsSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  syncing: boolean;
  syncLabel?: string;
  onSync?: () => void;
}

export function Layout({ feedsSlot, articlesSlot, readerSlot, syncing, syncLabel, onSync }: LayoutProps) {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">📚</span>
          <h1 className="app-header__title">聚合拾遗</h1>
          <span className="app-header__phase">Phase 2.1 · 阅读器外壳</span>
        </div>
        <div className="app-header__right">
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
