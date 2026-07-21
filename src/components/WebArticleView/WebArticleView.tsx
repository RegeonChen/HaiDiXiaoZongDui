import { useCallback, useEffect, useState } from 'react';
import type {
  DidFailLoadEvent,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  WebviewTag
} from 'electron';
import {
  ARTICLE_WEBVIEW_PARTITION,
  isAllowedArticleWebUrl
} from '@shared/article-webview';
import './WebArticleView.css';

export interface WebArticleViewProps {
  articleId: string;
  sourceUrl: string;
}

export function WebArticleView({ articleId, sourceUrl }: WebArticleViewProps) {
  const [webview, setWebview] = useState<WebviewTag | null>(null);
  const [currentUrl, setCurrentUrl] = useState(sourceUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const validSource = isAllowedArticleWebUrl(sourceUrl);
  const handleWebviewRef = useCallback((node: HTMLWebViewElement | null): void => {
    setWebview(node as WebviewTag | null);
  }, []);

  useEffect(() => {
    setCurrentUrl(sourceUrl);
    setLoading(validSource);
    setError(validSource ? null : '原文地址无效，无法在网页模式中打开。');
  }, [sourceUrl, validSource]);

  useEffect(() => {
    if (!webview || !validSource) return;

    const handleStart = (): void => {
      setLoading(true);
      setError(null);
    };
    const handleStop = (): void => {
      setLoading(false);
    };
    const handleNavigate = (event: DidNavigateEvent): void => {
      if (isAllowedArticleWebUrl(event.url)) setCurrentUrl(event.url);
    };
    const handleNavigateInPage = (event: DidNavigateInPageEvent): void => {
      if (event.isMainFrame && isAllowedArticleWebUrl(event.url)) setCurrentUrl(event.url);
    };
    const handleFail = (event: DidFailLoadEvent): void => {
      // -3 是新导航取消旧请求，不应该对用户报错。
      if (!event.isMainFrame || event.errorCode === -3) return;
      setLoading(false);
      setError(event.errorDescription || '原文网页加载失败。');
    };

    webview.addEventListener('did-start-loading', handleStart);
    webview.addEventListener('did-stop-loading', handleStop);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigateInPage);
    webview.addEventListener('did-fail-load', handleFail);
    return () => {
      webview.removeEventListener('did-start-loading', handleStart);
      webview.removeEventListener('did-stop-loading', handleStop);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigateInPage);
      webview.removeEventListener('did-fail-load', handleFail);
    };
  }, [validSource, webview]);

  const retry = (): void => {
    if (!webview || !validSource) return;
    setError(null);
    setLoading(true);
    webview.reload();
  };

  return (
    <section
      className="web-article-view"
      data-web-article-view
      data-web-state={error ? 'error' : loading ? 'loading' : 'ready'}
    >
      <div className="web-article-view__bar">
        <span className="web-article-view__link-icon" aria-hidden="true">🔗</span>
        <a
          className="web-article-view__url"
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={currentUrl}
        >
          {currentUrl}
        </a>
        {loading && !error && (
          <span className="web-article-view__loading" role="status">加载中…</span>
        )}
        {error && validSource && (
          <button type="button" className="web-article-view__retry" onClick={retry}>
            重试
          </button>
        )}
      </div>

      {validSource && (
        <webview
          key={articleId}
          ref={handleWebviewRef}
          className="web-article-view__webview"
          src={sourceUrl}
          partition={ARTICLE_WEBVIEW_PARTITION}
          webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no"
          aria-label="原文网页"
        />
      )}

      {error && (
        <div className="web-article-view__error" role="alert">
          <strong>原文网页加载失败</strong>
          <span>{error}</span>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            在浏览器中打开 ↗
          </a>
        </div>
      )}
    </section>
  );
}
