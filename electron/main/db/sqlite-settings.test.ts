import { describe, expect, it } from 'vitest';
import { validateSettingsUpdate } from './sqlite-settings';

describe('validateSettingsUpdate', () => {
  it('accepts valid partial settings', () => {
    expect(validateSettingsUpdate({
      visualTheme: 'paper',
      fontTheme: 'serif-zh',
      sidebarPercent: 22,
      listPercent: 31
    })).toEqual({
      visualTheme: 'paper',
      fontTheme: 'serif-zh',
      sidebarPercent: 22,
      listPercent: 31
    });
  });

  it('rejects unknown keys, wrong types and out-of-range widths', () => {
    expect(() => validateSettingsUpdate({ injected: true })).toThrow(/未知设置项/);
    expect(() => validateSettingsUpdate({ visualTheme: 'neon' })).toThrow(/值无效/);
    expect(() => validateSettingsUpdate({ sidebarPercent: 80 })).toThrow(/值无效/);
    expect(() => validateSettingsUpdate(null)).toThrow(/必须是对象/);
  });
});
