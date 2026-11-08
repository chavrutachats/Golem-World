/**
 * O tabuleiro: uma placa de barro com as pedras. Arraste uma pedra para a vizinha, ou
 * toque numa e depois na vizinha. As pedras deslizam, estouram, caem e descem do alto
 * conforme os quadros que lib/puzzle monta a partir do motor.
 */
import type { ClearedTile, PuzzleMove, PuzzleStep, Tile } from '@trivia/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { t } from '@/lib/i18n';
import type { PuzzleFrame } from '@/lib/puzzle-frames';
import { ClayPatch, STONE_COLORS, Stone } from './Stone';

const PAD = 8;
const STONE_SCALE = 0.86;

/**
 * Na web, cada pedra animada vira uma camada própria do navegador: mover ou pulsar uma
 * pedra não redesenha as outras 63 (o SVG com gradiente é caro de repintar).
 */
const WEB_LAYER: ViewStyle | undefined = Platform.OS === 'web' ? ({ willChange: 'transform' } as ViewStyle) : undefined;

interface TileProps {
  tile: Tile;
  row: number;
  col: number;
  cell: number;
  /** Linha de onde a pedra nova começa a cair. */
  from: number | undefined;
  selected: boolean;
  hinted: boolean;
  reducedMotion: boolean;
}

const TileView = memo(function TileView({ tile, row, col, cell, from, selected, hinted, reducedMotion }: TileProps) {
  const x = useSharedValue(col * cell);
  const y = useSharedValue((from ?? row) * cell);
  const scale = useSharedValue(1);

  useEffect(() => {
    const rows = Math.abs(y.value / cell - row);
    const cols = Math.abs(x.value / cell - col);
    const dur = reducedMotion ? 60 : rows > cols ? Math.min(520, 140 + rows * 55) : 150;
    x.value = withTiming(col * cell, { duration: dur, easing: Easing.out(Easing.quad) });
    y.value = withTiming(row * cell, { duration: dur, easing: rows > cols ? Easing.bezier(0.55, 0, 0.85, 1.15) : Easing.out(Easing.quad) });
  }, [row, col, cell, reducedMotion, x, y]);

  useEffect(() => {
    if (hinted && !reducedMotion) {
      scale.value = withRepeat(withSequence(withTiming(1.12, { duration: 380 }), withTiming(1, { duration: 380 })), -1);
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(selected ? 1.14 : 1, { duration: 120 });
    }
  }, [hinted, selected, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const size = Math.round(cell * STONE_SCALE);
  return (
    <Animated.View pointerEvents="none" style={[styles.tile, WEB_LAYER, { width: cell, height: cell }, style]}>
      {selected ? <View style={[styles.selectRing, { width: cell - 2, height: cell - 2, borderRadius: cell * 0.28 }]} /> : null}
      <Stone kind={tile.kind} special={tile.special} size={size} />
    </Animated.View>
  );
});

/** Pedra estourando: cresce um pouco, some, e solta faíscas da cor dela. */
const PopView = memo(function PopView({ tile, cell, reducedMotion }: { tile: ClearedTile; cell: number; reducedMotion: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: reducedMotion ? 120 : 260, easing: Easing.out(Easing.quad) });
  }, [p, reducedMotion]);
  const stone = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ scale: p.value < 0.3 ? 1 + p.value * 0.6 : Math.max(0, 1.18 - (p.value - 0.3) * 1.7) }] }));
  const color = tile.kind >= 0 ? STONE_COLORS[tile.kind]!.light : '#FFF4C2';
  const sparks = [0, 72, 144, 216, 288];
  return (
    <View pointerEvents="none" style={[styles.tile, { width: cell, height: cell, transform: [{ translateX: tile.col * cell }, { translateY: tile.row * cell }] }]}>
      <Animated.View style={[WEB_LAYER, stone]}>
        <Stone kind={tile.kind} special={tile.special} size={Math.round(cell * STONE_SCALE)} />
      </Animated.View>
      {reducedMotion ? null : sparks.map((deg) => <Spark key={deg} deg={deg} cell={cell} color={color} p={p} />)}
    </View>
  );
});

function Spark({ deg, cell, color, p }: { deg: number; cell: number; color: string; p: { value: number } }) {
  const rad = (deg * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? 0 : 1 - p.value,
    transform: [{ translateX: Math.cos(rad) * cell * 0.55 * p.value }, { translateY: Math.sin(rad) * cell * 0.55 * p.value }, { scale: 1 - p.value * 0.5 }],
  }));
  return <Animated.View style={[styles.spark, { backgroundColor: color, width: cell * 0.16, height: cell * 0.16, borderRadius: cell * 0.08 }, style]} />;
}

/** Explosões: faixa de luz na linha/coluna, onda no 3×3, clarão do Urim. */
const BlastView = memo(function BlastView({ blast, cell, rows, cols }: { blast: PuzzleStep['blasts'][number]; cell: number; rows: number; cols: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [p]);
  const line = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [blast.special === 'col' ? { scaleY: 0.2 + p.value * 0.8 } : { scaleX: 0.2 + p.value * 0.8 }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ scale: 0.4 + p.value * 1.1 }] }));
  if (blast.special === 'row') return <Animated.View pointerEvents="none" style={[styles.beam, { top: blast.row * cell + cell * 0.25, left: 0, width: cols * cell, height: cell * 0.5 }, line]} />;
  if (blast.special === 'col') return <Animated.View pointerEvents="none" style={[styles.beam, { left: blast.col * cell + cell * 0.25, top: 0, height: rows * cell, width: cell * 0.5 }, line]} />;
  const r = blast.special === 'urim' ? Math.max(rows, cols) * cell : cell * 1.6;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { width: r * 2, height: r * 2, borderRadius: r, left: (blast.col + 0.5) * cell - r, top: (blast.row + 0.5) * cell - r }, blast.special === 'urim' && styles.flash, ring]}
    />
  );
});

export interface PuzzleBoardProps {
  frame: PuzzleFrame;
  rows: number;
  cols: number;
  width: number;
  hint: PuzzleMove | null;
  disabled: boolean;
  reducedMotion: boolean;
  onSwap(move: PuzzleMove): void;
}

export function PuzzleBoard({ frame, rows, cols, width, hint, disabled, reducedMotion, onSwap }: PuzzleBoardProps) {
  const cell = Math.floor((width - PAD * 2) / cols);
  const boardW = cell * cols;
  const boardH = cell * rows;
  const [selected, setSelectedState] = useState<[number, number] | null>(null);
  const start = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  // Os gestos leem sempre o valor atual (refs), não o da hora em que foram criados.
  const live = useRef({ selected, disabled, onSwap, cell });
  live.current = { selected, disabled, onSwap, cell };
  const setSelected = (v: [number, number] | null) => {
    live.current.selected = v;
    setSelectedState(v);
  };
  // Explosões duram um pouco mais que o quadro: guardadas com um número de série.
  const [blastKey, setBlastKey] = useState(0);
  useEffect(() => {
    if (frame.blasts.length) setBlastKey((k) => k + 1);
  }, [frame.blasts]);

  useEffect(() => {
    if (disabled) {
      live.current.selected = null;
      setSelectedState(null);
    }
  }, [disabled]);

  const cellAt = (x: number, y: number): [number, number] | null => {
    const size = live.current.cell;
    const c = Math.floor((x - PAD) / size);
    const r = Math.floor((y - PAD) / size);
    return r >= 0 && r < rows && c >= 0 && c < cols ? [r, c] : null;
  };

  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 6,
    onBegin: (e) => {
      start.current = cellAt(e.x, e.y);
      fired.current = false;
    },
    onUpdate: (e) => {
      const from = start.current;
      if (!from || fired.current || live.current.disabled) return;
      const dx = e.translationX;
      const dy = e.translationY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < live.current.cell * 0.32) return;
      fired.current = true;
      const [r, c] = from;
      const to: [number, number] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
      setSelected(null);
      if (to[0] >= 0 && to[0] < rows && to[1] >= 0 && to[1] < cols) live.current.onSwap([r, c, to[0], to[1]]);
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => {
      if (live.current.disabled) return;
      const at = cellAt(e.x, e.y);
      if (!at) return;
      const selected = live.current.selected;
      if (selected && Math.abs(selected[0] - at[0]) + Math.abs(selected[1] - at[1]) === 1) {
        setSelected(null);
        live.current.onSwap([selected[0], selected[1], at[0], at[1]]);
      } else if (selected && selected[0] === at[0] && selected[1] === at[1]) {
        setSelected(null);
      } else {
        setSelected(at);
      }
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const tiles = useMemo(() => {
    const out: { tile: Tile; row: number; col: number }[] = [];
    frame.board.forEach((row, r) => row.forEach((tile, c) => tile && out.push({ tile, row: r, col: c })));
    // Ordem estável por id: o React não remonta as pedras que só mudaram de casa.
    return out.sort((a, b) => a.tile.id - b.tile.id);
  }, [frame.board]);

  const isHint = (r: number, c: number) => !!hint && ((hint[0] === r && hint[1] === c) || (hint[2] === r && hint[3] === c));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.frame, { width: boardW + PAD * 2, height: boardH + PAD * 2 }]}
        accessible
        accessibilityLabel={t('Tabuleiro de pedras. Arraste uma pedra para a vizinha, ou toque numa e depois na vizinha, para formar 3 iguais.')}
        testID="puzzle-board"
      >
        <View style={[styles.inner, { width: boardW, height: boardH }]}>
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (
              <View
                key={`${r}-${c}`}
                style={[styles.slot, { left: c * cell, top: r * cell, width: cell, height: cell, backgroundColor: (r + c) % 2 ? 'rgba(255,236,210,0.07)' : 'rgba(255,236,210,0.025)' }]}
              >
                <ClayPatch hp={frame.clay[r]?.[c] ?? 0} size={cell} />
              </View>
            )),
          )}
          {tiles.map(({ tile, row, col }) => (
            <TileView
              key={tile.id}
              tile={tile}
              row={row}
              col={col}
              cell={cell}
              from={frame.spawnFrom.get(tile.id)}
              selected={!!selected && selected[0] === row && selected[1] === col}
              hinted={isHint(row, col)}
              reducedMotion={reducedMotion}
            />
          ))}
          {frame.popping.map((tile) => (
            <PopView key={`pop-${tile.id}`} tile={tile} cell={cell} reducedMotion={reducedMotion} />
          ))}
          {reducedMotion ? null : frame.blasts.map((b, i) => <BlastView key={`b-${blastKey}-${i}`} blast={b} cell={cell} rows={rows} cols={cols} />)}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: {
    // O tabuleiro é uma grade: não espelha no hebraico (as jogadas são por linha e coluna).
    direction: 'ltr',
    padding: PAD,
    borderRadius: 26,
    backgroundColor: '#6E4329',
    borderBottomWidth: 6,
    borderBottomColor: '#4A2A18',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inner: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#3E2516' },
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  tile: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  selectRing: { position: 'absolute', borderWidth: 3, borderColor: '#FFC93C', backgroundColor: 'rgba(255,201,60,0.18)' },
  spark: { position: 'absolute' },
  beam: { position: 'absolute', backgroundColor: 'rgba(255,248,214,0.9)', borderRadius: 999, shadowColor: '#FFC93C', shadowOpacity: 0.9, shadowRadius: 12 },
  ring: { position: 'absolute', borderWidth: 6, borderColor: 'rgba(255,214,102,0.95)' },
  flash: { backgroundColor: 'rgba(255,250,230,0.55)', borderWidth: 0 },
});
