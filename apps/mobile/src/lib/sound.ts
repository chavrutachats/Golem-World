/**
 * Efeitos sonoros do jogo (gerados por scripts/make-sounds.py).
 *
 * - Respeitam o modo silencioso do aparelho e tocam junto com a música de quem estiver
 *   ouvindo algo (não pedem o foco de áudio).
 * - Podem ser desligados no perfil (lib/prefs).
 * - Cada som tem alguns players prontos, para tiques rápidos (roleta, relógio) não
 *   cortarem uns aos outros.
 * - Falha de áudio nunca derruba o jogo: qualquer erro aqui é ignorado.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { usePrefs } from './prefs';

const SOURCES = {
  tick: require('../../assets/sounds/tick.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  clock: require('../../assets/sounds/clock.wav'),
  seal: require('../../assets/sounds/seal.wav'),
  win: require('../../assets/sounds/win.wav'),
  // Golem World (8 bits)
  jump: require('../../assets/sounds/jump.wav'),
  coin: require('../../assets/sounds/coin.wav'),
  bump: require('../../assets/sounds/bump.wav'),
  dot: require('../../assets/sounds/dot.wav'),
  power: require('../../assets/sounds/power.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  // Sevivon: o giro na mesa (a parte rápida) e o tombo
  spin: require('../../assets/sounds/spin.wav'),
  topple: require('../../assets/sounds/topple.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const POOL_SIZE: Partial<Record<SoundName, number>> = { tick: 4, clock: 2, pop: 2, dot: 3, coin: 2 };
const pools: Partial<Record<SoundName, { players: AudioPlayer[]; next: number }>> = {};
let configured = false;

function pool(name: SoundName) {
  let p = pools[name];
  if (!p) {
    const size = POOL_SIZE[name] ?? 1;
    p = { players: Array.from({ length: size }, () => createAudioPlayer(SOURCES[name])), next: 0 };
    pools[name] = p;
  }
  return p;
}

/** Prepara o áudio (chamado uma vez ao abrir o app). */
export function prepareSounds(): void {
  if (configured) return;
  configured = true;
  try {
    void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
    (Object.keys(SOURCES) as SoundName[]).forEach(pool);
  } catch {
    // Sem áudio neste aparelho/navegador: o jogo segue mudo.
  }
}

export function play(name: SoundName, volume = 1): void {
  if (!usePrefs.getState().sound) return;
  try {
    prepareSounds();
    const p = pool(name);
    const player = p.players[p.next % p.players.length]!;
    p.next++;
    player.volume = volume;
    void player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // ignora
  }
}
