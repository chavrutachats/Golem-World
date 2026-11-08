/**
 * Golem World: o mapa da jornada pelas 54 parashiot, em 3D. Cada livro é uma ilha;
 * toque numa fase e o Golem anda até ela pelas pedrinhas do caminho, e o painel
 * mostra o que se estuda ali. Nada aqui conta para o ranking: as moedas só compram
 * itens para o Golem.
 *
 * A cena 3D fica atrás; por cima, uma camada de rolagem com os nomes e as áreas de
 * toque. A câmera segue a rolagem a cada quadro.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { DIFFICULTY_LABELS_PT, parseNodeId, TRACKS, WORLDS, type JourneyNodeStatus, type WorldStatus } from '@trivia/shared';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WalletChips } from '@/components/economy/WalletChips';
import { GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { Stone } from '@/components/puzzle/Stone';
import { LockIcon, StarIcon } from '@/components/game/icons';
import { Map3D, type PlacedWorld, type WalkChannel } from '@/components/journey/Map3D';
import { NodeSheet } from '@/components/journey/NodeSheet';
import { Stage3D } from '@/components/three/Stage3D';
import { CONTENT_MAX_WIDTH } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { currentLocale, t, tc } from '@/lib/i18n';
import { walkPoints, type MapNodeLayout } from '@/lib/journey-map';
import { levelInfo } from '@/lib/journey-level';
import { errorMessage, keys, useJourney } from '@/lib/queries';
import { api } from '@/lib/session';
import { play } from '@/lib/sound';
import { SceneDirector } from '@/three/director';
import type { GolemPose } from '@/three/golem';
import { contentHeight, contentPoint, layoutWorld3D, mapToWorld, mapZoom, nodeWorldPosition } from '@/three/map';
import { g } from '@/theme/game';

/** Espaço livre no fim do mapa (pixels), para a última fase não ficar colada na borda. */
const BOTTOM_PAD = 140;
/** Mar entre uma ilha e a próxima (unidades do mapa): ali fica o nome do mundo seguinte. */
const WORLD_GAP = 24;
/** Faixa no topo do mapa (unidades do mapa) com a cena da Criação, antes de Bereshit. */
const PROLOGUE_H = 100;

function nodeStatus(status: WorldStatus | undefined, n: MapNodeLayout) {
  if (!status) return { main: undefined, tracks: [] as WorldStatus['parashot'][number]['tracks'] };
  if (n.kind === 'beitMidrash') return { main: status.beitMidrash, tracks: [] as WorldStatus['parashot'][number]['tracks'] };
  const p = status.parashot.find((x) => x.parashaId === n.parashaId);
  return { main: p?.main, tracks: p?.tracks ?? [] };
}

export default function JourneyMap() {
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.min(winW, CONTENT_MAX_WIDTH);
  const zoom = mapZoom(width);
  const reducedMotion = useReducedMotion();
  const qc = useQueryClient();
  const journey = useJourney();
  const data = journey.data;
  const [viewH, setViewH] = useState(winH * 0.8);

  // Mundos desenhados por inteiro: os abertos e o primeiro fechado (de aperitivo).
  const placed = useMemo(() => {
    const out: PlacedWorld[] = [];
    if (!data) return out;
    let top = PROLOGUE_H;
    let shownLocked = false;
    for (const w of WORLDS) {
      const st = data.worlds.find((x) => x.book === w.id);
      if (!st) continue;
      if (!st.unlocked) {
        if (shownLocked) break;
        shownLocked = true;
      }
      const layout = layoutWorld3D(w.id);
      out.push({ layout, top });
      top += layout.height + WORLD_GAP;
    }
    return out;
  }, [data]);
  const last = placed[placed.length - 1];
  const totalMapHeight = last ? last.top + last.layout.height : 0;
  const hiddenWorlds = data ? WORLDS.slice(placed.length) : [];

  const findNode = useCallback(
    (nodeId: string): { world: number; node: MapNodeLayout } | null => {
      for (let w = 0; w < placed.length; w++) {
        const node = placed[w]!.layout.nodes.find((n) => n.id === nodeId);
        if (node) return { world: w, node };
      }
      return null;
    },
    [placed],
  );

  // ------------------------------------------------------------ Golem andando
  const walker = useMemo(() => new SceneDirector<WalkChannel>({ x: 0, z: 0, heading: 0 }), []);
  const [standing, setStanding] = useState<string | null>(null);
  const [pose, setPose] = useState<GolemPose>('idle');

  const placeGolemAt = useCallback(
    (nodeId: string) => {
      const at = findNode(nodeId);
      if (!at) return;
      const p = nodeWorldPosition(at.node, placed[at.world]!.top);
      walker.set('x', p.x);
      walker.set('z', at.node.kind === 'beitMidrash' ? p.z + 1.6 : p.z);
      walker.set('heading', 0);
      setStanding(nodeId);
    },
    [findNode, placed, walker],
  );

  useEffect(() => {
    if (!data || standing) return;
    placeGolemAt(data.currentNodeId);
  }, [data, placeGolemAt, standing]);

  const walkTo = useCallback(
    async (target: string): Promise<void> => {
      const from = standing ? findNode(standing) : null;
      const to = findNode(target);
      if (!to) return;
      if (!from || from.world !== to.world || reducedMotion) {
        placeGolemAt(target);
        return;
      }
      const top = placed[to.world]!.top;
      const pts = walkPoints(placed[to.world]!.layout, from.node.index, to.node.index).map((p) => mapToWorld(p.x, top + p.y));
      if (to.node.kind === 'beitMidrash') pts[pts.length - 1]!.z += 1.6;
      if (pts.length < 2) return;
      const stepMs = Math.min(110, 2600 / pts.length);
      const steps = pts.slice(1);
      setPose('walk');
      const ticks = steps.map((_, i) => setTimeout(() => i % 2 === 0 && play('dot', 0.35), i * stepMs));
      await Promise.all([
        walker.sequence('x', steps.map((p) => ({ to: p.x, ms: stepMs }))),
        walker.sequence('z', steps.map((p) => ({ to: p.z, ms: stepMs }))),
      ]);
      ticks.forEach(clearTimeout);
      setPose('idle');
      setStanding(target);
    },
    [findNode, placeGolemAt, placed, reducedMotion, standing, walker],
  );

  // ------------------------------------------------------------ rolagem
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current || placed.length === 0) return;
    const at = findNode(data.currentNodeId);
    if (!at) return;
    scrolled.current = true;
    const y = contentPoint(nodeWorldPosition(at.node, placed[at.world]!.top), zoom, width).y - viewH * 0.45;
    scrollY.current = Math.max(0, y);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }), 50);
  }, [data, findNode, placed, viewH, width, zoom]);

  // ------------------------------------------------------------ painel da fase
  const [sheet, setSheet] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const statusOf = useCallback(
    (nodeId: string): JourneyNodeStatus | undefined => {
      if (!data) return undefined;
      for (const w of data.worlds) {
        if (w.beitMidrash.nodeId === nodeId) return w.beitMidrash;
        for (const p of w.parashot) {
          if (p.main.nodeId === nodeId) return p.main;
          const tr = p.tracks.find((x) => x.nodeId === nodeId);
          if (tr) return tr;
        }
      }
      return undefined;
    },
    [data],
  );

  const onNodePress = useCallback(
    async (n: MapNodeLayout) => {
      setStartError(null);
      const st = statusOf(n.id);
      if (st && st.state !== 'locked' && standing !== n.id) await walkTo(n.id);
      else play('pop', 0.5);
      setSheet(n.id);
    },
    [standing, statusOf, walkTo],
  );

  const startRun = useCallback(
    async (nodeId: string) => {
      setStarting(true);
      setStartError(null);
      try {
        const run = await api.journey.start(nodeId);
        setSheet(null);
        void qc.invalidateQueries({ queryKey: keys.journey });
        router.push(`/journey/run/${run.runId}`);
      } catch (e) {
        setStartError(errorMessage(e));
      } finally {
        setStarting(false);
      }
    },
    [qc],
  );

  const activeRunNode = useActiveRunNode(data?.activeRunId ?? null);
  const mapH = contentHeight(totalMapHeight, zoom) + BOTTOM_PAD;

  // ------------------------------------------------------------ tela
  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <StatusBar style="light" />
      <View style={[styles.column, { width }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Voltar')} onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={g.white} />
          </Pressable>
          <GameText size="lg" display style={styles.flex} accessibilityRole="header" numberOfLines={1}>
            Golem World
          </GameText>
          {data ? <WalletChips coins={data.coins} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Loja do Golem')} onPress={() => router.push('/journey/shop')} hitSlop={8} style={styles.closet} testID="journey-shop">
            <Ionicons name="shirt" size={20} color={g.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Pedras do Choshen')} onPress={() => router.push('/puzzle')} hitSlop={8} style={styles.puzzle} testID="journey-puzzle">
            <Stone kind={0} size={24} />
          </Pressable>
        </View>
        {data ? (
          <View style={styles.levelLine}>
            <T variant="caption" color={g.mist}>
              {t('Nível das perguntas agora:')}{' '}
              <T variant="caption" weight="bold" color={g.gold}>
                {tc(DIFFICULTY_LABELS_PT[data.level])}
              </T>{' '}
              · {t('sobe quando você acerta rápido')}
            </T>
          </View>
        ) : null}

        <View style={styles.flex} onLayout={(e) => setViewH(e.nativeEvent.layout.height)}>
          {data && placed.length > 0 ? (
            <Stage3D style={StyleSheet.absoluteFill} orthographic camera={{ position: [0, 30, 30], zoom }} testID="map-scene">
              <Map3D
                worlds={placed}
                statuses={data.worlds}
                scrollY={scrollY}
                viewHeight={viewH}
                zoom={zoom}
                totalMapHeight={totalMapHeight}
                look={data.golem}
                pose={pose}
                walker={walker}
                still={reducedMotion}
                prologueY={PROLOGUE_H / 2 - 4}
              />
            </Stage3D>
          ) : null}

          {journey.isLoading ? (
            <View style={styles.center}>
              <GameText size="md">{t('Abrindo o mapa…')}</GameText>
            </View>
          ) : journey.error ? (
            <View style={styles.center}>
              <GamePanel style={styles.gap}>
                <T color={g.white}>{errorMessage(journey.error)}</T>
                <GameButton label={t('Tentar de novo')} onPress={() => void journey.refetch()} />
              </GamePanel>
            </View>
          ) : data ? (
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollY.current = e.nativeEvent.contentOffset.y;
              }}
              refreshControl={<RefreshControl refreshing={journey.isRefetching} onRefresh={() => void journey.refetch()} tintColor={g.white} />}
            >
              <View style={{ height: mapH }}>
                <View pointerEvents="none" style={[styles.banner, styles.prologue, { top: contentPoint(mapToWorld(0, 6), zoom, width).y - 40 }]} testID="map-prologue">
                  <GameText size="md" weight="bold" color={g.ink}>
                    {tc('No princípio')}
                  </GameText>
                </View>
                {placed.map((p) => (
                  <WorldOverlay
                    key={p.layout.book}
                    world={p}
                    status={data.worlds.find((x) => x.book === p.layout.book)}
                    zoom={zoom}
                    width={width}
                    onNodePress={(n) => void onNodePress(n)}
                  />
                ))}
              </View>
              {hiddenWorlds.length > 0 ? (
                <View style={styles.hidden}>
                  {hiddenWorlds.map((w) => (
                    <View key={w.id} style={styles.hiddenRow}>
                      <LockIcon size={16} color={g.mist} />
                      <GameText size="sm" color={g.mist} style={styles.flex}>
                        {t('Mundo {n}: {name}', { n: w.number, name: tc(w.namePt) })}
                      </GameText>
                      {currentLocale() === 'he' ? null : (
                        <T serif variant="small" color="#9FAAD6">
                          {w.nameHe}
                        </T>
                      )}
                    </View>
                  ))}
                  <T variant="caption" color="#9FAAD6" align="center">
                    {t('Os próximos livros aparecem conforme o Golem avança.')}
                  </T>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>

        {data?.activeRunId && activeRunNode ? (
          <View style={styles.resume}>
            <GameButton
              label={t('Continuar: {level}', { level: levelInfo(activeRunNode)?.title ?? t('fase') })}
              tone="gold"
              icon="play"
              onPress={() => router.push(`/journey/run/${data.activeRunId}`)}
              testID="journey-resume"
            />
          </View>
        ) : null}
      </View>

      {sheet ? (
        <NodeSheet
          nodeId={sheet}
          status={statusOf(sheet)}
          onTracks={(() => {
            const node = parseNodeId(sheet);
            if (node?.kind !== 'parasha' || node.track !== 'torah' || statusOf(sheet)?.state !== 'completed') return null;
            return () => {
              setSheet(null);
              router.push(`/journey/parasha/${node.parashaId}`);
            };
          })()}
          onPlay={() => {
            if (data?.activeRunId && activeRunNode === sheet) {
              setSheet(null);
              router.push(`/journey/run/${data.activeRunId}`);
            } else void startRun(sheet);
          }}
          onClose={() => setSheet(null)}
          starting={starting}
          resumable={!!data?.activeRunId && activeRunNode === sheet}
          error={startError}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Nomes, estrelas, trilhas e áreas de toque de um mundo, por cima da cena 3D. */
function WorldOverlay({
  world,
  status,
  zoom,
  width,
  onNodePress,
}: {
  world: PlacedWorld;
  status: WorldStatus | undefined;
  zoom: number;
  width: number;
  onNodePress: (n: MapNodeLayout) => void;
}) {
  const def = WORLDS.find((w) => w.id === world.layout.book)!;
  const top = contentPoint(mapToWorld(0, world.top), zoom, width).y;
  const bottom = contentPoint(mapToWorld(0, world.top + world.layout.height), zoom, width).y;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[styles.banner, { top: top - 50 }]}>
        <GameText size="xs" weight="bold" color={g.goldDeep}>
          {t('MUNDO {n}', { n: def.number })}
        </GameText>
        <GameText size="md" weight="bold" color={g.ink}>
          {tc(def.namePt)}
        </GameText>
        {currentLocale() === 'he' ? null : (
          <T serif weight="bold" variant="small" color={g.ink}>
            {def.nameHe}
          </T>
        )}
      </View>
      {world.layout.nodes.map((n) => {
        const { main, tracks } = nodeStatus(status, n);
        const info = levelInfo(n.id);
        const state = main?.state ?? 'locked';
        const label = info?.title ?? '';
        const base = nodeWorldPosition(n, world.top);
        const p = contentPoint(n.kind === 'beitMidrash' ? base.clone().setZ(base.z + 1.6) : base, zoom, width);
        const labelRight = n.labelSide === 'right';
        return (
          <View key={n.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View
              pointerEvents="none"
              style={[
                styles.label,
                n.kind === 'beitMidrash'
                  ? { left: p.x - 100, width: 200, top: p.y + 20, alignItems: 'center' }
                  : labelRight
                    ? { left: p.x + 0.85 * zoom, top: p.y - 14 }
                    : { right: width - (p.x - 0.85 * zoom), top: p.y - 14, alignItems: 'flex-end' },
              ]}
            >
              <View style={[styles.tag, state === 'locked' && styles.tagLocked, state === 'open' && styles.tagOpen]}>
                <GameText size="sm" weight="semibold" color={state === 'open' ? g.ink : state === 'locked' ? '#DADDEA' : g.white} numberOfLines={1}>
                  {label}
                </GameText>
              </View>
              {n.kind === 'main' ? (
                <View style={styles.subRow}>
                  {tracks.map((tr) => (
                    <View
                      key={tr.track}
                      style={[styles.sat, { backgroundColor: tr.state === 'locked' ? '#7D8297' : TRACKS[tr.track].color, opacity: tr.available ? 1 : 0.4 }]}
                    >
                      {tr.state === 'completed' ? <View style={styles.satDone} /> : null}
                    </View>
                  ))}
                  {main?.state === 'completed' ? (
                    <View style={styles.starsMini}>
                      {Array.from({ length: main.stars }, (_, i) => (
                        <StarIcon key={i} size={13} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}. ${state === 'completed' ? t('Concluída, {n} estrelas', { n: main?.stars ?? 0 }) : state === 'open' ? t('Aberta') : t('Fechada')}`}
              onPress={() => onNodePress(n)}
              hitSlop={6}
              testID={`node-${n.id}`}
              style={[styles.hit, { left: p.x - 26, top: p.y - 30 }]}
            />
          </View>
        );
      })}
      {status && !status.unlocked ? (
        <View style={[styles.lockedWorld, { top, height: bottom - top }]} pointerEvents="none">
          <LockIcon size={34} />
          <GameText size="md" align="center" shadow>
            {t('Fechada por enquanto.')}
          </GameText>
        </View>
      ) : null}
    </View>
  );
}

/** Em que fase está a corrida em andamento (para o botão "Continuar"). */
function useActiveRunNode(runId: string | null): string | null {
  const [node, setNode] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!runId) {
      setNode(null);
      return;
    }
    api.journey
      .run(runId)
      .then((r) => alive && setNode(r.status === 'active' ? r.nodeId : null))
      .catch(() => alive && setNode(null));
    return () => {
      alive = false;
    };
  }, [runId]);
  return node;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: g.velvetDeep },
  flex: { flex: 1 },
  column: { flex: 1, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: g.velvetDeep },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closet: { backgroundColor: g.gold, borderRadius: 14, padding: 7 },
  puzzle: { backgroundColor: '#3B261B', borderColor: '#6B4A36', borderWidth: 1, borderRadius: 14, padding: 4 },
  levelLine: { backgroundColor: g.velvetDeep, paddingHorizontal: 14, paddingBottom: 8 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16 },
  gap: { gap: 12 },
  prologue: { backgroundColor: 'rgba(255,248,225,0.92)' },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: g.paper,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  label: { position: 'absolute', gap: 4 },
  tag: { backgroundColor: 'rgba(18,24,61,0.86)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, maxWidth: 170 },
  tagOpen: { backgroundColor: g.gold },
  tagLocked: { backgroundColor: 'rgba(18,24,61,0.5)' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sat: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  satDone: { width: 4, height: 4, borderRadius: 2, backgroundColor: g.white },
  starsMini: { flexDirection: 'row', marginLeft: 4 },
  hit: { position: 'absolute', width: 52, height: 52, borderRadius: 26 },
  lockedWorld: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(14,18,48,0.45)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hidden: { backgroundColor: g.velvetDeep, padding: 16, gap: 8 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: g.velvetLine, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  resume: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
