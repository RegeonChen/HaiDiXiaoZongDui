/**
 * 顶栏搜索框（Phase 3.4.4.3）
 *
 * - 300ms 防抖触发 ds.articles({ search })
 * - 下拉显示最多 8 条匹配结果（标题 + 订阅源 + 时间）
 * - 点击结果 → onSelect(articleId) 跳转到阅读
 * - 失焦/按 Esc 关闭下拉
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import './SearchBar.css';

export interface SearchBarProps {
  feeds: Feed[];
  onSelect: (articleId: string) => void;
  onClear?: () => void;
}

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`;
  if (deltaSec < 604800) return `${Math.floor(deltaSec / 86400)} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SearchBar({ feeds, onSelect, onClear }: SearchBarProps) {
  const ds = useDataSource();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const feedTitleById = new Map(feeds.map((f) => [f.id, f.siteTitle || f.title]));

  // 防抖触发搜索
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await ds.articles({ search: q });
      if (r.kind === 'ready') {
        // 截取前 MAX_RESULTS 条
        setResults(r.data.slice(0, MAX_RESULTS));
      } else {
        setResults([]);
      }
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, ds]);

  // 失焦关闭（但点击结果时不关闭）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setOpen(false);
      setQuery('');
      setResults([]);
      onSelect(id);
      onClear?.();
    },
    [onSelect, onClear]
  );

  return (
    <div className="search-bar" ref={containerRef}>
      <input
        type="search"
        className="search-bar__input"
        placeholder="🔍 搜索文章标题或正文…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="搜索文章"
      />
      {query && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={() => {
            setQuery('');
            setResults([]);
            setOpen(false);
          }}
          title="清空"
          aria-label="清空搜索"
        >
          ×
        </button>
      )}
      {open && query && (
        <div className="search-bar__dropdown" role="listbox">
          {loading ? (
            <div className="search-bar__status">搜索中…</div>
          ) : results.length === 0 ? (
            <div className="search-bar__status">没有匹配文章</div>
          ) : (
            <>
              {results.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  className="search-bar__item"
                  onClick={() => handleSelect(a.id)}
                >
                  <span className="search-bar__item-title">{a.title}</span>
                  <span className="search-bar__item-meta">
                    <span>{feedTitleById.get(a.feedId) ?? '未知'}</span>
                    <span>{formatRelative(a.publishedAt)}</span>
                  </span>
                </button>
              ))}
              {results.length === MAX_RESULTS && (
                <div className="search-bar__status">仅显示前 {MAX_RESULTS} 条，输入更精确关键词可缩小范围</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
