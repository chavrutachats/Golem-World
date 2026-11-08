/**
 * O que aparece numa fase do Golem World (lógica pura): título, cenário de cada
 * trecho, o obstáculo de cada pergunta (episódios da parashá, com o versículo) e o
 * ponto de chegada.
 */
import {
  parashaById,
  parashotOfBook,
  parseNodeId,
  TRACKS,
  WORLDS,
  type AnswerOutcome,
  type JourneyTrack,
  type ObstacleId,
  type SceneStage,
  type TorahBook,
  parashaName,
} from '@trivia/shared';
import type { GoalModel } from '@/three/story';
import { currentLocale, msg, t, tc } from './i18n';


export interface LevelInfo {
  nodeId: string;
  kind: 'main' | 'track' | 'beitMidrash';
  book: TorahBook;
  parashaId: string | null;
  track: JourneyTrack | null;
  title: string;
  titleHe: string;
  subtitle: string;
  /** Cor de destaque (trilha) para bandeira e faixas. */
  color: string;
}

export function levelInfo(nodeId: string): LevelInfo | null {
  const node = parseNodeId(nodeId);
  if (!node) return null;
  if (node.kind === 'beit-midrash') {
    const w = WORLDS.find((x) => x.id === node.book)!;
    return {
      nodeId,
      kind: 'beitMidrash',
      book: node.book,
      parashaId: null,
      track: null,
      title: tc(w.beitMidrash.namePt),
      titleHe: currentLocale() === 'he' ? '' : w.nameHe,
      subtitle: t('Revisão de {book}: o livro inteiro', { book: tc(w.namePt) }),
      color: '#FFD541',
    };
  }
  const p = parashaById(node.parashaId)!;
  const track = TRACKS[node.track];
  const name = parashaName(p, currentLocale());
  return {
    nodeId,
    kind: node.track === 'torah' ? 'main' : 'track',
    book: p.book,
    parashaId: p.id,
    track: node.track,
    title: node.track === 'torah' ? name : `${name}: ${tc(track.labelPt)}`,
    titleHe: currentLocale() === 'he' ? '' : node.track === 'torah' ? p.nameHe : `${p.nameHe} · ${track.labelHe}`,
    subtitle: node.track === 'torah' ? tc(p.meaningPt) : tc(track.descriptionPt),
    color: track.color,
  };
}

export interface LevelObstacle {
  obstacle: ObstacleId;
  captionPt: string;
  ref: string;
}

/**
 * Obstáculo da pergunta `index` de `count`: os episódios da parashá em ordem,
 * espalhados pela fase (se houver menos episódios que obstáculos, um se repete em
 * seguida, sem voltar ao começo da história).
 */
export function obstacleAt(nodeId: string, index: number, count: number): LevelObstacle {
  const node = parseNodeId(nodeId);
  if (node?.kind === 'beit-midrash') {
    // Revisão do livro: um episódio de cada parashá, espalhados.
    const events = parashotOfBook(node.book).flatMap((p) => p.events);
    const e = events[(index * 5) % events.length]!;
    return { obstacle: e.obstacle, captionPt: tc(e.captionPt), ref: e.ref };
  }
  const p = node ? parashaById(node.parashaId) : undefined;
  const events = p?.events ?? [];
  if (events.length === 0) return { obstacle: 'rock', captionPt: '', ref: '' };
  const i = count > events.length ? Math.floor((index * events.length) / count) : index % events.length;
  const e = events[Math.min(events.length - 1, Math.max(0, i))]!;
  return { obstacle: e.obstacle, captionPt: tc(e.captionPt), ref: e.ref };
}

const TRACK_SKY: Partial<Record<JourneyTrack, SceneStage['sky']>> = { kabbalah: 'night', talmud: 'dusk', midrash: 'dawn' };

/**
 * Cenário do trecho atual da fase. Em Bereshit ele muda a cada obstáculo (os dias
 * da Criação); nas trilhas, o cenário da parashá ganha a luz da trilha (o Zohar à noite…).
 */
export function stageAt(nodeId: string, index: number, count: number): SceneStage {
  const node = parseNodeId(nodeId);
  if (!node) return { sky: 'day', ground: 'grass', props: [] };
  if (node.kind === 'beit-midrash') return { sky: 'gold', ground: 'stone', props: ['hills', 'city'] };
  const p = parashaById(node.parashaId)!;
  const stages = p.scene.stages;
  if (node.track === 'torah') {
    if (!stages?.length) return p.scene;
    const i = Math.min(stages.length - 1, Math.max(0, Math.floor((index * stages.length) / Math.max(1, count))));
    return stages[i]!;
  }
  const base: SceneStage = stages?.length ? stages[stages.length - 1]! : p.scene;
  const sky = TRACK_SKY[node.track];
  if (!sky || base.sky === 'void' || base.sky === 'storm') return { sky: base.sky, ground: base.ground, props: base.props };
  const props = sky === 'night' ? [...base.props.filter((x) => x !== 'sun'), 'stars' as const, 'moon' as const] : base.props;
  return { sky, ground: base.ground, props };
}

export interface LevelGoal {
  /** O que aparece no fim da fase (peça da parashá, placa da trilha ou casa de estudos). */
  model: GoalModel;
  captionPt: string;
  ref: string | null;
}

/** Ponto de chegada: o episódio que fecha a parashá, a bandeira da trilha ou a casa de estudos. */
export function goalOf(nodeId: string): LevelGoal {
  const node = parseNodeId(nodeId);
  if (!node) return { model: { kind: 'flag' }, captionPt: '', ref: null };
  if (node.kind === 'beit-midrash') {
    const w = WORLDS.find((x) => x.id === node.book)!;
    return { model: { kind: 'beitMidrash', style: w.beitMidrash.style }, captionPt: tc(w.beitMidrash.namePt), ref: w.beitMidrash.ref ?? null };
  }
  const p = parashaById(node.parashaId)!;
  if (node.track !== 'torah') {
    return { model: { kind: 'signpost', color: TRACKS[node.track].color }, captionPt: t('Fim do caminho: {track}', { track: tc(TRACKS[node.track].labelPt) }), ref: null };
  }
  return { model: { kind: 'prop', prop: p.goal.prop }, captionPt: tc(p.goal.captionPt), ref: p.goal.ref };
}

/** Títulos em português; traduza com t() ao mostrar. */
export const OUTCOME_COPY: Readonly<Record<AnswerOutcome, { title: string; good: boolean }>> = {
  perfect: { title: msg('Pulo perfeito!'), good: true },
  pass: { title: msg('Passou!'), good: true },
  slow: { title: msg('Passou raspando!'), good: true },
  wrong: { title: msg('Ops! O Golem tropeçou'), good: false },
  timeout: { title: msg('O tempo acabou'), good: false },
  skipped: { title: msg('Pulou com a sacola de livros'), good: true },
};

export interface OpenedSummary {
  tracks: JourneyTrack[];
  nextMain: string | null;
  beitMidrash: TorahBook | null;
}

/** O que abriu no mapa ao concluir uma fase, para a tela de vitória. */
export function summarizeOpened(opened: readonly string[]): OpenedSummary {
  const out: OpenedSummary = { tracks: [], nextMain: null, beitMidrash: null };
  for (const id of opened) {
    const node = parseNodeId(id);
    if (!node) continue;
    if (node.kind === 'beit-midrash') out.beitMidrash = node.book;
    else if (node.track === 'torah') out.nextMain = node.parashaId;
    else out.tracks.push(node.track);
  }
  return out;
}
