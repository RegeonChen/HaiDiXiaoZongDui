import { describe, expect, it } from 'vitest';
import type { WorkbenchTab } from '../components/Layout/Layout';
import { openWorkbenchTab, pinWorkbenchTab } from './workbench-tabs';

function tab(id: string, preview = true): WorkbenchTab {
  return {
    id,
    label: id,
    page: id.startsWith('article:') ? 'reader' : 'notes',
    icon: id.startsWith('article:') ? 'article' : 'notes',
    closeable: true,
    preview
  };
}

describe('workbench preview tabs', () => {
  it('reuses one preview slot instead of accumulating ordinary opens', () => {
    const first = openWorkbenchTab([], tab('article:1'));
    const second = openWorkbenchTab(first.tabs, tab('page:notes'));

    expect(second.tabs.map((item) => item.id)).toEqual(['page:notes']);
    expect(second.tabs[0].preview).toBe(true);
    expect(second.replacedTab?.id).toBe('article:1');
  });

  it('keeps pinned tabs and appends a new preview beside them', () => {
    const pinned = pinWorkbenchTab([tab('article:1')], 'article:1');
    const result = openWorkbenchTab(pinned, tab('page:notes'));

    expect(result.tabs.map((item) => [item.id, item.preview])).toEqual([
      ['article:1', false],
      ['page:notes', true]
    ]);
    expect(result.replacedTab).toBeNull();
  });

  it('does not turn an existing pinned tab back into a preview', () => {
    const pinned = tab('page:notes', false);
    const result = openWorkbenchTab([pinned], tab('page:notes'));

    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].preview).toBe(false);
  });

  it('pins a preview when the same entry is opened again', () => {
    const first = openWorkbenchTab([], tab('page:notes'));
    const second = openWorkbenchTab(first.tabs, tab('page:notes'));

    expect(second.tabs).toHaveLength(1);
    expect(second.tabs[0].preview).toBe(false);
    expect(second.replacedTab).toBeNull();
  });

  it('keeps the same array when the requested tab is already pinned', () => {
    const tabs = [tab('page:notes', false)];

    expect(pinWorkbenchTab(tabs, 'page:notes')).toBe(tabs);
    expect(pinWorkbenchTab(tabs, 'page:missing')).toBe(tabs);
  });
});
