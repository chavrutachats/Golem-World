import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GameMode, GameSummary, PrepStatus } from '@trivia/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LivesBar } from '@/components/LivesBar';
import { WalletChips } from '@/components/economy/WalletChips';
import { PrepOverlay } from '@/components/PrepOverlay';
import { GolemFace } from '@/components/game/GolemFace';
import { GolemShowcase } from '@/components/three/GolemShowcase';
import { Stone } from '@/components/puzzle/Stone';
import { GameText } from '@/components/game/GameText';
import { Button } from '@/components/ui/Button';
import { Chunky } from '@/components/ui/Chunky';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { initials, pointsLabel } from '@/lib/copy';
import { STAGGER_MS } from '@/lib/motion';
import { waitForPrep } from '@/lib/prep';
import { levelInfo } from '@/lib/journey-level';
import { errorMessage, keys, useJourney, useMe, useMyGames } from '@/lib/queries';
import { api, useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';
import { g as px } from '@/theme/game';
import { brand, radius, space } from '@/theme/tokens';
import { msg, t } from '@/lib/i18n';

const NEW_GAME: { mode: GameMode; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'solo', title: msg('Treinar sozinho'), detail: msg('Gire e responda no seu ritmo.'), icon: 'book-outline' },
  { mode: 'random', title: msg('Adversário aleatório'), detail: msg('Enfrente quem estiver procurando partida. Sem ninguém na fila, um Golem-bot do seu nível entra.'), icon: 'shuffle' },
  { mode: 'friend', title: msg('Desafiar um amigo'), detail: msg('Gere um código para mandar a quem você quiser.'), icon: 'people-outline' },
];

function statusLine(g: GameSummary, myId: string): { text: string; highlight: boolean } {
  switch (g.phase) {
    case 'waiting_opponent':
      return { text: g.mode === 'friend' ? t('Aguardando seu amigo entrar') : t('Procurando adversário'), highlight: false };
    case 'opponent_turn':
      return { text: t('Vez de {name}', { name: g.opponentName ?? t('seu adversário') }), highlight: false };
    case 'finished':
      if (g.status === 'abandoned') return { text: t('Partida cancelada'), highlight: false };
      if (g.mode === 'solo') return { text: t('Treino encerrado'), highlight: false };
      if (!g.winnerUserId) return { text: t('Empate'), highlight: false };
      return { text: g.winnerUserId === myId ? t('Você venceu') : t('{name} venceu', { name: g.opponentName ?? t('Seu adversário') }), highlight: false };
    default:
      return { text: t('Sua vez'), highlight: true };
  }
}

/** Textos em português; traduza com t() ao mostrar. */

/** Selo "Sua vez" que pulsa devagar, para a partida esperando o jogador saltar aos olhos. */
function YourTurnBadge() {
  const reducedMotion = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (!reducedMotion) s.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1);
  }, [reducedMotion, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.badge, style]}>
      <T variant="caption" weight="bold" color={brand.onGold}>
        {t('Sua vez!')}
      </T>
    </Animated.View>
  );
}

function GameRow({ game, myId }: { game: GameSummary; myId: string }) {
  const { colors } = useTheme();
  const status = statusLine(game, myId);
  const title = game.mode === 'solo' ? t('Treino') : game.opponentName ? t('Contra {name}', { name: game.opponentName }) : t('Nova partida');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${status.text}`}
      onPress={() => router.push(`/game/${game.id}`)}
      style={({ pressed }) => [styles.row, { borderColor: colors.line }, pressed && { backgroundColor: colors.surfaceSunken }]}
    >
      <View style={[styles.turnNotch, { backgroundColor: status.highlight ? brand.gold : 'transparent' }]} />
      <View style={styles.rowBody}>
        <T weight="bold">{title}</T>
        {status.highlight ? (
          <YourTurnBadge />
        ) : (
          <T variant="small" muted>
            {status.text}
          </T>
        )}
      </View>
      <T variant="small" muted style={styles.score} accessibilityLabel={t('{mine} selos seus, {theirs} do adversário', { mine: game.mySeals, theirs: game.opponentSeals })}>
        {game.mode === 'solo' ? `${game.mySeals}/6` : `${game.mySeals} × ${game.opponentSeals}`}
      </T>
      <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

export default function Home() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const user = useSession((s) => s.user)!;
  const games = useMyGames();
  const me = useMe();
  const journey = useJourney();
  const qc = useQueryClient();
  // Fase 8: antes da roleta, o servidor prepara perguntas no idioma do jogador.
  const [prep, setPrep] = useState<PrepStatus | null>(null);
  const prepCancelled = useRef(false);
  const create = useMutation({
    mutationFn: async (mode: GameMode) => {
      prepCancelled.current = false;
      const ready = await waitForPrep(() => api.games.prepare(), { onProgress: setPrep, isAlive: () => !prepCancelled.current });
      if (prepCancelled.current) throw new Error(t('Preparo cancelado.'));
      if (ready.status === 'unavailable') {
        setPrep(ready);
        throw new Error(t('Ainda não há perguntas neste idioma.'));
      }
      setPrep(null);
      return api.games.create(mode);
    },
    onSuccess: (state) => {
      qc.setQueryData(keys.game(state.id), state);
      void qc.invalidateQueries({ queryKey: keys.games });
      router.push(`/game/${state.id}`);
    },
  });

  const list = games.data ?? [];
  const active = list.filter((g) => g.status === 'active' || g.status === 'waiting_opponent');
  const done = list.filter((g) => g.status === 'finished' || g.status === 'abandoned').slice(0, 10);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={games.isRefetching} onRefresh={() => void games.refetch()} />}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Seu perfil')}
          onPress={() => router.push('/profile')}
          style={styles.me}
        >
          <View style={styles.avatar}>
            {me.data ? (
              <GolemFace look={me.data.golem} size={46} />
            ) : (
              <T weight="bold" color={brand.gold}>
                {initials(user.displayName)}
              </T>
            )}
          </View>
          <View style={styles.flex}>
            <T variant="lead" weight="bold" numberOfLines={1}>
              {t('Shalom, {name}', { name: user.displayName })}
            </T>
            <T variant="small" muted>
              {pointsLabel(user.totalPoints)}
            </T>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Ranking')} onPress={() => router.push('/ranking')} hitSlop={10} style={styles.iconButton}>
          <Ionicons name="trophy-outline" size={26} color={colors.ink} />
        </Pressable>
      </View>

      {me.data ? (
        <View style={styles.lives}>
          <View style={styles.flex}>
            <LivesBar lives={me.data.lives} color={colors.ink} mutedColor={colors.inkMuted} onRegen={() => void me.refetch()} />
          </View>
          <View style={styles.wallet}>
            <WalletChips />
          </View>
        </View>
      ) : null}

      <Animated.View entering={reducedMotion ? undefined : FadeInDown.springify().damping(15)} style={styles.worldCard}>
        <Chunky
          accessibilityRole="button"
          accessibilityLabel={t('Golem World. Jornada de estudo pelas parashiot, sem ranking.')}
          onPress={() => router.push('/journey')}
          sound="power"
          face={WORLD_FACE}
          lip="#141B48"
          border="#4352A8"
          borderWidth={1}
          radius={radius.surface}
          lipHeight={3}
          faceStyle={styles.world}
          testID="home-golem-world"
        >
          <GolemShowcase look={me.data?.golem ?? journey.data?.golem} pose="idle" style={styles.worldStage} background={WORLD_FACE} still={reducedMotion} />
          <View style={styles.flex}>
            <T variant="title" display color={px.white}>
              Golem World
            </T>
            <T variant="small" color={px.white} style={styles.worldText}>
              {t('Jornada de estudo pelas 54 parashiot. Prepare-se para o sevivon.')}
            </T>
            {journey.data ? (
              <View style={styles.worldTag}>
                <GameText size="xs" color={brand.gold}>
                  {journey.data.activeRunId ? `${t('Fase em andamento')} · ` : `${t('Próxima:')} `}
                  {levelInfo(journey.data.currentNodeId)?.title ?? ''}
                </GameText>
              </View>
            ) : null}
          </View>
        </Chunky>
      </Animated.View>

      <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(60).springify().damping(15)} style={styles.puzzleCard}>
        <Chunky
          accessibilityRole="button"
          accessibilityLabel={t('Pedras do Choshen. Combine as pedras do peitoral e rache o barro do Golem.')}
          onPress={() => router.push('/puzzle')}
          sound="power"
          face={CHOSHEN_FACE}
          lip="#24160F"
          border="#6B4A36"
          borderWidth={1}
          radius={radius.surface}
          lipHeight={3}
          faceStyle={styles.puzzle}
          testID="home-puzzle"
        >
          <View style={styles.puzzleStones}>
            <View style={styles.puzzleStoneBack}>
              <Stone kind={4} size={38} />
            </View>
            <Stone kind={0} size={46} />
            <View style={styles.puzzleStoneFront}>
              <Stone kind={2} size={38} />
            </View>
          </View>
          <View style={styles.flex}>
            <T variant="title" display color={px.white}>
              {t('Pedras do Choshen')}
            </T>
            <T variant="small" color={px.white} style={styles.worldText}>
              {t('Combine as pedras do peitoral e rache o barro do Golem.')}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={22} color={px.white} />
        </Chunky>
      </Animated.View>

      <T variant="title" display style={styles.sectionTitle} accessibilityRole="header">
        {t('Sevivon: novo jogo')}
      </T>
      <View style={styles.newGame}>
        {NEW_GAME.map((option, i) => (
          <Animated.View key={option.mode} entering={reducedMotion ? undefined : FadeInDown.delay(80 + i * STAGGER_MS).springify().damping(15)}>
            <Chunky
              accessibilityRole="button"
              accessibilityLabel={`${t(option.title)}. ${t(option.detail)}`}
              disabled={create.isPending}
              onPress={() => create.mutate(option.mode)}
              sound="pop"
              face={brand.velvet}
              lip="#0C1130"
              border={brand.velvetLine}
              borderWidth={1}
              radius={radius.surface}
              lipHeight={3}
              faceStyle={styles.choice}
            >
              <View style={styles.choiceIcon}>
                <Ionicons name={option.icon} size={22} color={brand.gold} />
              </View>
              <View style={styles.flex}>
                <T variant="lead" weight="semibold" color={brand.onVelvet}>
                  {t(option.title)}
                </T>
                <T variant="small" color={brand.onVelvetMuted}>
                  {t(option.detail)}
                </T>
              </View>
              {create.isPending && create.variables === option.mode ? (
                <ActivityIndicator color={brand.gold} />
              ) : (
                <Ionicons name="chevron-forward" size={22} color={brand.onVelvetMuted} />
              )}
            </Chunky>
          </Animated.View>
        ))}
      </View>
      {create.error ? (
        <T color={colors.danger} style={styles.error}>
          {errorMessage(create.error)}
        </T>
      ) : null}
      <Button label={t('Tenho um código de convite')} variant="ghost" onPress={() => router.push('/join')} style={styles.codeButton} />

      <T variant="title" display style={styles.sectionTitle} accessibilityRole="header">
        {t('Suas partidas')}
      </T>
      {games.isLoading ? (
        <T muted>{t('Carregando…')}</T>
      ) : games.error ? (
        <View style={styles.errorBox}>
          <T color={colors.danger}>{errorMessage(games.error)}</T>
          <Button label={t('Tentar de novo')} variant="secondary" onPress={() => void games.refetch()} />
        </View>
      ) : active.length === 0 && done.length === 0 ? (
        <T muted>{t('Nenhuma partida ainda. Comece um treino para conhecer o sevivon.')}</T>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {[...active, ...done].map((g) => (
            <GameRow key={g.id} game={g} myId={user.id} />
          ))}
        </View>
      )}
      <View style={styles.bottomSpace} />
      {prep ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => ((prepCancelled.current = true), setPrep(null))}>
          <PrepOverlay
            mode="wheel"
            status={prep}
            look={me.data?.golem}
            onBack={() => {
              prepCancelled.current = true;
              setPrep(null);
            }}
          />
        </Modal>
      ) : null}
    </Screen>
  );
}

/** Os dois modos de estudo: o céu do Golem World e a nogueira do peitoral. */
const WORLD_FACE = '#24317A';
const CHOSHEN_FACE = '#3B261B';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  me: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brand.velvet,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lives: { marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wallet: { backgroundColor: brand.velvet, borderRadius: 16, paddingHorizontal: 4, paddingVertical: 3 },
  worldCard: { marginTop: space.xl },
  world: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingEnd: space.md, overflow: 'hidden' },
  worldStage: { width: 118, height: 128, borderRadius: radius.control },
  worldText: { textShadowColor: 'rgba(19,28,85,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  puzzleCard: { marginTop: space.md },
  puzzle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  puzzleStones: { width: 92, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  puzzleStoneBack: { marginEnd: -14, transform: [{ rotate: '-12deg' }] },
  puzzleStoneFront: { marginStart: -14, transform: [{ rotate: '10deg' }] },
  worldTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(240,190,78,0.16)', borderColor: 'rgba(240,190,78,0.5)', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, marginTop: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: space.xxl, marginBottom: space.md },
  newGame: { gap: space.md },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.lg },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: brand.goldDeep, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', backgroundColor: brand.gold, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 2, marginTop: 2 },
  codeButton: { alignSelf: 'center', marginTop: space.sm },
  error: { marginTop: space.sm },
  errorBox: { gap: space.md },
  list: { borderRadius: radius.surface, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md + 2,
    paddingRight: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  turnNotch: { width: 5, alignSelf: 'stretch', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  rowBody: { flex: 1, gap: 2 },
  score: { fontVariant: ['tabular-nums'] },
  bottomSpace: { height: space.xxxl },
});
