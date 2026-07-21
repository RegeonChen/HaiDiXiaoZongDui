import { describe, expect, it } from 'vitest';
import { normalizeReaderMode } from './useReaderMode';

describe('normalizeReaderMode', () => {
  it('accepts the three supported modes and defaults invalid values to reader', () => {
    expect(normalizeReaderMode('reader')).toBe('reader');
    expect(normalizeReaderMode('web')).toBe('web');
    expect(normalizeReaderMode('dual')).toBe('dual');
    expect(normalizeReaderMode('split')).toBe('reader');
    expect(normalizeReaderMode(null)).toBe('reader');
  });
});
