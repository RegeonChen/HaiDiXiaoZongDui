import { useTheme, type Theme } from '../../hooks/useTheme';
import './ThemeToggle.css';

const OPTIONS: { value: Theme; icon: string; label: string }[] = [
  { value: 'light', icon: '☀', label: '浅色' },
  { value: 'dark', icon: '☾', label: '深色' },
  { value: 'system', icon: '◐', label: '跟随系统' }
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="主题切换">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`theme-toggle__btn ${theme === opt.value ? 'is-active' : ''}`}
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
          title={opt.label}
        >
          <span aria-hidden="true">{opt.icon}</span>
        </button>
      ))}
    </div>
  );
}
