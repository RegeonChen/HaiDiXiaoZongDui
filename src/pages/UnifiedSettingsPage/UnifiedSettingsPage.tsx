import { useState } from 'react';
import { GeneralSettingsModal } from '../../components/GeneralSettingsModal/GeneralSettingsModal';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import './UnifiedSettingsPage.css';

export interface UnifiedSettingsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  onStartOnboarding: () => void;
  language: 'zh' | 'en';
}

type SettingsSection = 'general' | 'ai';

export function UnifiedSettingsPage({
  onToast,
  onStartOnboarding,
  language
}: UnifiedSettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('general');
  const tutorialCopy = language === 'zh'
    ? { title: '新手教程', description: '重新查看功能引导' }
    : { title: 'Getting Started', description: 'Replay the feature walkthrough' };
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
              <strong>AI模型</strong>
              <small>默认值与 Provider</small>
            </span>
          </button>
          <div className="settings-workspace__nav-separator" />
          <button
            type="button"
            className="settings-workspace__tutorial"
            onClick={onStartOnboarding}
            data-testid="settings-start-onboarding"
          >
            <span aria-hidden="true">▷</span>
            <span>
              <strong>{tutorialCopy.title}</strong>
              <small>{tutorialCopy.description}</small>
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
        ) : (
          <SettingsPage onToast={onToast} />
        )}
      </main>
    </div>
  );
}
