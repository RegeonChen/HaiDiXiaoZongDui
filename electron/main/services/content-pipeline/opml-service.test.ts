import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { OpmlFeedEntry } from './types';
import { exportOpml, OpmlApplicationService, parseOpml } from './opml-service';

const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Tech">
      <outline text="Example" xmlUrl="https://www.example.com/feed/" htmlUrl="https://example.com/" />
      <outline text="Duplicate" xmlUrl="https://example.com/feed" />
    </outline>
    <outline text="JSON" xmlUrl="https://json.example.com/feed.json" />
    <outline text="Unsafe" xmlUrl="file:///tmp/feed.xml" />
  </body>
</opml>`;

describe('OPML service', () => {
  it('imports groups, removes duplicate feeds and reports invalid URLs', () => {
    const result = parseOpml(opml);

    expect(result.title).toBe('My Feeds');
    expect(result.feeds).toHaveLength(2);
    expect(result.feeds[0]).toMatchObject({
      title: 'Example',
      groupName: 'Tech'
    });
    expect(result.feedsSkipped).toBe(2);
    expect(result.errors).toHaveLength(1);
  });

  it('exports valid OPML that can be imported again', () => {
    const imported = parseOpml(opml);
    const exported = exportOpml(imported.feeds, 'Round Trip');
    const roundTrip = parseOpml(exported);

    expect(roundTrip.title).toBe('Round Trip');
    expect([...roundTrip.feeds].sort(byUrl)).toEqual([...imported.feeds].sort(byUrl));
    expect(exported).toContain('<opml version="2.0">');
  });

  it('exports only selected feed IDs and ignores unknown IDs', async () => {
    const feeds: OpmlFeedEntry[] = [
      {
        id: 'feed-a',
        title: 'Feed A',
        url: 'https://a.example/feed.xml',
        siteUrl: 'https://a.example',
        groupName: null
      },
      {
        id: 'feed-b',
        title: 'Feed B',
        url: 'https://b.example/feed.xml',
        siteUrl: null,
        groupName: 'Tech'
      },
      {
        id: 'feed-c',
        title: 'Feed C',
        url: 'https://c.example/feed.xml',
        siteUrl: null,
        groupName: 'Tech'
      }
    ];
    const store = {
      importFeedEntries: vi.fn(),
      listFeedEntriesForExport: vi.fn(async () => feeds)
    };
    const service = new OpmlApplicationService(store);
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-opml-test-'));
    const outputPath = path.join(temporaryDirectory, 'selected.opml');

    try {
      await service.exportFile(outputPath, ['feed-c', 'missing', 'feed-a']);
      const parsed = parseOpml(fs.readFileSync(outputPath, 'utf8'));

      expect(parsed.feeds.map(({ title }) => title).sort()).toEqual(['Feed A', 'Feed C']);
      expect(store.listFeedEntriesForExport).toHaveBeenCalledOnce();
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('treats an empty selection as exporting all feeds', async () => {
    const feeds: OpmlFeedEntry[] = [{
      id: 'feed-a',
      title: 'Feed A',
      url: 'https://a.example/feed.xml',
      siteUrl: null,
      groupName: null
    }];
    const service = new OpmlApplicationService({
      importFeedEntries: vi.fn(),
      listFeedEntriesForExport: vi.fn(async () => feeds)
    });
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'juhe-opml-test-'));
    const outputPath = path.join(temporaryDirectory, 'all.opml');

    try {
      await service.exportFile(outputPath, []);
      expect(parseOpml(fs.readFileSync(outputPath, 'utf8')).feeds).toHaveLength(1);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

function byUrl(left: { url: string }, right: { url: string }): number {
  return left.url.localeCompare(right.url);
}
