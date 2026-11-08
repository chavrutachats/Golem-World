import { describe, expect, it } from 'vitest';
import { isSefariaUrl } from '../src/lib/links';

describe('links da fonte', () => {
  it('só abre páginas do Sefaria', () => {
    expect(isSefariaUrl('https://www.sefaria.org/Genesis.1.3')).toBe(true);
    expect(isSefariaUrl('https://www.sefaria.org/Berakhot.2a.1')).toBe(true);
    expect(isSefariaUrl('http://www.sefaria.org/Genesis.1.3')).toBe(false);
    expect(isSefariaUrl('https://www.sefaria.org.evil.com/x')).toBe(false);
    expect(isSefariaUrl('javascript:alert(1)')).toBe(false);
  });
});
