import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

/**
 * Phase 1.1 Renderer 验证页：
 *  - 启动时通过 window.api.settings.get() 拉一次默认设置
 *  - 显示一条自检结果（证明 IPC 通了 + Renderer 拿不到 Node API）
 */
export function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.settings.get();
      if (cancelled) return;
      if (result.success) {
        setSettings(result.data);
      } else {
        setError(`${result.error.code}: ${result.error.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 进程隔离自检：这些值如果存在，说明隔离没生效
  const isolationCheck = {
    hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
    hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
    hasModule: typeof (window as unknown as { module?: unknown }).module !== 'undefined',
    hasBuffer: typeof (window as unknown as { Buffer?: unknown }).Buffer !== 'undefined'
  };
  const isolationPassed =
    !isolationCheck.hasRequire &&
    !isolationCheck.hasProcess &&
    !isolationCheck.hasModule &&
    !isolationCheck.hasBuffer;

  return (
    <div className="app">
      <header className="header">
        <h1>聚合拾遗</h1>
        <span className="badge">Phase 1.1 · 脚手架</span>
      </header>

      <main className="main">
        <section className="card">
          <h2>1. IPC 链路</h2>
          {error && <p className="error">调取默认设置失败：{error}</p>}
          {settings && (
            <dl className="kv">
              <dt>界面语言</dt><dd>{settings.language}</dd>
              <dt>主题</dt><dd>{settings.theme}</dd>
              <dt>正文字号</dt><dd>{settings.fontSize}px</dd>
              <dt>阅读区宽度</dt><dd>{settings.readingWidth}px</dd>
              <dt>默认摘要语言</dt><dd>{settings.defaultSummaryLanguage}</dd>
            </dl>
          )}
        </section>

        <section className="card">
          <h2>2. 进程隔离自检</h2>
          <p className={isolationPassed ? 'ok' : 'fail'}>
            {isolationPassed
              ? '✓ Renderer 无法访问 require / process / module / Buffer'
              : '✗ 隔离失效：检测到 Node 全局对象'}
          </p>
          <ul className="kv">
            <li>require: {String(isolationCheck.hasRequire)}</li>
            <li>process: {String(isolationCheck.hasProcess)}</li>
            <li>module: {String(isolationCheck.hasModule)}</li>
            <li>Buffer: {String(isolationCheck.hasBuffer)}</li>
          </ul>
          <p className="hint">
            这一项是 Task 1.1 验收条件的一部分。<br />
            主进程 webPreferences 已开启 contextIsolation + sandbox，关闭 nodeIntegration。
          </p>
        </section>
      </main>
    </div>
  );
}
