/**
 * Luz das cenas: céu suave (hemisfério) + um sol quente que projeta sombra macia.
 * O mesmo conjunto serve ao mapa, às fases e à vitrine do armário, com o tom de
 * cada momento (dia, entardecer, noite, ouro do Mishkan).
 */
import * as THREE from 'three';

export type LightMood = 'day' | 'dawn' | 'dusk' | 'night' | 'gold' | 'storm' | 'void' | 'indoor';

const MOODS: Readonly<Record<LightMood, { sky: string; ground: string; hemi: number; sun: string; sunI: number }>> = {
  day: { sky: '#DCEBFF', ground: '#8E7A5C', hemi: 1.9, sun: '#FFF1D6', sunI: 2.6 },
  dawn: { sky: '#FFE1C8', ground: '#7E6650', hemi: 1.7, sun: '#FFC58A', sunI: 2.3 },
  dusk: { sky: '#FFC9A8', ground: '#5E4A52', hemi: 1.5, sun: '#FF9E66', sunI: 2.1 },
  night: { sky: '#8FA2FF', ground: '#2A2440', hemi: 1.0, sun: '#C9D6FF', sunI: 1.3 },
  gold: { sky: '#FFF0C2', ground: '#9A7A3A', hemi: 1.8, sun: '#FFE09A', sunI: 2.5 },
  storm: { sky: '#AAB6C8', ground: '#4C5560', hemi: 1.4, sun: '#DCE6F2', sunI: 1.4 },
  void: { sky: '#6A6F9A', ground: '#1A1A2E', hemi: 0.9, sun: '#B9C2FF', sunI: 1.0 },
  indoor: { sky: '#FFF6E6', ground: '#8C6A4A', hemi: 2.0, sun: '#FFE8C4', sunI: 2.0 },
};

export interface LightRig {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

export function buildLights(mood: LightMood = 'day', { shadowSize = 12, shadows = true }: { shadowSize?: number; shadows?: boolean } = {}): LightRig {
  const m = MOODS[mood];
  const hemi = new THREE.HemisphereLight(m.sky, m.ground, m.hemi);
  const sun = new THREE.DirectionalLight(m.sun, m.sunI);
  sun.position.set(4, 8, 6);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    const s = shadowSize / 2;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 40 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
  }
  const group = new THREE.Group();
  group.add(hemi, sun, sun.target);
  return { group, sun, hemi };
}

export function setMood(rig: LightRig, mood: LightMood): void {
  const m = MOODS[mood];
  rig.hemi.color.set(m.sky);
  rig.hemi.groundColor.set(m.ground);
  rig.hemi.intensity = m.hemi;
  rig.sun.color.set(m.sun);
  rig.sun.intensity = m.sunI;
}

/** Ajustes do renderizador iguais em todo lugar (cor e sombras filtradas). */
export function configureRenderer(renderer: THREE.WebGLRenderer, shadows = true): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
