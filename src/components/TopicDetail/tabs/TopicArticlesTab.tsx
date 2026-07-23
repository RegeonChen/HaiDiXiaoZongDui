/**
 * TopicArticlesTab — 专题关联文章列表
 *  - 复用 ArticleList 的渲染逻辑（点击跳转 reader）
 *  - 空态：暂无匹配文章
 */
import type { Article, Feed } from '@shared/types';
import { ArticleList } from '../../ArticleList/ArticleList';
import { LoadingView } from '../../StatusView/LoadingView';
import { EmptyView } from '../../StatusView/EmptyView';

export interface TopicArticlesTabProps {
  articles: Article[] | null;
  feeds: Feed[];
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  onOpenArticle: (article: Article) => void;
}

export function TopicArticlesTab({ articles, feeds, onToast: _onToast, onOpenArticle }: TopicArticlesTabProps) {
  if (articles === null) {
    return <LoadingView message="正在加载文章…" />;
  }
  if (articles.length === 0) {
    return (
      <EmptyView
        title="该专题还没有文章"
        hint="AI 匹配或关键词命中后会出现在这里。"
      />
    );
  }

  // 错误/空判断都先走 loading/empty/error 三态
  return (
    <ArticleList
      feeds={feeds}
      articles={articles}
      selectedArticleId={null}
      onSelect={(id) => {
        const article = articles.find((item) => item.id === id);
        if (article) onOpenArticle(article);
      }}
      filterLabel={`专题文章（${articles.length}）`}
      filterHint="该专题还没有匹配文章"
    />
  );
}
