/**
 * A fonte da pergunta, mostrada depois da resposta: o trecho que comprova o gabarito,
 * a referência com link para o Sefaria e a versão/licença do texto.
 */
import type { QuestionSource } from '@trivia/shared';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brand, radius, space } from '@/theme/tokens';
import { versionLine } from '@/lib/copy';
import { isSefariaUrl } from '@/lib/links';
import { T } from './ui/Text';
import { t } from '@/lib/i18n';

/** Tinta de link e de rótulo sobre o klaf. */
const KLAF_LINK = '#3640A6';
const KLAF_MUTED = '#6E5E45';

/** O trecho da fonte em klaf (pergaminho), com o fio da categoria na lateral. */
export function SourceCard({ source, accent }: { source: QuestionSource; accent: string }) {
  const hebrew = source.evidenceLanguage === 'he';
  const version = versionLine(source.evidenceLanguage, source.versionTitle, source.license, source.machineTranslated);

  return (
    <View style={styles.card}>
      <View style={[styles.rule, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <T
          serif
          variant={hebrew ? 'title' : 'lead'}
          color={brand.klafInk}
          lang={source.evidenceLanguage}
          style={hebrew ? styles.rtl : undefined}
        >
          {hebrew ? source.evidenceQuote : `“${source.evidenceQuote}”`}
        </T>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Abrir {ref} no Sefaria', { ref: source.ref })}
          onPress={() => {
            // Só abre o Sefaria, mesmo que um dia chegue outro endereço da API.
            if (isSefariaUrl(source.url)) void WebBrowser.openBrowserAsync(source.url);
          }}
          style={styles.link}
          hitSlop={8}
        >
          <T variant="body" weight="semibold" color={KLAF_LINK}>
            {t('{ref} no Sefaria', { ref: source.ref })}
          </T>
          <Ionicons name="open-outline" size={16} color={KLAF_LINK} />
        </Pressable>
        {version ? (
          <T variant="caption" color={KLAF_MUTED}>
            {version}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: radius.surface, borderWidth: 1, overflow: 'hidden', backgroundColor: brand.klaf, borderColor: brand.klafEdge },
  rule: { width: 4 },
  body: { flex: 1, padding: space.lg, gap: space.sm },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
});
