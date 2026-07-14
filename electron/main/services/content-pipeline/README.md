# Content Pipeline (Task 2.2)

This module owns feed fetching/parsing, article extraction/cleaning, manual sync
orchestration, and OPML import/export. It runs only in the Electron Main process.

## Main entry points

- `parseFeed`: normalize RSS, Atom and JSON Feed into `ParsedFeed`.
- `FeedPipeline.syncFeed`: fetch and normalize feed metadata only; it never fetches
  every article page during synchronization.
- `ArticleContentService.getOrBuild`: lazily fetch/extract/clean one article when
  Reader or AI first requests it, then reuse the persisted layers.
- `SyncService`: coordinate one-feed/all-feed manual sync and expose progress.
- `OpmlApplicationService`: import/export OPML files through a storage port.
- `registerContentPipelineIpc`: register Task 2.2 IPC handlers after stores exist.

## Task 2.3 handoff

The database module implements three small ports exported from `index.ts`:

- `FeedSyncStore`: list/get feed targets and persist a `FeedPipelineOutput` with
  GUID deduplication. Its save result supplies accurate new/updated article counts.
- `ArticleContentStore`: load one article's Feed fallback and persisted content
  layers, track cleaning status, and save source HTML + cleaned HTML + Markdown.
- `OpmlFeedStore`: bulk-create imported feeds and list feeds for export.

After constructing `SyncService`, `ArticleContentService`, and
`OpmlApplicationService`, Main calls `registerContentPipelineIpc`. This keeps both
modules independent: the pipeline does not import SQLite repositories, and the
database does not import parser or cleaner internals.

The intended lifecycle mirrors Mercury's layered Reader pipeline:

1. Sync and persist feed metadata plus Feed-provided fallback content.
2. On first Reader/AI request, reuse persisted source HTML or fetch the article page.
3. Persist source HTML, cleaned HTML, Markdown, and cleaning status.
4. Later requests return the cached layers without network or Readability work.

## Verification

```bash
npm test
npm run test:real-feeds
```

The default suite is deterministic and offline. The real-feed suite checks live
RSS, Atom and JSON Feed sources separately because it depends on network access.
