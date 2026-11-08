/**
 * Os caminhos de estudo de uma parashá. A Torá fica no alto: dela saem as trilhas
 * da Mishná, do Talmud, do Midrash, dos comentaristas, da Cabalá e das mitzvot,
 * que só abrem depois que a Torá desta parashá foi completada.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { parashaById, parashaName, parashaNodeId, shortRef, TRACKS, WORLDS } from '@trivia/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Island3D } from '@/components/journey/Island3D';
import { NodeSheet } from '@/components/journey/NodeSheet';
import { Coins, GameButton, Stars } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { CONTENT_MAX_WIDTH } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { type MapPoint } from '@/lib/journey-map';
import { errorMessage, keys, useJourney } from '@/lib/queries';
import { api } from '@/lib/session';
import { g as px } from '@/theme/game';
import { contentHeight, contentPoint, MAP_TOP_PAD, mapToWorld, mapZoom } from '@/three/map';
import { currentLocale, t, tc } from '@/lib/i18n';

const H = 150;
const TORAH: MapPoint = { x: 60, y: 30 };
const SPOTS: MapPoint[] = [
  { x: 20, y: 78 },
  { x: 60, y: 84 },
  { x: 100, y: 78 },
  { x: 20, y: 126 },
  { x: 60, y: 132 },
  { x: 100, y: 126 },
];

export default function ParashaTracks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parasha = parashaById(id);
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW, CONTENT_MAX_WIDTH);
  const zoom = mapZoom(width);
  // A ilha sobe o vão de cima do mapa e ganha espaço embaixo para a borda e os nomes da última fileira.
  const lift = MAP_TOP_PAD - 16;
  const islandH = contentHeight(H, zoom) - lift + 64;
  const reducedMotion = useReducedMotion();
  const at = (p: MapPoint) => {
    const c = contentPoint(mapToWorld(p.x, p.y), zoom, width);
    return { x: c.x, y: c.y - lift };
  };
  const qc = useQueryClient();
  const journey = useJourney();
  const data = journey.data;
  const world = parasha ? WORLDS.find((w) => w.id === parasha.book) : undefined;
  const status = useMemo(() => data?.worlds.flatMap((w) => w.parashot).find((p) => p.parashaId === id), [data, id]);
  const torahDone = status?.main.state === 'completed';

  const [sheet, setSheet] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (nodeId: string) => {
      setStarting(true);
      setError(null);
      try {
        const run = await api.journey.start(nodeId);
        setSheet(null);
        void qc.invalidateQueries({ queryKey: keys.journey });
        router.push(`/journey/run/${run.runId}`);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setStarting(false);
      }
    },
    [qc],
  );

  if (!parasha || !world) {
    return (
      <SafeAreaView style={styles.fill}>
        <GameText>{t('Parashá desconhecida.')}</GameText>
      </SafeAreaView>
    );
  }
  const LAND: Record<string, string> = { garden: '#7CCB5E', egypt: '#EBC27E', camp: '#93D163', desert: '#EFB878', plains: '#8BCF5A' };
  const tracks = status?.tracks ?? [];
  const sheetStatus = sheet ? (sheet === status?.main.nodeId ? status.main : tracks.find((tr) => tr.nodeId === sheet)) : undefined;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      <StatusBar style="light" />
      <View style={[styles.column, { width }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Voltar ao mapa')} onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={px.white} />
          </Pressable>
          <View style={styles.flex}>
            <GameText size="lg" shadow accessibilityRole="header">
              {parashaName(parasha, currentLocale())}
            </GameText>
            <T variant="caption" color="#C9D3F5">
              {tc(parasha.meaningPt)} · {shortRef(parasha.ref, currentLocale())}
            </T>
          </View>
          {currentLocale() === 'he' ? null : (
            <T serif weight="bold" variant="title" color={px.gold}>
              {parasha.nameHe}
            </T>
          )}
          {data ? <Coins value={data.coins} /> : null}
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={{ width, height: islandH }}>
            <Island3D
              width={width}
              height={islandH}
              zoom={zoom}
              islandHeight={H}
              seed={parasha.id}
              land={LAND[world.terrain] ?? '#7CCB5E'}
              torah={{ at: TORAH, look: torahDone ? 'done' : 'open', flag: null }}
              spots={tracks.map((tr, i) => ({
                at: SPOTS[i]!,
                look: tr.state === 'completed' ? 'done' : tr.state === 'open' ? 'open' : 'locked',
                flag: tr.state === 'locked' ? null : TRACKS[tr.track].color,
              }))}
              pathsOpen={torahDone}
              look={data?.golem}
              still={reducedMotion}
              lift={lift}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Torá de {parasha}', { parasha: parashaName(parasha, currentLocale()) })}
              onPress={() => setSheet(parashaNodeId(parasha.id))}
              style={[styles.hit, { left: at(TORAH).x - 30, top: at(TORAH).y - 34 }]}
            />
            <View style={[styles.torahLabel, { top: at(TORAH).y + 20 }]} pointerEvents="none">
              <GameText size="sm">{tc('Torá')}</GameText>
              {status?.main.state === 'completed' ? <Stars value={status.main.stars} size={18} /> : null}
            </View>
            {tracks.map((tr, i) => {
              const spot = SPOTS[i]!;
              const def = TRACKS[tr.track];
              return (
                <View key={tr.track} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <View style={[styles.trackLabel, { left: at(spot).x - 55, top: at(spot).y + 14 }]} pointerEvents="none">
                    <GameText size="sm" color={tr.state === 'locked' ? '#D7DAE4' : px.white} shadow>
                      {tc(def.labelPt)}
                    </GameText>
                    {currentLocale() === 'he' ? null : (
                      <T serif variant="caption" color={tr.state === 'locked' ? '#C3C7D3' : px.ink}>
                        {def.labelHe}
                      </T>
                    )}
                    {tr.state === 'completed' ? <Stars value={tr.stars} size={15} /> : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${tc(def.labelPt)}. ${tr.state === 'locked' ? t('Fechado') : tr.state === 'completed' ? t('Concluído') : t('Aberto')}`}
                    onPress={() => setSheet(tr.nodeId)}
                    style={[styles.hit, { left: at(spot).x - 30, top: at(spot).y - 30 }]}
                    testID={`track-${tr.track}`}
                  />
                </View>
              );
            })}
          </View>
          {!torahDone ? (
            <View style={styles.note}>
              <T color={px.white}>
                {t('Os caminhos abrem quando você completa a Torá de {parasha}. Todo estudo parte da Torá: primeiro o texto, depois o que os sábios disseram sobre ele.', { parasha: parashaName(parasha, currentLocale()) })}
              </T>
              <GameButton label={t('Jogar a Torá de {parasha}', { parasha: parashaName(parasha, currentLocale()) })} tone="green" onPress={() => void start(parashaNodeId(parasha.id))} loading={starting} />
            </View>
          ) : (
            <View style={styles.note}>
              <T color={px.white}>{t('Escolha um caminho. Cada um estuda os mesmos versículos por outra porta.')}</T>
              {tracks.map((tr) => (
                <T key={tr.track} variant="small" color="#C9D3F5">
                  <T variant="small" weight="bold" color={px.white}>
                    {tc(TRACKS[tr.track].labelPt)}:
                  </T>{' '}
                  {tc(TRACKS[tr.track].descriptionPt)}
                </T>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
      {sheet ? (
        <NodeSheet
          nodeId={sheet}
          status={sheetStatus}
          onTracks={null}
          onPlay={() => void start(sheet)}
          onClose={() => setSheet(null)}
          starting={starting}
          resumable={false}
          error={error}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: px.velvetDeep },
  flex: { flex: 1 },
  column: { flex: 1, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  body: { paddingBottom: 32 },
  hit: { position: 'absolute', width: 60, height: 60, borderRadius: 30 },
  torahLabel: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  trackLabel: { position: 'absolute', width: 110, alignItems: 'center' },
  note: { padding: 16, gap: 8 },
});
