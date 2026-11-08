/**
 * Fim de fase: vitória (estrelas, moedas, o que abriu no mapa, prêmios) ou corações
 * esgotados. Na casa de estudos do fim de cada livro, a vitória é um siyum.
 */
import { itemById, parashaById, parashaName, TRACKS, WORLDS, type GolemLook, type JourneyAnswerResult } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { Confetti } from '@/components/fx/Confetti';
import { CoinIcon, HeartIcon, StarIcon } from '@/components/game/icons';
import { ItemIcon } from '@/components/game/ItemIcon';
import { GolemShowcase } from '@/components/three/GolemShowcase';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { levelInfo, summarizeOpened } from '@/lib/journey-level';
import { earnReward } from '@/lib/monetization';
import { play } from '@/lib/sound';
import { g as px, onTrack } from '@/theme/game';
import { currentLocale, t, tc, tn } from '@/lib/i18n';

const CONFETTI = ['#FFD541', '#E43B44', '#63C74D', '#3A7BD5', '#FFFFFF', '#9B5BE0'];

type Completion = NonNullable<JourneyAnswerResult['completion']>;

export function CompletionOverlay({
  runId,
  nodeId,
  completion,
  coins,
  look,
  canDouble,
  onMap,
  onReplay,
  onTracks,
  busy,
}: {
  runId: string;
  nodeId: string;
  completion: Completion | null;
  coins: number;
  look: GolemLook | undefined;
  /** Oferecer "dobrar as moedas" com um anúncio (Fase 9). */
  canDouble: boolean;
  onMap: () => void;
  onReplay: () => void;
  onTracks: (() => void) | null;
  busy: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const info = levelInfo(nodeId);
  const [burst, setBurst] = useState(0);
  const [doubling, setDoubling] = useState<'idle' | 'busy' | 'done'>('idle');
  const double = async () => {
    setDoubling('busy');
    const outcome = await earnReward('double', runId);
    setDoubling(outcome === 'claimed' ? 'done' : 'idle');
    if (outcome === 'claimed') play('coin');
  };
  useEffect(() => {
    play('win');
    const timer = setTimeout(() => setBurst(1), 200);
    return () => clearTimeout(timer);
  }, []);
  const world = info ? WORLDS.find((w) => w.id === info.book) : undefined;
  const opened = summarizeOpened(completion?.opened ?? []);
  const nextParasha = opened.nextMain ? parashaById(opened.nextMain) : undefined;
  const title =
    info?.kind === 'beitMidrash'
      ? t('Siyum de {book}!', { book: world ? tc(world.namePt) : '' })
      : info?.kind === 'main'
        ? t('Torá de {parasha} concluída!', { parasha: info.title })
        : t('Caminho concluído!');

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop} testID="journey-complete">
      <ScrollView contentContainerStyle={styles.center}>
        <GamePanel style={styles.panel}>
          <GameText size="xl" align="center" shadow accessibilityRole="header">
            {title}
          </GameText>
          {info?.kind === 'beitMidrash' ? (
            <View style={styles.siyum}>
              <T serif weight="bold" variant="display" color={px.gold} align="center">
                חזק חזק ונתחזק
              </T>
              {currentLocale() === 'he' ? null : (
                <T variant="small" color="#DDE3FA" align="center">
                  {t('Chazak, chazak venitchazek: “sê forte, sê forte, e nos fortaleçamos”, como se diz na sinagoga ao terminar a leitura de cada livro da Torá.')}
                </T>
              )}
            </View>
          ) : null}
          <View style={styles.hero}>
            <GolemShowcase look={look} pose="cheer" style={styles.stage} background="#2A3A8F" mood="gold" still={reducedMotion} />
          </View>
          {completion ? (
            <View style={styles.stars} accessibilityLabel={t('{n} de {max} estrelas', { n: completion.stars, max: 3 })}>
              {[0, 1, 2].map((i) => (
                <Animated.View key={i} entering={reducedMotion ? undefined : ZoomIn.delay(350 + i * 260).springify().damping(9)}>
                  <StarIcon size={52} dim={i >= completion.stars} />
                </Animated.View>
              ))}
            </View>
          ) : null}
          <View style={styles.coins}>
            <CoinIcon size={30} />
            <GameText size="lg" weight="bold">{tn(doubling === 'done' ? coins * 2 : coins, '+{n} moeda', '+{n} moedas')}</GameText>
          </View>
          {canDouble && doubling !== 'done' ? (
            <GameButton
              label={t('Dobrar as moedas')}
              icon="play"
              tone="blue"
              size="sm"
              loading={doubling === 'busy'}
              disabled={busy}
              onPress={() => void double()}
              accessibilityHint={t('Assista a um anúncio e ganhe mais {n} moedas', { n: coins })}
              testID="journey-double"
            />
          ) : null}
          {completion && completion.bonusCoins > 0 ? (
            <T variant="caption" color="#C9D3F5" align="center">
              {t('inclui {n} de bônus por concluir', { n: completion.bonusCoins })}
              {completion.firstTime ? '' : ` ${t('(repetição vale metade)')}`}
            </T>
          ) : null}

          {opened.tracks.length > 0 ? (
            <View style={styles.block}>
              <GameText size="md" color={px.gold}>
                {t('Abriram os caminhos de estudo:')}
              </GameText>
              <View style={styles.chips}>
                {opened.tracks.map((tr) => (
                  <View key={tr} style={[styles.chip, { backgroundColor: TRACKS[tr].color }]}>
                    <GameText size="sm" color={onTrack(TRACKS[tr].color)}>
                      {tc(TRACKS[tr].labelPt)}
                    </GameText>
                  </View>
                ))}
              </View>
              <T variant="small" color="#DDE3FA">
                {t('Todo estudo parte da Torá: com o texto da parashá percorrido, os caminhos que nascem dele estão abertos.')}
              </T>
            </View>
          ) : null}
          {nextParasha ? (
            <T variant="small" color="#DDE3FA">
              {t('E o caminho principal segue até')}{' '}
              <T variant="small" weight="bold" color={px.white}>
                {parashaName(nextParasha, currentLocale())}
              </T>
              .
            </T>
          ) : null}
          {opened.beitMidrash ? (
            <T variant="small" color="#DDE3FA">
              {t('A casa de estudos do fim do livro abriu: {name}.', { name: tc(WORLDS.find((w) => w.id === opened.beitMidrash)?.beitMidrash.namePt ?? '') })}
            </T>
          ) : null}
          {completion?.rewards.length ? (
            <View style={styles.block}>
              <GameText size="md" color={px.gold}>
                {t('Prêmio para o Golem:')}
              </GameText>
              {completion.rewards.map((id) => {
                const item = itemById(id);
                return item ? (
                  <View key={id} style={styles.reward}>
                    <View style={styles.rewardIcon}>
                      <ItemIcon id={id} size={44} />
                    </View>
                    <View style={styles.flex}>
                      <T weight="bold" color={px.white}>
                        {tc(item.namePt)}
                      </T>
                      {item.perkPt ? (
                        <T variant="small" color="#DDE3FA">
                          {tc(item.perkPt)}
                        </T>
                      ) : null}
                    </View>
                  </View>
                ) : null;
              })}
            </View>
          ) : null}
          <View style={styles.buttons}>
            {onTracks ? <GameButton label={t('Ver os caminhos')} tone="green" onPress={onTracks} testID="journey-to-tracks" /> : null}
            <GameButton label={t('Voltar ao mapa')} tone="gold" onPress={onMap} testID="journey-to-map" />
            <GameButton label={t('Jogar de novo')} tone="blue" size="sm" onPress={onReplay} loading={busy} />
          </View>
        </GamePanel>
      </ScrollView>
      <Confetti burst={burst} colors={CONFETTI} count={40} power={1.3} style={styles.confetti} />
    </Animated.View>
  );
}

export function FailedOverlay({
  look,
  onRetry,
  onMap,
  onContinue,
  continuing,
  busy,
}: {
  look: GolemLook | undefined;
  onRetry: () => void;
  onMap: () => void;
  /** Continuar com 1 coração assistindo a um anúncio (uma vez por fase). */
  onContinue: (() => void) | null;
  continuing: boolean;
  busy: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop} testID="journey-failed">
      <View style={styles.center}>
        <GamePanel style={styles.panel}>
          <GameText size="xl" align="center" shadow accessibilityRole="header">
            {t('Os corações acabaram')}
          </GameText>
          <View style={styles.hero}>
            <GolemShowcase look={look} pose="hurt" style={styles.stage} background="#3A2F6E" mood="dusk" />
          </View>
          <T color="#DDE3FA" align="center">
            {t('Cada erro mostrou uma fonte nova. O Golem sacode a poeira e tenta de novo?')}
          </T>
          <View style={styles.buttons}>
            {onContinue ? (
              <GameButton
                label={t('Continuar com 1 coração')}
                leading={<HeartIcon size={20} />}
                tone="blue"
                onPress={onContinue}
                loading={continuing}
                disabled={busy}
                accessibilityHint={t('Assista a um anúncio e continue do obstáculo em que parou')}
                testID="journey-continue-ad"
              />
            ) : null}
            <GameButton label={t('Tentar de novo')} tone="green" onPress={onRetry} loading={busy} testID="journey-retry" />
            <GameButton label={t('Voltar ao mapa')} tone="gold" onPress={onMap} />
          </View>
        </GamePanel>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,30,0.78)' },
  center: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  panel: { gap: 12, padding: 16 },
  siyum: { gap: 4 },
  hero: { alignItems: 'center' },
  stage: { width: 220, height: 170, borderRadius: 24 },
  rewardIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: px.paper, alignItems: 'center', justifyContent: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  coins: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  block: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { gap: 10, marginTop: 4 },
  confetti: { position: 'absolute', top: '30%', left: '50%' },
});
