/**
 * Painel de uma fase do mapa: o que se estuda nela, os episódios que viram
 * obstáculos, estrelas e o botão de jogar (ou o motivo de ainda estar fechada).
 */
import {
  ITEMS,
  parashaById,
  parseNodeId,
  prerequisitesOf,
  parashaName,
  shortRef,
  SUB_TRACKS,
  TRACKS,
  WORLDS,
  type JourneyNodeStatus,
} from '@trivia/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LockIcon } from '@/components/game/icons';
import { GameButton, GamePanel, Stars } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { levelInfo } from '@/lib/journey-level';
import { g as px } from '@/theme/game';
import { currentLocale, t, tc } from '@/lib/i18n';

export interface NodeSheetProps {
  nodeId: string;
  status: JourneyNodeStatus | undefined;
  /** Para a Torá de uma parashá: a Torá já concluída abre os caminhos. */
  onTracks?: (() => void) | null;
  onPlay: () => void;
  onClose: () => void;
  starting: boolean;
  /** Há uma fase desta mesma trilha em andamento. */
  resumable: boolean;
  error: string | null;
}

export function NodeSheet({ nodeId, status, onTracks, onPlay, onClose, starting, resumable, error }: NodeSheetProps) {
  const info = levelInfo(nodeId);
  const node = parseNodeId(nodeId);
  if (!info || !node) return null;
  const state = status?.state ?? 'locked';
  const parasha = info.parashaId ? parashaById(info.parashaId) : undefined;
  const world = WORLDS.find((w) => w.id === info.book)!;
  const prereq = prerequisitesOf(node).find(Boolean);
  const prereqTitle = prereq ? levelInfo(prereq)?.title : null;
  const reward = info.kind === 'beitMidrash' ? ITEMS.find((i) => i.unlock.kind === 'beitMidrash' && i.unlock.book === info.book) : undefined;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(150)} style={styles.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Fechar')} style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.sheet} testID="journey-node-sheet">
        <GamePanel style={styles.panel}>
          <View style={styles.head}>
            <View style={[styles.swatch, { backgroundColor: info.color }]} />
            <View style={styles.flex}>
              <GameText size="lg" shadow accessibilityRole="header">
                {info.title}
              </GameText>
              {info.titleHe ? (
                <T serif variant="body" color={px.gold}>
                  {info.titleHe}
                </T>
              ) : null}
            </View>
            {state === 'completed' && status ? <Stars value={status.stars} size={24} /> : null}
          </View>
          <T variant="small" color="#DDE3FA">
            {info.kind === 'beitMidrash' ? tc(world.beitMidrash.subtitlePt) : info.subtitle}
            {parasha && info.kind === 'main' ? ` · ${shortRef(parasha.ref, currentLocale())}` : ''}
          </T>
          {info.kind === 'track' && info.track ? (
            <T variant="caption" color="#9FAAD6">
              {t('Fontes: {list}', { list: tc(TRACKS[info.track].sourcesPt) })}
            </T>
          ) : null}
          {info.kind === 'main' && parasha ? (
            <View style={styles.events}>
              {parasha.events.slice(0, 3).map((e) => (
                <View key={e.ref + e.obstacle} style={styles.event}>
                  <View style={styles.eventDot}>
                    <Ionicons name="book" size={12} color={px.ink} />
                  </View>
                  <T variant="small" color={px.white} style={styles.flex}>
                    {tc(e.captionPt)}{' '}
                    <T variant="caption" color="#9FAAD6">
                      {shortRef(e.ref, currentLocale())}
                    </T>
                  </T>
                </View>
              ))}
            </View>
          ) : null}
          {info.kind === 'beitMidrash' ? (
            <T variant="small" color="#DDE3FA">
              {reward
                ? t('Uma revisão com perguntas de todas as parashiot de {book}. No fim, um siyum e um prêmio para o Golem: {item}.', {
                    book: tc(world.namePt),
                    item: tc(reward.namePt),
                  })
                : t('Uma revisão com perguntas de todas as parashiot de {book}. No fim, um siyum.', { book: tc(world.namePt) })}
            </T>
          ) : null}

          {state === 'locked' ? (
            <View style={styles.lockBox}>
              <LockIcon size={20} />
              <T variant="small" color={px.white} style={styles.flex}>
                {info.kind === 'track'
                  ? t('Este caminho abre quando você completar a Torá de {parasha}. Todo estudo parte da Torá.', {
                      parasha: parasha ? parashaName(parasha, currentLocale()) : '',
                    })
                  : prereqTitle
                    ? t('Fechada: complete antes {level}.', { level: prereqTitle })
                    : t('Fechada por enquanto.')}
              </T>
            </View>
          ) : !status?.available ? (
            <T variant="small" color={px.gold}>
              {t('Em preparo: os textos desta fase ainda não foram carregados no servidor.')}
            </T>
          ) : (
            <GameButton
              label={resumable ? t('Continuar a fase') : state === 'completed' ? t('Jogar de novo') : t('Jogar')}
              tone="green"
              size="lg"
              onPress={onPlay}
              loading={starting}
              sound="power"
              testID="journey-play"
            />
          )}
          {error ? (
            <T variant="small" color="#FFB3B3">
              {error}
            </T>
          ) : null}

          {info.kind === 'main' ? (
            onTracks ? (
              <GameButton label={t('Caminhos de estudo')} tone="blue" onPress={onTracks} icon="git-branch" testID="journey-tracks" />
            ) : (
              <View style={styles.tracksPreview}>
                {SUB_TRACKS.map((tr) => (
                  <View key={tr} style={[styles.trackDot, { backgroundColor: '#5A6080' }]} />
                ))}
                <T variant="caption" color="#9FAAD6" style={styles.flex}>
                  {t('Mishná, Talmud, Midrash, comentaristas, Cabalá e mitzvot abrem depois desta fase.')}
                </T>
              </View>
            )
          ) : null}
        </GamePanel>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,30,0.45)' },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 14 },
  panel: { gap: 10, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  eventDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: px.gold, alignItems: 'center', justifyContent: 'center' },
  events: { gap: 6 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 14 },
  tracksPreview: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackDot: { width: 9, height: 9, borderRadius: 5 },
});
