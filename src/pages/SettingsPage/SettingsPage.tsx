/**
 * SettingsPage — 设置页
 *
 * Phase 3 Integration 阶段
 *  - 通用设置：界面语言、字体主题、视觉主题、字号、阅读宽度
 *  - AI 默认值：默认摘要语言/详细度、默认翻译目标语言
 *  - AI Provider 管理：列表 + 新建/编辑/删除/测试
 *
 * 数据来源：FullDataSource.settingsGet / settingsUpdate + aiProviderList/...
 *
 * 字体/视觉/语言切换通过 props.onChangeAppearance（来自 useAppearance）走 IPC，
 * 并由 hook 同步到 <html data-font-theme data-visual-theme data-lang>，让探针
 * 能稳定拿到切换后的状态。
 */
import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, AIProvider, AIProviderCreateInput, AIProviderUpdateInput, Language, SummaryDetailLevel } from '@shared/types';
import { useDataSource } from '../../context/DataSourceContext';
import { useAppearance } from '../../hooks/useAppearance';
import { LoadingView } from '../../components/StatusView/LoadingView';
import { ErrorView } from '../../components/StatusView/ErrorView';
import './SettingsPage.css';

// 字体主题预设：3 套中英混排字体栈
const FONT_THEMES: Array<{ id: string; label: string; preview: string; stack: string }> = [
  {
    id: 'default',
    label: '默认',
    preview: 'Aa 字体 / Font',
    stack: `Georgia, "Source Han Serif SC", "Songti SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif`
  },
  {
    id: 'hei',
    label: '黑体',
    preview: 'Aa 黑体 / Sans',
    stack: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Helvetica Neue", Arial, sans-serif`
  },
  {
    id: 'kai',
    label: '楷体',
    preview: 'Aa 楷体 / Kai',
    stack: `"Kaiti SC", "STKaiti", "KaiTi", "FangSong", "Source Han Serif SC", serif`
  }
];

// 视觉主题：经典 / 纸质
const VISUAL_THEMES: Array<{ id: 'classic' | 'paper'; label: string; preview: string }> = [
  { id: 'classic', label: '经典', preview: '白底深字' },
  { id: 'paper', label: '纸质', preview: '暖黄护眼' }
];

export interface SettingsPageProps {
  onToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function SettingsPage({ onToast }: SettingsPageProps) {
  const ds = useDataSource();
  const appearance = useAppearance();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // AI Provider
  const [providers, setProviders] = useState<AIProvider[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [showProviderForm, setShowProviderForm] = useState(false);

  const loadAll = useCallback(async () => {
    const [s, p] = await Promise.all([ds.settingsGet(), ds.aiProviderList()]);
    if (s.kind === 'ready') {
      setSettings(s.data);
      setSettingsError(null);
    } else {
      setSettingsError(s.kind === 'error' ? s.error : '加载设置失败');
    }
    if (p.kind === 'ready') {
      setProviders(p.data);
      setProvidersError(null);
    } else {
      setProvidersError(p.kind === 'error' ? p.error : '加载 AI Provider 失败');
    }
  }, [ds]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const r = await ds.settingsUpdate(patch);
      if (r.kind === 'ready') {
        setSettings(r.data);
        onToast('设置已保存', 'success');
      } else {
        onToast(`保存失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, onToast]
  );

  const handleChangeAppearance = useCallback(
    async (patch: { fontTheme?: string; visualTheme?: 'classic' | 'paper'; language?: 'zh' | 'en' }) => {
      let ok = false;
      if (patch.fontTheme) ok = await appearance.setFontTheme(patch.fontTheme);
      else if (patch.visualTheme) ok = await appearance.setVisualTheme(patch.visualTheme);
      else if (patch.language) ok = await appearance.setLanguage(patch.language);
      if (ok) {
        setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
        onToast('外观已切换', 'success');
      } else {
        onToast('外观切换失败', 'error');
      }
    },
    [appearance, onToast]
  );

  const handleCreateProvider = useCallback(
    async (input: AIProviderCreateInput) => {
      const r = await ds.aiProviderCreate(input);
      if (r.kind === 'ready') {
        onToast('AI Provider 已添加', 'success');
        setShowProviderForm(false);
        const list = await ds.aiProviderList();
        if (list.kind === 'ready') setProviders(list.data);
      } else {
        onToast(`创建失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, onToast]
  );

  const handleUpdateProvider = useCallback(
    async (id: string, input: AIProviderUpdateInput) => {
      const r = await ds.aiProviderUpdate(id, input);
      if (r.kind === 'ready') {
        onToast('AI Provider 已更新', 'success');
        setEditingProvider(null);
        const list = await ds.aiProviderList();
        if (list.kind === 'ready') setProviders(list.data);
      } else {
        onToast(`更新失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
      }
    },
    [ds, onToast]
  );

  const handleDeleteProvider = useCallback(
    async (id: string) => {
      try {
        await ds.aiProviderDelete(id);
        onToast('AI Provider 已删除', 'success');
        const list = await ds.aiProviderList();
        if (list.kind === 'ready') setProviders(list.data);
      } catch (e) {
        onToast(`删除失败：${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    },
    [ds, onToast]
  );

  const handleTestProvider = useCallback(
    async (id: string) => {
      onToast('正在测试连接…', 'info');
      const r = await ds.aiProviderTest(id);
      onToast(r.message, r.ok ? 'success' : 'error');
    },
    [ds, onToast]
  );

  if (settingsError) {
    return <ErrorView message={settingsError} onRetry={loadAll} />;
  }
  if (!settings) {
    return <LoadingView message="正在加载设置…" />;
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page__title">设置</h1>

      {/* === 通用 === */}
      <section className="settings-page__section">
        <h2 className="settings-page__section-title">通用</h2>

        <div className="settings-page__row">
          <label className="settings-page__label">界面语言</label>
          <div className="settings-page__radio-group">
            {(['zh', 'en'] as Language[]).map((lang) => (
              <button
                key={lang}
                type="button"
                className={`settings-page__radio ${appearance.language === lang ? 'is-active' : ''}`}
                onClick={() => void handleChangeAppearance({ language: lang })}
              >
                {lang === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">字体主题</label>
          <div className="settings-page__radio-group">
            {FONT_THEMES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`settings-page__font-card ${appearance.fontTheme === f.id ? 'is-active' : ''}`}
                onClick={() => void handleChangeAppearance({ fontTheme: f.id })}
                title={f.stack}
                style={{ fontFamily: f.stack }}
              >
                <span className="settings-page__font-preview">{f.preview}</span>
                <span className="settings-page__font-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">视觉主题</label>
          <div className="settings-page__radio-group">
            {VISUAL_THEMES.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`settings-page__visual-card settings-page__visual-card--${v.id} ${appearance.visualTheme === v.id ? 'is-active' : ''}`}
                onClick={() => void handleChangeAppearance({ visualTheme: v.id })}
              >
                <span className="settings-page__visual-swatch" />
                <span className="settings-page__visual-label">{v.label}</span>
                <span className="settings-page__visual-preview">{v.preview}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">正文字号（px）</label>
          <input
            type="number"
            className="settings-page__input settings-page__input--narrow"
            min={12}
            max={24}
            value={settings.fontSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 12 && n <= 24) {
                void updateSettings({ fontSize: n });
              }
            }}
          />
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">阅读宽度（px）</label>
          <input
            type="number"
            className="settings-page__input settings-page__input--narrow"
            min={500}
            max={1400}
            step={50}
            value={settings.readingWidth}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 500 && n <= 1400) {
                void updateSettings({ readingWidth: n });
              }
            }}
          />
        </div>
      </section>

      {/* === AI 默认值 === */}
      <section className="settings-page__section">
        <h2 className="settings-page__section-title">AI 默认值</h2>

        <div className="settings-page__row">
          <label className="settings-page__label">默认摘要语言</label>
          <select
            className="settings-page__input"
            value={settings.defaultSummaryLanguage}
            onChange={(e) => void updateSettings({ defaultSummaryLanguage: e.target.value as Language })}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">默认摘要详细度</label>
          <select
            className="settings-page__input"
            value={settings.defaultSummaryDetail}
            onChange={(e) => void updateSettings({ defaultSummaryDetail: e.target.value as SummaryDetailLevel })}
          >
            <option value="brief">简略</option>
            <option value="standard">标准</option>
            <option value="detailed">详细</option>
          </select>
        </div>

        <div className="settings-page__row">
          <label className="settings-page__label">默认翻译目标语言</label>
          <select
            className="settings-page__input"
            value={settings.defaultTranslationTarget}
            onChange={(e) => void updateSettings({ defaultTranslationTarget: e.target.value as Language })}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      {/* === AI Provider === */}
      <section className="settings-page__section">
        <h2 className="settings-page__section-title">AI Provider</h2>

        {providersError ? (
          <ErrorView message={providersError} onRetry={loadAll} />
        ) : providers === null ? (
          <LoadingView message="正在加载 AI Provider…" />
        ) : (
          <>
            <div className="settings-page__provider-list">
              {providers.length === 0 && (
                <p className="settings-page__empty">尚未配置 AI Provider。点击下方按钮添加一个 OpenAI 兼容服务。</p>
              )}
              {providers.map((p) => (
                <div key={p.id} className="settings-page__provider-card">
                  <div className="settings-page__provider-info">
                    <strong>{p.name}</strong>
                    <span className="settings-page__provider-url">{p.baseUrl}</span>
                    <span className="settings-page__provider-model">{p.modelName}</span>
                    <span className="settings-page__provider-key">
                      API Key: {p.apiKeySet ? '已设置' : '未设置'}
                    </span>
                    {p.isDefault && <span className="settings-page__provider-default">默认</span>}
                  </div>
                  <div className="settings-page__provider-actions">
                    <button type="button" className="settings-page__btn" onClick={() => void handleTestProvider(p.id)}>
                      测试
                    </button>
                    <button type="button" className="settings-page__btn" onClick={() => setEditingProvider(p)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="settings-page__btn settings-page__btn--danger"
                      onClick={() => {
                        if (confirm(`确定要删除 Provider「${p.name}」？`)) {
                          void handleDeleteProvider(p.id);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {showProviderForm && (
              <ProviderForm
                onSubmit={handleCreateProvider}
                onCancel={() => setShowProviderForm(false)}
                submitLabel="创建"
              />
            )}

            {editingProvider && (
              <ProviderForm
                initial={editingProvider}
                onSubmit={(input) => void handleUpdateProvider(editingProvider.id, input)}
                onCancel={() => setEditingProvider(null)}
                submitLabel="保存"
              />
            )}

            {!showProviderForm && !editingProvider && (
              <button
                type="button"
                className="settings-page__btn settings-page__btn--primary"
                onClick={() => setShowProviderForm(true)}
              >
                + 添加 AI Provider
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ============== ProviderForm ==============

interface ProviderFormProps {
  initial?: AIProvider;
  onSubmit: (input: AIProviderCreateInput | AIProviderUpdateInput) => void | Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

function ProviderForm({ initial, onSubmit, onCancel, submitLabel }: ProviderFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? 'https://api.openai.com/v1');
  const [modelName, setModelName] = useState(initial?.modelName ?? 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim() || !modelName.trim()) return;
    if (!initial && !apiKey.trim()) return;
    const input: AIProviderCreateInput | AIProviderUpdateInput = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      modelName: modelName.trim(),
      isDefault,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
    };
    void onSubmit(input);
  };

  return (
    <form className="settings-page__form" onSubmit={handleSubmit}>
      <h3>{initial ? '编辑 AI Provider' : '新建 AI Provider'}</h3>
      <div className="settings-page__row">
        <label className="settings-page__label">名称</label>
        <input
          className="settings-page__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：OpenAI / DeepSeek / 自部署"
          required
        />
      </div>
      <div className="settings-page__row">
        <label className="settings-page__label">Base URL</label>
        <input
          className="settings-page__input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          required
        />
      </div>
      <div className="settings-page__row">
        <label className="settings-page__label">模型名</label>
        <input
          className="settings-page__input"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="gpt-4o-mini"
          required
        />
      </div>
      <div className="settings-page__row">
        <label className="settings-page__label">
          API Key {initial && <span className="settings-page__hint">（留空保持原值）</span>}
        </label>
        <input
          className="settings-page__input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={initial ? '••••••••' : 'sk-...'}
          required={!initial}
        />
      </div>
      <div className="settings-page__row">
        <label className="settings-page__label">设为默认</label>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
      </div>
      <div className="settings-page__form-actions">
        <button type="button" className="settings-page__btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="settings-page__btn settings-page__btn--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
