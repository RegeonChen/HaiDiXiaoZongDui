/**
 * OPML 导入 / 导出按钮组
 *
 *  - 导入：调 window.api.opml.import()（主进程弹 dialog → 解析 → 返 OpmlImportResult）
 *  - 导出：调 window.api.opml.export()（主进程弹 save dialog → 写文件）
 *  - 操作中显示 loading
 */
import { useState } from 'react';
import './OpmlButtons.css';

export interface OpmlButtonsProps {
  onImport: () => Promise<{
    ok: boolean;
    message: string;
    result?: { feedsImported: number; feedsSkipped: number; errors: string[] } | null;
  }>;
  onExport: () => Promise<{ ok: boolean; message: string }>;
}

type Op = 'import' | 'export' | null;

export function OpmlButtons({ onImport, onExport }: OpmlButtonsProps) {
  const [busy, setBusy] = useState<Op>(null);

  const handleImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      await onImport();
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      await onExport();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="opml-buttons" role="group" aria-label="OPML 操作">
      <button
        type="button"
        className="opml-buttons__btn"
        onClick={handleImport}
        disabled={busy !== null}
        title="从 OPML 文件导入订阅"
      >
        {busy === 'import' ? '导入中…' : '↓ 导入 OPML'}
      </button>
      <button
        type="button"
        className="opml-buttons__btn"
        onClick={handleExport}
        disabled={busy !== null}
        title="导出当前订阅为 OPML"
      >
        {busy === 'export' ? '导出中…' : '↑ 导出 OPML'}
      </button>
    </div>
  );
}
