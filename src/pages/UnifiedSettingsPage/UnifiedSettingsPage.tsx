import { useState } from 'react';
import { GeneralSettingsModal } from '../../components/GeneralSettingsModal/GeneralSettingsModal';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { LogsPage } from '../LogsPage/LogsPage';
import './UnifiedSettingsPage.css';

export interface UnifiedSettingsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  /**
   * Phase 4.3.1:从设置页"新手引导"入口重新触发完整引导流程。
   * 父组件(App)负责挂载 OnboardingOverlay + 重置 step 状态。
   */
  onStartOnboardingTour?: () => void;
}

type SettingsSection = 'general' | 'ai' | 'logs';

export function UnifiedSettingsPage({ onToast, onStartOnboardingTour }: UnifiedSettingsPageProps) {
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
              <strong>AI模型</strong>
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
        {/* Phase 4.3.1:新手引导快速入口（任何 section 都可见） */}
        {onStartOnboardingTour && (
          <section
            className="settings-workspace__quick-action settings-surface__section"
            data-testid="settings-onboarding-entry"
          >
            <div className="settings-surface__section-body settings-surface__section-body--rows">
              <div className="settings-workspace__quick-action-row">
                <div className="settings-workspace__quick-action-text">
                  <strong>新手引导</strong>
                  <small>重新查看 8 步核心功能介绍</small>
                </div>
                <button
                  type="button"
                  className="settings-workspace__quick-action-btn"
                  onClick={onStartOnboardingTour}
                  data-testid="settings-onboarding-entry__button"
                >
                  开始引导
                </button>
              </div>
            </div>
          </section>
        )}
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
