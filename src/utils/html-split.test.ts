import { describe, expect, it } from 'vitest';
import { htmlBlockHasTranslatableText } from './html-split';

describe('htmlBlockHasTranslatableText', () => {
  it('rejects image-only and whitespace-only blocks', () => {
    expect(htmlBlockHasTranslatableText('<p><img src="https://example.com/a.png" alt="diagram"></p>')).toBe(false);
    expect(htmlBlockHasTranslatableText('<hr>')).toBe(false);
    expect(htmlBlockHasTranslatableText('<p>&nbsp; &#160; &#xA0;</p>')).toBe(false);
  });

  it('keeps captions and ordinary article blocks translatable', () => {
    expect(htmlBlockHasTranslatableText('<p><img src="a.png">A useful caption.</p>')).toBe(true);
    expect(htmlBlockHasTranslatableText('<h2>Section title</h2>')).toBe(true);
  });
});
