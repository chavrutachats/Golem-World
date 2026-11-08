/**
 * Os testes conferem os textos em português: o idioma não pode depender do aparelho
 * (ou do contêiner) onde eles rodam.
 */
import { beforeEach } from 'vitest';
import { useLocale } from '../src/lib/i18n';

beforeEach(() => {
  useLocale.setState({ locale: 'pt', chosen: true });
});
