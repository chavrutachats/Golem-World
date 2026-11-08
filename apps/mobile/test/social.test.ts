import { describe, expect, it } from 'vitest';
import { googleIosUrlScheme } from '../app.config';

describe('configuração do login social', () => {
  it('o esquema de retorno do Google no iPhone é o id de cliente iOS ao contrário', () => {
    expect(googleIosUrlScheme('1234-abcd.apps.googleusercontent.com')).toBe('com.googleusercontent.apps.1234-abcd');
  });
});
