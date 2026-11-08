/**
 * "Pedras do Choshen" no app: o motor de @trivia/shared roda aqui (o tabuleiro reage na
 * hora, sem esperar a rede), e cada jogada vira uma sequência de quadros para animar:
 * a troca, o estouro, a queda das pedras e as novas descendo. No fim, a lista de jogadas
 * vai para o servidor, que refaz a partida e dá estrelas e moedas.
 */
import { useQuery } from '@tanstack/react-query';
import { addMoves, createPuzzle, findMove, playMove, puzzleLevel, type PuzzleMove, type PuzzleRun, type PuzzleState } from '@trivia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from './feedback';
import { keys } from './queries';
import { api } from './session';
import { planMove, planNudge, restingFrame, type PuzzleFrame } from './puzzle-frames';
import { play } from './sound';

export type { PuzzleFrame } from './puzzle-frames';

export function usePuzzleOverview() {
  return useQuery({ queryKey: keys.puzzle, queryFn: () => api.puzzle.overview() });
}

// ---------------------------------------------------------------------------
// A partida na tela
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HINT_AFTER_MS = 6000;

export interface PuzzleGame {
  state: PuzzleState;
  frame: PuzzleFrame;
  busy: boolean;
  /** Jogadas feitas (vão para o servidor no fim). */
  moves: readonly PuzzleMove[];
  hint: PuzzleMove | null;
  swap(move: PuzzleMove): void;
  /** "+5 jogadas" depois do anúncio. */
  grantMoves(n: number): void;
}

export function usePuzzleGame(run: PuzzleRun, reducedMotion: boolean): PuzzleGame {
  const [state, setState] = useState(() => createPuzzle(puzzleLevel(run.level), run.seed));
  const [frame, setFrame] = useState(() => restingFrame(state));
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<PuzzleMove | null>(null);
  const moves = useRef<PuzzleMove[]>([]);
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Dica depois de um tempo parado: a jogada pisca no tabuleiro.
  useEffect(() => {
    setHint(null);
    if (busy || state.status !== 'playing') return;
    const timer = setTimeout(() => setHint(findMove(state.board)), HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy, state]);

  const runFrames = useCallback(async (frames: PuzzleFrame[]) => {
    for (const f of frames) {
      if (!alive.current) return;
      setFrame(f);
      if (f.sound) play(f.sound, f.sound === 'dot' ? 0.5 : 0.8);
      if (f.blasts.length) haptic.land();
      if (f.wait) await sleep(f.wait);
    }
  }, []);

  const swap = useCallback(
    (move: PuzzleMove) => {
      if (busyRef.current) return;
      const prev = stateRef.current;
      if (prev.status !== 'playing') return;
      const res = playMove(prev, move);
      busyRef.current = true;
      setBusy(true);
      setHint(null);
      void (async () => {
        if (!res.ok) {
          if (res.reason === 'no-match') {
            haptic.error();
            await runFrames(planNudge(prev, move));
          }
        } else {
          haptic.tap();
          moves.current.push(move);
          await runFrames(planMove(prev, res, reducedMotion));
          if (!alive.current) return;
          stateRef.current = res.state;
          setState(res.state);
          setFrame(restingFrame(res.state));
          if (res.state.status === 'won') {
            play('win');
            haptic.success();
          } else if (res.state.status === 'lost') {
            play('wrong');
          }
        }
        busyRef.current = false;
        if (alive.current) setBusy(false);
      })();
    },
    [reducedMotion, runFrames],
  );

  const grantMoves = useCallback((n: number) => {
    const next = addMoves(stateRef.current, n);
    stateRef.current = next;
    setState(next);
  }, []);

  return { state, frame, busy, moves: moves.current, hint, swap, grantMoves };
}
