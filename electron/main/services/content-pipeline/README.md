# Content Pipeline (Task 2.2)

This module owns feed fetching/parsing, article extraction/cleaning, manual sync
orchestration, and OPML import/export. It runs only in the Electron Main process.

## Main entry points

- `parseFeed`: normalize RSS, Atom and JSON Feed into `ParsedFeed`.
- `FeedPipeline.syncFeed`: fetch a feed and its article pages, then return cleaned
  HTML/Markdown without writing to a database.
- `SyncService`: coordinate one-feed/all-feed manual sync and expose progress.
- `OpmlApplicationService`: import/export OPML files through a storage port.
- `registerContentPipelineIpc`: register Task 2.2 IPC handlers after stores exist.

## Task 2.3 handoff

The database module implements two small ports exported from `index.ts`:

- `FeedSyncStore`: list/get feed targets and persist a `FeedPipelineOutput` with
  GUID deduplication. Its save result supplies accurate new/updated article counts.
- `OpmlFeedStore`: bulk-create imported feeds and list feeds for export.

After constructing `SyncService` and `OpmlApplicationService`, Main calls
`registerContentPipelineIpc`. This keeps both modules independent: the pipeline
does not import SQLite repositories, and the database does not import parser or
cleaner internals.

## Verification

```bash
npm test
npm run test:real-feeds
```

The default suite is deterministic and offline. The real-feed suite checks live
RSS, Atom and JSON Feed sources separately because it depends on network access.
