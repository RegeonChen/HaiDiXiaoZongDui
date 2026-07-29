import { useState } from 'react';
import { GeneralSettingsModal } from '../../components/GeneralSettingsModal/GeneralSettingsModal';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { LogsPage } from '../LogsPage/LogsPage';
import './UnifiedSettingsPage.css';

export interface UnifiedSettingsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

type SettingsSection = 'general' | 'ai' | 'logs';

export function UnifiedSettingsPage({ onToast }: UnifiedSettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('general');
  return (
    <div className="settings-workspace">
      <aside className="settings-workspace__sidebar" aria-label="设置分类">
        <div className="settings-workspace__heading">
          <strong>设置</strong>
          <span>聚合拾遗</span>
        </div>
        <nav className="settings-workspace__nav">
          <button
            type="button"
            className={section === 'general' ? 'is-active' : ''}
            onClick={() => setSection('general')}
            data-settings-section="general"
          >
            <span aria-hidden="true">⚙</span>
            <span>
              <strong>通用</strong>
              <small>外观与阅读排版</small>
            </span>
          </button>
          <button
            type="button"
            className={section === 'ai' ? 'is-active' : ''}
            onClick={() => setSection('ai')}
            data-settings-section="ai"
          >
            <span className="settings-workspace__ai-mark" aria-hidden="true">AI</span>
            <span>
              <strong>AI 与模型</strong>
              <small>默认值与 Provider</small>
            </span>
          </button>
          <button
            type="button"
            className={section === 'logs' ? 'is-active' : ''}
            onClick={() => setSection('logs')}
            data-settings-section="logs"
          >
            <span aria-hidden="true">≡</span>
            <span>
              <strong>本地日志</strong>
              <small>查看与导出诊断记录</small>
            </span>
          </button>
        </nav>
      </aside>

      <main className="settings-workspace__content" data-settings-active={section}>
        {section === 'general' ? (
          <GeneralSettingsModal
            open
            embedded
            onClose={() => undefined}
            onToast={onToast}
          />
        ) : section === 'ai' ? (
          <SettingsPage onToast={onToast} />
        ) : (
          <LogsPage onToast={onToast} />
        )}
      </main>
    </div>
  );
}
