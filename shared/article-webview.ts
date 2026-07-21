/**
 * 原文网页阅读区的共享安全约束。
 *
 * 使用独立、非持久化 Session，避免原站 Cookie/权限与应用主会话混用。
 */
export const ARTICLE_WEBVIEW_PARTITION = 'article-web';

/** 原文 WebView 只能访问不带内嵌凭据的 HTTP(S) 地址。 */
export function isAllowedArticleWebUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}
