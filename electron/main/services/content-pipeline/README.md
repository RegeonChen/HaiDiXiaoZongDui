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
- `prepareTopicAnalysisInputs`: normalize persisted articles and feeds into stable,
  source-attributed Phase 4 inputs, with exact URL/content duplicate groups.
- `registerContentPipelineIpc`: register Task 2.2 IPC handlers after stores exist.

## Task 2.3 integration

The database adapter at `electron/main/db/content-pipeline-store.ts` implements
three small ports exported from this module:

- `FeedSyncStore`: list/get feed targets and persist a `FeedPipelineOutput` with
  GUID deduplication. Its save result supplies accurate new/updated article counts.
- `ArticleContentStore`: load one article's Feed fallback and persisted content
  layers, track cleaning status, and save source HTML + cleaned HTML + Markdown.
- `OpmlFeedStore`: bulk-create imported feeds and list feeds for export.

Main constructs `SyncService`, `ArticleContentService`, and
`OpmlApplicationService`, then calls `registerContentPipelineIpc`. This keeps both
modules independent: the pipeline does not import SQLite repositories, and the
database does not import parser or cleaner internals.

The intended lifecycle mirrors Mercury's layered Reader pipeline:

1. Sync and persist feed metadata plus Feed-provided fallback content.
2. On first Reader/AI request, reuse persisted source HTML or fetch the article page.
3. Persist source HTML, cleaned HTML, Markdown, and cleaning status.
4. Later requests return the cached layers without network or Readability work.
5. Renderer rewrites public image URLs only for display to `juhe-image://`; the
   Main-process protocol fetches and validates image bytes while persisted HTML
   and Markdown keep portable original URLs.

## Verification

```bash
npm test
npm run test:real-feeds
npm run smoke:phase2
npm run smoke:images
```

The default suite is deterministic and offline. The real-feed suite checks live
RSS, Atom and JSON Feed sources separately because it depends on network access.
The Phase 2 smoke starts a local HTTP fixture and verifies the complete Electron
IPC, SQLite, deduplication, lazy cleaning/cache, state, and OPML path.
The image smoke requires the original article URL as Referer and verifies the
packaged Renderer CSP, custom protocol, Main fetch fallback, and image decoding.

## Phase 3.2 reliability baseline

- HTTP fetching applies bounded retries, honors `Retry-After`, enforces timeout/body
  limits, and retains stable pipeline error codes in persisted sync/cleaning errors.
- Text decoding checks the response header, BOM, HTML meta and XML declaration;
  legacy `gb2312` declarations are normalized to `gbk`.
- Reader regression fixtures cover mixed Chinese/English text, long code lines and
  wide tables at the minimum reader-pane width without overflowing the window.

## Phase 4 topic-ready content

`prepareTopicAnalysisInputs(articles, feeds)` produces two coordinated views:

- `items` retains every normalized article for source traceability.
- `uniqueItems` keeps one representative for matching and clustering, while
  `duplicateGroups` maps canonical-URL and exact long-content duplicates back to
  every original article ID.

The normalized input prefers cleaned Markdown, then raw text, then safe plain text
extracted from raw HTML. Missing titles, sources and publish times use deterministic
fallbacks, and tracking parameters are removed from canonical article URLs.
