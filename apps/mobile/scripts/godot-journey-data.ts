/**
 * Gera apps/godot/data/journey.json (Fase 15): os dados do Golem World para o cliente Godot,
 * tirados do mesmo código do app, para o mapa ficar idêntico.
 * - mundos (nomes nos 3 idiomas, terreno, casa de estudo), parashiot e trilhas de estudo;
 * - o desenho de cada ilha (layoutWorld3D: fases, pedrinhas, cenas e enfeites);
 * - as cores dos terrenos e os tamanhos dos enfeites.
 *
 * Uso: pnpm --filter @trivia/mobile godot-journey-data
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogText, ITEM_SLOT_LABELS_PT, ITEMS, parashaName, parashotOfBook, shortRef, TRACKS, WORLDS, type Locale } from '@trivia/shared';
import { layoutWorld3D, MAP_TOP_PAD, MAP_UNIT, MAP_TILT } from '../src/three/map';

const LOCALES: Locale[] = ['pt', 'en', 'he'];
const tr = (pt: string) => Object.fromEntries(LOCALES.map((l) => [l, catalogText(pt, l)]));
const refs = (ref: string) => Object.fromEntries(LOCALES.map((l) => [l, shortRef(ref, l)]));

const worlds = WORLDS.map((w) => ({
  id: w.id,
  number: w.number,
  name: tr(w.namePt),
  nameHe: w.nameHe,
  terrain: w.terrain,
  beitMidrash: {
    name: tr(w.beitMidrash.namePt),
    subtitle: tr(w.beitMidrash.subtitlePt),
    style: w.beitMidrash.style,
    ref: w.beitMidrash.ref ?? null,
    reward: (() => {
      const item = ITEMS.find((i) => i.unlock.kind === 'beitMidrash' && i.unlock.book === w.id);
      return item ? tr(item.namePt) : null;
    })(),
  },
  parashot: parashotOfBook(w.id).map((p) => ({
    id: p.id,
    number: p.number,
    name: Object.fromEntries(LOCALES.map((l) => [l, parashaName(p, l)])),
    nameHe: p.nameHe,
    meaning: tr(p.meaningPt),
    ref: p.ref,
    shortRef: refs(p.ref),
    events: p.events.map((e) => ({ obstacle: e.obstacle, caption: tr(e.captionPt), ref: refs(e.ref) })),
    goal: { prop: p.goal.prop, caption: tr(p.goal.captionPt), ref: refs(p.goal.ref) },
    scene: {
      sky: p.scene.sky,
      ground: p.scene.ground,
      props: p.scene.props,
      caption: p.scene.captionPt ? tr(p.scene.captionPt) : null,
      stages: (p.scene.stages ?? []).map((st) => ({ sky: st.sky, ground: st.ground, props: st.props, caption: st.captionPt ? tr(st.captionPt) : null })),
    },
  })),
  layout: layoutWorld3D(w.id),
}));
const tracks = Object.values(TRACKS).map((t) => ({
  id: t.id,
  label: tr(t.labelPt),
  labelHe: t.labelHe,
  description: tr(t.descriptionPt),
  sources: tr(t.sourcesPt),
  color: t.color,
}));
const items = ITEMS.map((i) => ({
  id: i.id,
  slot: i.slot,
  name: tr(i.namePt),
  perk: i.perkPt ? tr(i.perkPt) : null,
  flavor: tr(i.flavorPt),
  clay: i.clay ?? null,
  unlock: i.unlock.kind,
  ref: i.ref ? refs(i.ref) : null,
}));
const slots = Object.fromEntries(Object.entries(ITEM_SLOT_LABELS_PT).map(([k, v]) => [k, tr(v)]));
const out = {
  items,
  slots,
  map: { unit: MAP_UNIT, tilt: MAP_TILT, topPad: MAP_TOP_PAD, worldGap: 24, prologue: 100 },
  terrain: {
    garden: { land: '#7CCB5E', edge: '#F2E2A8', cliff: '#8A5E3C' },
    egypt: { land: '#EBC27E', edge: '#F7E3B0', cliff: '#B98C55' },
    camp: { land: '#93D163', edge: '#F2E2A8', cliff: '#8A5E3C' },
    desert: { land: '#EFB878', edge: '#F7E3B0', cliff: '#B5814E' },
    plains: { land: '#8BCF5A', edge: '#F2E2A8', cliff: '#7E5634' },
  },
  footprint: { tree: 12, cypress: 7, palm: 11, bush: 9, rock: 8, dune: 16, hill: 22, mountain: 30, pyramid: 18, tent: 12, flower: 4, reeds: 6 },
  decorScale: { hill: 0.5, dune: 0.55, pyramid: 0.45, mountain: 0.4, tent: 0.6 },
  worlds,
  tracks,
};
const file = fileURLToPath(new URL('../../godot/data/journey.json', import.meta.url));
writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`${worlds.length} mundos, ${worlds.reduce((n, w) => n + w.parashot.length, 0)} parashiot em ${file}`);
