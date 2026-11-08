/**
 * Mapa do "Pedras do Choshen": 60 fases em 6 capítulos, um para cada pedra das duas
 * primeiras fileiras do peitoral (Shemot 28:17-18).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { PUZZLE_CHAPTER_SIZE, PUZZLE_LEVELS, PUZZLE_SOURCE_REF, PUZZLE_STONES, sefariaUrlForRef, type PuzzleOverview } from '@trivia/shared';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WalletChips } from '@/components/economy/WalletChips';
import { StarIcon } from '@/components/game/icons';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { stoneName } from '@/components/puzzle/PuzzleHud';
import { STONE_COLORS, Stone } from '@/components/puzzle/Stone';
import { Chunky } from '@/components/ui/Chunky';
import { T } from '@/components/ui/Text';
import { currentLocale, t } from '@/lib/i18n';
import { usePuzzleOverview } from '@/lib/puzzle';
import { errorMessage } from '@/lib/queries';
import { g } from '@/theme/game';

const CHAPTERS = PUZZLE_LEVELS / PUZZLE_CHAPTER_SIZE;

function LevelButton({ level, overview }: { level: number; overview: PuzzleOverview }) {
  const stars = overview.levels.find((l) => l.level === level)?.stars ?? 0;
  const locked = level > overview.unlocked;
  const current = level === overview.unlocked && stars === 0;
  const label = locked ? t('Fase {n}, fechada', { n: level }) : t('Fase {n}, {s} de 3 estrelas', { n: level, s: stars });
  return (
    <Chunky
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={locked}
      onPress={() => router.push({ pathname: '/puzzle/[level]', params: { level: String(level) } })}
      sound="pop"
      face={locked ? 'rgba(255,255,255,0.04)' : current ? g.gold : '#2A3570'}
      lip={locked ? 'rgba(0,0,0,0.18)' : current ? g.goldDeep : '#0C1130'}
      border={locked ? 'rgba(255,255,255,0.10)' : current ? g.gold : g.velvetLine}
      borderWidth={1}
      radius={14}
      lipHeight={locked ? 0 : 3}
      sheen={!locked}
      faceStyle={styles.levelFace}
      style={styles.level}
      testID={`puzzle-level-${level}`}
    >
      {locked ? (
        <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.32)" />
      ) : (
        <>
          <GameText size="lg" display color={current ? '#261A05' : g.white}>
            {level}
          </GameText>
          <View style={styles.levelStars}>
            {[0, 1, 2].map((i) => (
              <StarIcon key={i} size={11} dim={i >= stars} />
            ))}
          </View>
        </>
      )}
    </Chunky>
  );
}

export default function PuzzleMap() {
  const overview = usePuzzleOverview();
  const data = overview.data;
  const he = currentLocale() === 'he';
  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Voltar')} onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={g.white} />
        </Pressable>
        <GameText size="lg" display style={styles.flex} accessibilityRole="header" numberOfLines={2}>
          {t('Pedras do Choshen')}
        </GameText>
        {data ? (
          <View style={styles.total} accessibilityLabel={t('{n} estrelas', { n: data.totalStars })}>
            <StarIcon size={20} />
            <GameText size="md" weight="bold">
              {data.totalStars}
            </GameText>
          </View>
        ) : null}
        <WalletChips />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <GamePanel style={styles.intro}>
          <View style={styles.stoneRow}>
            {PUZZLE_STONES.map((s, i) => (
              <View key={s.id} style={styles.stoneCol}>
                <Stone kind={i} size={40} />
                <GameText size="xs" color={g.mist}>
                  {he ? s.he : stoneName(i)}
                </GameText>
              </View>
            ))}
          </View>
          <T color={g.white}>
            {t('As pedras das duas primeiras fileiras do peitoral do Kohen Gadol. Forme trios iguais, rache o barro do Golem e cumpra os objetivos antes de acabarem as jogadas.')}
          </T>
          <T variant="small" color={g.mist}>
            {t('As cores e as formas são do jogo: as identificações das pedras variam entre os comentaristas.')}
          </T>
          <GameButton
            label={t('Ler Shemot 28:17-18 no Sefaria')}
            icon="book"
            tone="ghost"
            size="sm"
            onPress={() => void WebBrowser.openBrowserAsync(sefariaUrlForRef(PUZZLE_SOURCE_REF))}
          />
        </GamePanel>

        {overview.isPending ? <ActivityIndicator color={g.gold} style={styles.spinner} /> : null}
        {overview.isError ? (
          <View style={styles.errorBox}>
            <T color={g.white}>{errorMessage(overview.error)}</T>
            <GameButton label={t('Tentar de novo')} size="sm" onPress={() => void overview.refetch()} />
          </View>
        ) : null}

        {data
          ? Array.from({ length: CHAPTERS }, (_, c) => {
              const first = c * PUZZLE_CHAPTER_SIZE + 1;
              const color = STONE_COLORS[c]!;
              return (
                <View key={c} style={styles.chapter} testID={`puzzle-chapter-${c + 1}`}>
                  <View style={[styles.chapterRule, { backgroundColor: color.base }]} />
                  <View style={styles.chapterHead}>
                    <Stone kind={c} size={34} />
                    <View style={styles.flex}>
                      <GameText size="md" weight="bold" accessibilityRole="header">
                        {t('Capítulo {n}: {name}', { n: c + 1, name: stoneName(c) })}
                      </GameText>
                      {he ? null : (
                        <GameText size="xs" color={g.mist}>
                          {PUZZLE_STONES[c]!.he}
                        </GameText>
                      )}
                    </View>
                  </View>
                  <View style={styles.grid}>
                    {Array.from({ length: PUZZLE_CHAPTER_SIZE }, (_, i) => (
                      <LevelButton key={i} level={first + i} overview={data} />
                    ))}
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: g.velvetDeep },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  total: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: { padding: 16, paddingBottom: 48, gap: 18, width: '100%', maxWidth: 560, alignSelf: 'center' },
  intro: { gap: 12 },
  stoneRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stoneCol: { alignItems: 'center', gap: 2 },
  spinner: { marginTop: 24 },
  errorBox: { gap: 12, alignItems: 'center' },
  chapter: { borderRadius: 20, borderWidth: 1, borderColor: g.velvetLine, borderTopColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', backgroundColor: g.velvet },
  /** Fio da pedra do capítulo, na lateral. */
  chapterRule: { position: 'absolute', top: 0, bottom: 0, start: 0, width: 3 },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'center' },
  level: { width: '17%', minWidth: 54, aspectRatio: 1 },
  levelFace: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  levelStars: { flexDirection: 'row', gap: 1 },
});
