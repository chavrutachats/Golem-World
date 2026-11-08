/**
 * Direção da tela no idioma escolhido: o hebraico vira a interface inteira da direita
 * para a esquerda (linhas, ícones, setas), não só o alinhamento do texto.
 *
 * - Web: `dir` no <html>; o react-native-web espelha as linhas sozinho.
 * - Celular: I18nManager guarda a direção e ela vale a partir do próximo carregamento,
 *   então o app recarrega (em desenvolvimento e no Expo Go) ou pede para ser reaberto.
 *
 * O mundo do Golem (mapa e fases) não espelha: o caminho anda sempre para a frente.
 */
import { LOCALE_INFO, type Locale } from '@trivia/shared';
import { DevSettings, I18nManager, Platform } from 'react-native';

export function applyDirection(locale: Locale, { reload, onNeedsRestart }: { reload: boolean; onNeedsRestart?: () => void }): void {
  const rtl = LOCALE_INFO[locale].dir === 'rtl';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = LOCALE_INFO[locale].tag;
    }
    return;
  }
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return;
  I18nManager.forceRTL(rtl);
  if (!reload) return;
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  onNeedsRestart?.();
}
