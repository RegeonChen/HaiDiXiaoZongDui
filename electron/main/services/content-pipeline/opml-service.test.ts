import { describe, expect, it } from 'vitest';
import { exportOpml, parseOpml } from './opml-service';

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
});

function byUrl(left: { url: string }, right: { url: string }): number {
  return left.url.localeCompare(right.url);
}
