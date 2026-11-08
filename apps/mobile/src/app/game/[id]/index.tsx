/**
 * Tabuleiro da partida: placar, sevivon e a próxima ação conforme a fase que a API informa.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import {
  LIVES_REFILL_PRICE,
  CATEGORIES,
  type CategoryId,
  type GameState,
  type PlayerState,
  type QuestionForPlayer,
  type RoundPrize,
  type WheelSlice,
  isCategoryId,
  WHEEL_SLICES,
} from '@trivia/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { CONFETTI_COLORS } from '@/components/AnswerOption';
import { PrizeFaceSheet, RoundPrizeCard } from '@/components/economy/RoundPrizeCard';
import { CategoryReveal, type RevealSlice } from '@/components/fx/CategoryReveal';
import { Confetti } from '@/components/fx/Confetti';
import { CategoryMark, CrownMeter, SealRow } from '@/components/GamePieces';
import { Keter } from '@/components/Keter';
import { LivesBar } from '@/components/LivesBar';
import { GolemFace } from '@/components/game/GolemFace';
import { TopBar } from '@/components/TopBar';
import { Sevivon, type SevivonHandle } from '@/components/Sevivon';
import { Button } from '@/components/ui/Button';
import { Chunky } from '@/components/ui/Chunky';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { categoryName, modeLabel, pointsLabel } from '@/lib/copy';
import { confirmAction, haptic, sleep } from '@/lib/feedback';
import { hanukkahNight } from '@/lib/hanukkah';
import { adBreak, applyEconomy, earnReward, useMonetization } from '@/lib/monetization';
import { springs, STAGGER_MS } from '@/lib/motion';
import { play } from '@/lib/sound';
import { errorMessage, keys, useGame, type CachedQuestion } from '@/lib/queries';
import { api } from '@/lib/session';
import { brand, radius, space } from '@/theme/tokens';
import { t, tn } from '@/lib/i18n';

/** Ponto da vez: dourado e pulsando para quem joga agora. */
function TurnDot({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = active && !reducedMotion ? withRepeat(withSequence(withTiming(1.6, { duration: 700 }), withTiming(1, { duration: 700 })), -1) : withTiming(1);
  }, [active, reducedMotion, pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: active ? (1.6 - pulse.value) * 0.9 : 0, transform: [{ scale: pulse.value * 1.6 }] }));
  return (
    <View style={styles.dotBox}>
      <Animated.View style={[styles.turnHalo, halo]} />
      <View style={[styles.turnDot, { backgroundColor: active ? brand.gold : 'transparent', borderColor: active ? brand.gold : brand.velvetLine }]} />
    </View>
  );
}

function PlayerLine({ player, active, label }: { player: PlayerState; active: boolean; label: string }) {
  return (
    <View style={styles.playerLine}>
      <TurnDot active={active} />
      <View style={styles.avatar}>
        <GolemFace look={player.golem} size={42} bot={player.isBot} />
      </View>
      <View style={styles.flex}>
        <T weight="bold" color={brand.onVelvet} numberOfLines={2}>
          {label}
        </T>
        <View style={styles.nameRow}>
          {player.isBot ? (
            <View style={styles.botTag} accessibilityLabel={t('Adversário controlado pelo jogo')}>
              <T variant="caption" weight="bold" color={brand.gold}>
                BOT
              </T>
            </View>
          ) : null}
          <T variant="caption" color={brand.onVelvetMuted}>
            {pointsLabel(player.score)}
          </T>
        </View>
      </View>
      <SealRow seals={player.seals} />
    </View>
  );
}

function Scoreboard({ game, onRegen }: { game: GameState; onRegen: () => void }) {
  const meActive = game.isMyTurn;
  return (
    <View style={styles.scoreboard}>
      <PlayerLine player={game.me} active={meActive && game.status === 'active'} label={t('Você')} />
      {game.opponent ? (
        <PlayerLine player={game.opponent} active={!meActive && game.status === 'active'} label={game.opponent.displayName} />
      ) : null}
      <View style={styles.roundRow}>
        <T variant="small" color={brand.onVelvetMuted}>
          {t('Rodada {n} de {max}', { n: game.roundNumber, max: game.maxRounds })}
        </T>
        <CrownMeter progress={game.me.crownProgress} />
      </View>
      {game.status !== 'finished' && game.status !== 'abandoned' ? (
        <LivesBar lives={game.lives} color={brand.onVelvet} mutedColor={brand.onVelvetMuted} onRegen={onRegen} />
      ) : null}
    </View>
  );
}

function CrownChooser({ choices, onChoose, busy }: { choices: CategoryId[]; onChoose: (c: CategoryId) => void; busy: CategoryId | null }) {
  return (
    <View style={styles.chooser}>
      <View style={styles.chooserHead}>
        <Keter size={36} />
        <View style={styles.flex}>
          <T variant="title" display color={brand.onVelvet} accessibilityRole="header">
            {t('Escolha o selo')}
          </T>
          <T variant="small" color={brand.onVelvetMuted}>
            {t('Acerte a pergunta da categoria escolhida e o selo é seu.')}
          </T>
        </View>
      </View>
      {choices.length === 0 ? (
        <T color={brand.onVelvetMuted}>{t('Nenhuma categoria disponível para disputa agora.')}</T>
      ) : (
        <View style={styles.choiceGrid}>
          {choices.map((c, i) => (
            <Animated.View key={c} entering={FadeInDown.delay(120 + i * STAGGER_MS).springify().damping(15)} style={busy && busy !== c ? styles.dim : null}>
              <Chunky
                accessibilityRole="button"
                accessibilityLabel={t('Disputar o selo de {category}', { category: categoryName(c) })}
                disabled={!!busy}
                onPress={() => onChoose(c)}
                sound="pop"
                face={brand.velvetRaised}
                lip={brand.velvetDeep}
                border={brand.velvetLine}
                borderWidth={1}
                radius={radius.pill}
                faceStyle={styles.choice}
              >
                <CategoryMark id={c} size={44} />
                <T weight="bold" color={brand.onVelvet} style={styles.flex}>
                  {categoryName(c)}
                </T>
                {busy === c ? <ActivityIndicator color={brand.gold} /> : null}
              </Chunky>
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

function FinishedPanel({ game, onAgain, again, celebrate }: { game: GameState; onAgain: () => void; again: boolean; celebrate: boolean }) {
  let title: string;
  const won = game.status === 'finished' && !!game.winnerUserId && game.winnerUserId === game.me.userId;
  const allSeals = game.mode === 'solo' && game.me.seals.length === CATEGORY_IDS_COUNT;
  if (game.status === 'abandoned') title = t('Partida cancelada');
  else if (game.mode === 'solo') title = allSeals ? t('Todos os selos!') : t('Treino encerrado');
  else if (!game.winnerUserId) title = t('Empate');
  else if (won) title = t('Você venceu!');
  else title = t('{name} venceu', { name: game.opponent?.displayName ?? t('Seu adversário') });
  const seals = game.me.seals.length;
  const party = celebrate && (won || allSeals);
  useEffect(() => {
    if (party) {
      play('win');
      haptic.success();
    }
  }, [party]);
  return (
    <View style={styles.panel}>
      {party ? <Confetti burst={1} colors={CONFETTI_COLORS} count={50} power={1.7} durationMs={1900} style={styles.winBurst} /> : null}
      {won || allSeals ? (
        <Animated.View entering={ZoomIn.springify().damping(springs.pop.damping).delay(150)} style={styles.trophy}>
          <Keter size={72} />
        </Animated.View>
      ) : null}
      <T variant="display" weight="bold" color={brand.onVelvet} align="center" accessibilityRole="header">
        {title}
      </T>
      <T color={brand.onVelvetMuted} align="center">
        {t('{seals} e {points} nesta partida.', { seals: tn(seals, '{n} selo', '{n} selos'), points: pointsLabel(game.me.score) })}
      </T>
      <Button label={t('Jogar de novo')} variant="gold" size="lg" onPress={onAgain} loading={again} />
      <Button
        label={t('Voltar ao início')}
        variant="onVelvet"
        onPress={async () => {
          // Fim de partida é uma pausa: pode ser a hora do anúncio (com o presente antes).
          await adBreak('match');
          router.replace('/');
        }}
      />
    </View>
  );
}

const CATEGORY_IDS_COUNT = Object.keys(CATEGORIES).length;
/** Face da Coroa no sevivon (posição em WHEEL_SLICES). */
const WHEEL_CROWN_INDEX = WHEEL_SLICES.indexOf('crown');

export default function GameBoard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const qc = useQueryClient();
  const game = useGame(id);
  const wheel = useRef<SevivonHandle>(null);
  const { economy, ads } = useMonetization();
  const [livesBusy, setLivesBusy] = useState<'ad' | 'refill' | null>(null);
  const positioned = useRef(false);
  const reducedMotion = useReducedMotion();
  const [busy, setBusy] = useState<null | 'spinning' | 'opening' | 'again'>(null);
  const [landed, setLanded] = useState<WheelSlice | null>(null);
  const [reveal, setReveal] = useState<RevealSlice | null>(null);
  /** Caiu no Prêmio: a folha com o prêmio fica aberta até assistir ou dispensar. */
  const [prizeOffer, setPrizeOffer] = useState<RoundPrize | null>(null);
  const hanukkah = useMemo(() => hanukkahNight(), []);
  // Festa de vitória só quando o jogador VÊ a partida terminar (não ao reabrir uma antiga).
  const lastPhase = useRef<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [crownBusy, setCrownBusy] = useState<CategoryId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = game.data;
  useEffect(() => {
    if (!data) return;
    if (lastPhase.current && lastPhase.current !== 'finished' && data.phase === 'finished') setCelebrate(true);
    lastPhase.current = data.phase;
  }, [data]);
  const wheelSize = Math.min(width - space.lg * 2, height * 0.44, 380);

  // A tela só mostra a escolha da Coroa quando está em foco (a pergunta abre por cima dela).
  const [focused, setFocused] = useState(true);
  // Ao voltar da pergunta, atualiza o placar.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void qc.invalidateQueries({ queryKey: keys.game(id) });
      return () => setFocused(false);
    }, [qc, id]),
  );

  // Reabrindo uma partida com giro já feito: o sevivon aparece deitado na face sorteada.
  useEffect(() => {
    if (!data || positioned.current || busy) return;
    if (data.pendingSpin) wheel.current?.jumpTo(data.pendingSpin.sliceIndex);
    else if (data.phase === 'choose_crown') wheel.current?.jumpTo(WHEEL_CROWN_INDEX);
    positioned.current = true;
  }, [data, busy]);

  // De volta para girar (depois da pergunta, da Coroa ou do Prêmio): o sevivon fica de pé de novo.
  const phase0 = data?.phase;
  useEffect(() => {
    if (phase0 === 'spin' && !busy && !prizeOffer && focused) wheel.current?.rest();
  }, [phase0, busy, prizeOffer, focused]);

  const openQuestion = useCallback(
    (question: QuestionForPlayer) => {
      qc.setQueryData<CachedQuestion>(keys.question(id), { question, receivedAt: Date.now() });
      setFocused(false);
      setBusy(null);
      setLanded(null);
      router.push(`/game/${id}/question`);
      // A revelação some depois que a pergunta já cobriu a tela.
      setTimeout(() => setReveal(null), 400);
    },
    [qc, id],
  );

  async function spin() {
    setError(null);
    setBusy('spinning');
    haptic.tap();
    try {
      // A face do Prêmio só entra no sorteio quando este aparelho consegue mostrar anúncio.
      const result = await api.games.spin(id, { withPrize: !!ads });
      await wheel.current?.spinTo(result.sliceIndex);
      haptic.land();
      setLanded(result.result);
      if (result.result === 'prize') {
        await sleep(reducedMotion ? 150 : 600); // um instante para ver a moeda brilhar
        play('coin');
        if (result.prize) setPrizeOffer(result.prize);
        else wheel.current?.rest();
        setBusy(null);
        void game.refetch();
        return;
      }
      await sleep(reducedMotion ? 150 : 800); // um instante para ver a face brilhar de perto
      setReveal(result.result);
      play('reveal');
      if (result.result === 'crown') {
        await sleep(reducedMotion ? 500 : 1300);
        setReveal(null);
        await game.refetch();
        setBusy(null);
        return;
      }
      setBusy('opening');
      // A pergunta é buscada enquanto a revelação toca.
      const [question] = await Promise.all([api.games.question(id, result.spinId), sleep(reducedMotion ? 500 : 1300)]);
      openQuestion(question);
    } catch (e) {
      setReveal(null);
      setError(errorMessage(e));
      setBusy(null);
      void game.refetch();
    }
  }

  async function openPendingSpin(spinId: string) {
    setError(null);
    setBusy('opening');
    try {
      openQuestion(await api.games.question(id, spinId));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
      void game.refetch();
    }
  }

  async function chooseCrown(category: CategoryId) {
    setError(null);
    setCrownBusy(category);
    try {
      openQuestion(await api.games.crown(id, category));
    } catch (e) {
      setError(errorMessage(e));
      void game.refetch();
    } finally {
      setCrownBusy(null);
    }
  }

  async function forfeit() {
    if (!data) return;
    const waiting = data.status === 'waiting_opponent';
    const ok = await confirmAction(
      waiting ? t('Cancelar partida?') : t('Desistir da partida?'),
      waiting || data.mode === 'solo' ? t('A partida será encerrada.') : t('Seu adversário vence esta partida.'),
      waiting ? t('Cancelar partida') : t('Desistir'),
      true,
    );
    if (!ok) return;
    try {
      qc.setQueryData(keys.game(id), await api.games.forfeit(id));
      void qc.invalidateQueries({ queryKey: keys.games });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function playAgain() {
    if (!data) return;
    setBusy('again');
    try {
      await adBreak('match');
      const next = await api.games.create(data.mode);
      qc.setQueryData(keys.game(next.id), next);
      void qc.invalidateQueries({ queryKey: keys.games });
      router.replace(`/game/${next.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Screen tone="velvet">
        <TopBar onVelvet />
        <View style={styles.center}>
          {game.error ? (
            <>
              <T color={brand.onVelvet} align="center">
                {errorMessage(game.error)}
              </T>
              <Button label={t('Tentar de novo')} variant="onVelvet" onPress={() => void game.refetch()} />
            </>
          ) : (
            <ActivityIndicator color={brand.gold} size="large" />
          )}
        </View>
      </Screen>
    );
  }

  const phase = data.phase;
  const finished = phase === 'finished';
  const crownOpen = focused && phase === 'choose_crown' && !busy;
  const landedName = landed && isCategoryId(landed) ? categoryName(landed) : null;
  const pendingName = data.pendingSpin && isCategoryId(data.pendingSpin.result) ? categoryName(data.pendingSpin.result) : null;

  let status = '';
  if (busy === 'spinning') status = t('Girando…');
  else if (busy === 'opening') status = landedName ? t('Caiu em {category}.', { category: landedName }) : t('Abrindo a pergunta…');
  else if (phase === 'spin' && landed === 'prize') status = t('O Prêmio não gasta a vez. Gire de novo.');
  else if (phase === 'spin') status = t('Sua vez. Gire o sevivon.');
  else if (phase === 'spun') status = pendingName ? t('O sevivon caiu em {category}.', { category: pendingName }) : '';
  else if (phase === 'question') status = t('Você tem uma pergunta em aberto.');
  else if (phase === 'choose_crown') status = t('Coroa cheia! Escolha um selo para disputar.');
  else if (phase === 'opponent_turn') status = t('Vez de {name}. Esta tela se atualiza sozinha.', { name: data.opponent?.displayName ?? t('seu adversário') });
  else if (phase === 'waiting_opponent')
    status =
      data.mode === 'friend'
        ? t('Esperando seu amigo entrar.')
        : t('Procurando um adversário… Se ninguém aparecer em alguns segundos, um Golem-bot do seu nível entra no lugar.');
  const noLives = phase === 'spin' && data.lives.lives <= 0 && !busy;

  return (
    <Screen tone="velvet" scroll>
      <TopBar
        onVelvet
        title={modeLabel(data.mode)}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        right={
          !finished ? (
            <Pressable accessibilityRole="button" accessibilityLabel={phase === 'waiting_opponent' ? t('Cancelar partida') : t('Desistir da partida')} onPress={forfeit} hitSlop={12}>
              <Ionicons name="flag-outline" size={24} color={brand.onVelvetMuted} />
            </Pressable>
          ) : undefined
        }
      />
      <Scoreboard game={data} onRegen={() => void qc.invalidateQueries({ queryKey: keys.game(id) })} />

      <View style={styles.wheelArea}>
        <Sevivon ref={wheel} size={wheelSize} hanukkah={hanukkah} active={focused} />
      </View>
      {data.roundPrize && ads && !prizeOffer && phase === 'spin' ? (
        <RoundPrizeCard prize={data.roundPrize} onClaimed={() => void qc.invalidateQueries({ queryKey: keys.game(id) })} />
      ) : null}

      <View style={styles.actions}>
        {status ? (
          <Animated.View key={status} entering={reducedMotion ? undefined : FadeIn.duration(220)}>
            <T color={brand.onVelvet} align="center" accessibilityLiveRegion="polite" style={styles.status}>
              {status}
            </T>
          </Animated.View>
        ) : null}
        {error ? (
          <T color="#FFB4AB" align="center" accessibilityLiveRegion="assertive">
            {error}
          </T>
        ) : null}

        {noLives ? (
          <View style={styles.noLives} testID="no-lives">
            <T weight="bold" color={brand.onVelvet} align="center">
              {t('Suas vidas acabaram')}
            </T>
            <T variant="small" color={brand.onVelvetMuted} align="center">
              {t('Cada erro no sevivon gasta uma vida, e uma volta a cada 10 minutos. A partida espera por você; enquanto isso, que tal treinar no Golem World?')}
            </T>
            {ads && (economy?.rewardsToday.life.used ?? 0) < (economy?.rewardsToday.life.cap ?? 0) ? (
              <Button
                label={t('+1 vida com um anúncio')}
                variant="onVelvet"
                icon={<Ionicons name="play" size={18} color={brand.onVelvet} />}
                loading={livesBusy === 'ad'}
                onPress={async () => {
                  setLivesBusy('ad');
                  if ((await earnReward('life')) === 'claimed') void qc.invalidateQueries({ queryKey: keys.game(id) });
                  setLivesBusy(null);
                }}
                testID="lives-ad"
              />
            ) : null}
            {economy && economy.store.mode !== 'off' ? (
              <Button
                label={t('Encher as vidas ({price} shekels)', { price: LIVES_REFILL_PRICE })}
                variant="onVelvet"
                disabled={economy.wallet.shekels < LIVES_REFILL_PRICE}
                loading={livesBusy === 'refill'}
                onPress={async () => {
                  setLivesBusy('refill');
                  try {
                    applyEconomy(await api.economy.buyOffer('lives-refill'));
                    void qc.invalidateQueries({ queryKey: keys.game(id) });
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setLivesBusy(null);
                  }
                }}
                testID="lives-refill"
              />
            ) : null}
            <Button label={t('Ir para o Golem World')} variant="gold" onPress={() => router.push('/journey')} />
          </View>
        ) : phase === 'spin' || busy === 'spinning' || busy === 'opening' ? (
          <Button
            label={t('Girar')}
            variant="gold"
            size="lg"
            onPress={spin}
            loading={!!busy}
            pulse={phase === 'spin' && !busy}
            sound="pop"
            accessibilityHint={t('Sorteia a categoria da próxima pergunta')}
          />
        ) : null}
        {phase === 'spun' && data.pendingSpin && !busy ? (
          <Button label={t('Ver a pergunta')} variant="gold" size="lg" onPress={() => openPendingSpin(data.pendingSpin!.spinId)} />
        ) : null}
        {phase === 'question' && !busy ? (
          <Button label={t('Voltar para a pergunta')} variant="gold" size="lg" onPress={() => router.push(`/game/${id}/question`)} />
        ) : null}
        {phase === 'waiting_opponent' && data.mode === 'friend' && data.inviteCode ? (
          <View style={styles.invite}>
            <T variant="small" color={brand.onVelvetMuted} align="center">
              {t('Código do convite')}
            </T>
            <T variant="hero" weight="bold" color={brand.gold} align="center" style={styles.code} selectable>
              {data.inviteCode}
            </T>
            <Button
              label={t('Compartilhar código')}
              variant="gold"
              onPress={() =>
                void Share.share({ message: t('Vamos jogar Trivia Torá? Abra o app, toque em "Tenho um código de convite" e digite {code}.', { code: data.inviteCode ?? '' }) })
              }
            />
          </View>
        ) : null}
        {phase === 'waiting_opponent' && data.mode === 'random' ? <ActivityIndicator color={brand.gold} /> : null}
        {phase === 'opponent_turn' ? <ActivityIndicator color={brand.onVelvetMuted} /> : null}
        {finished ? <FinishedPanel game={data} onAgain={playAgain} again={busy === 'again'} celebrate={celebrate} /> : null}
      </View>

      {prizeOffer ? (
        <PrizeFaceSheet
          prize={prizeOffer}
          onClose={(claimed) => {
            setPrizeOffer(null);
            if (claimed) void qc.invalidateQueries({ queryKey: keys.game(id) });
          }}
        />
      ) : null}

      {reveal ? (
        <Modal visible transparent animationType="none" statusBarTranslucent>
          <CategoryReveal
            slice={reveal}
            subtitle={
              reveal === 'crown'
                ? t('Escolha o selo que quer disputar')
                : landed && isCategoryId(landed) && data.me.seals.includes(landed)
                  ? t('Você já tem este selo: vale pontos')
                  : t('Prepare-se!')
            }
          />
        </Modal>
      ) : null}

      <Modal visible={crownOpen} transparent animationType="slide" onRequestClose={() => router.back()}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <CrownChooser choices={data.crownChoices} onChoose={chooseCrown} busy={crownBusy} />
            {error ? (
              <T color="#FFB4AB" align="center">
                {error}
              </T>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  scoreboard: {
    backgroundColor: brand.velvet,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: brand.velvetLine,
    borderTopColor: 'rgba(255,255,255,0.14)',
    padding: space.md,
    gap: space.sm,
  },
  playerLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  botTag: { borderColor: brand.goldDeep, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6 },
  noLives: { gap: space.sm, alignItems: 'stretch' },
  dotBox: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  turnDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  turnHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: brand.gold },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: brand.velvetLine,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  wheelArea: { alignItems: 'center', marginTop: space.md },
  actions: { gap: space.md, marginTop: space.md, paddingBottom: space.lg },
  status: { minHeight: 25 },
  invite: { gap: space.sm },
  code: { letterSpacing: 6, fontVariant: ['tabular-nums'] },
  panel: { gap: space.md },
  trophy: { alignSelf: 'center' },
  winBurst: { top: 10, left: '50%' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,16,40,0.55)' },
  sheet: {
    backgroundColor: brand.velvet,
    borderTopLeftRadius: radius.piece,
    borderTopRightRadius: radius.piece,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: brand.velvetLine,
    borderTopColor: 'rgba(255,255,255,0.16)',
    padding: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  chooser: { gap: space.lg },
  chooserHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choiceGrid: { gap: space.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    paddingRight: space.lg,
  },
  dim: { opacity: 0.5 },
});
