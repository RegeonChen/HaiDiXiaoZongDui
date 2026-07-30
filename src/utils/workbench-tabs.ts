import type { WorkbenchTab } from '../components/Layout/Layout';

export interface OpenWorkbenchTabResult {
  tabs: WorkbenchTab[];
  replacedTab: WorkbenchTab | null;
}

/**
 * VS Code 风格的预览标签：
 * - 普通打开只占用一个 preview 位置，下一次普通打开原位替换。
 * - 已固定的标签不会被替换。
 * - 再次打开已有标签时保留其固定状态。
 */
export function openWorkbenchTab(
  tabs: WorkbenchTab[],
  incoming: WorkbenchTab
): OpenWorkbenchTabResult {
  const existingIndex = tabs.findIndex((tab) => tab.id === incoming.id);
  if (existingIndex >= 0) {
    const existing = tabs[existingIndex];
    const nextTabs = [...tabs];
    nextTabs[existingIndex] = {
      ...existing,
      ...incoming,
      preview: incoming.preview === false ? false : existing.preview
    };
    return { tabs: nextTabs, replacedTab: null };
  }

  if (incoming.preview) {
    const previewIndex = tabs.findIndex((tab) => tab.preview === true);
    if (previewIndex >= 0) {
      const nextTabs = [...tabs];
      const replacedTab = nextTabs[previewIndex];
      nextTabs[previewIndex] = incoming;
      return { tabs: nextTabs, replacedTab };
    }
  }

  return { tabs: [...tabs, incoming], replacedTab: null };
}

export function pinWorkbenchTab(
  tabs: WorkbenchTab[],
  tabId: string
): WorkbenchTab[] {
  return tabs.map((tab) => (
    tab.id === tabId && tab.preview
      ? { ...tab, preview: false }
      : tab
  ));
}
