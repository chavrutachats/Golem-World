/**
 * Movimento do sevivon (lógica pura, testável). O servidor sorteia a face; o app só
 * calcula um giro que termina com ela virada para cima.
 *
 * Eixos do three.js: Y para cima, câmera em +Z olhando o centro.
 * - O eixo do sevivon é o Y local. A face k tem a normal em (sen φk, 0, cos φk), φk = k·45°.
 * - A pose é Q = Inclinação(θ, β) · Giro(ψ): primeiro o giro em torno do próprio eixo (ψ),
 *   depois a inclinação θ em torno do eixo horizontal (cos β, 0, sen β). Com β = 0, o cabo
 *   tomba para longe da câmera (−Z).
 * - Caído (θ = 90°, β = 0), a face k fica para cima quando ψ ≡ −φk; o cabo aponta para o
 *   fundo, então a palavra da face aparece de pé para quem olha de cima.
 *
 * Etapas do giro: cai da mão na mesa (hop) e gira em pé bambeando cada vez mais (spin),
 * tomba (fall) e balança um pouco deitado até parar (settle).
 */
import { WHEEL_SLICES } from '@trivia/shared';
import * as THREE from 'three';

export const FACE_COUNT = WHEEL_SLICES.length;
export const FACE_ANGLE = (2 * Math.PI) / FACE_COUNT;
const TAU = Math.PI * 2;

/** Medidas do corpo (unidades do mundo), usadas pelo modelo 3D e pela conta do chão. */
export const SEVIVON = {
  /** Raio até as quinas do octógono. */
  radius: 0.7,
  /** Altura do corpo (as faces). */
  body: 0.82,
  /** Comprimento da ponta de baixo. */
  point: 0.5,
  /** Ombro em cima do corpo, até o cabo. */
  shoulder: 0.12,
  /** Cabo. */
  handle: 0.42,
  handleRadius: 0.075,
  knobRadius: 0.11,
} as const;

/** Raio até o meio das faces (o octógono "deitado" fica a esta altura do chão). */
export const INNER_RADIUS = SEVIVON.radius * Math.cos(Math.PI / FACE_COUNT);
/** Altura extra quando está pairando (antes de girar). */
export const HOVER = 0.32;

export function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** Giro (ψ) que deixa a face k para cima depois de tombar. */
export function yawForFace(face: number): number {
  return mod(-face * FACE_ANGLE, TAU);
}

/** Qual face fica para cima com o sevivon deitado (θ = 90°, β = 0) e girado em ψ. */
export function faceUp(yaw: number): number {
  return mod(Math.round(-yaw / FACE_ANGLE), FACE_COUNT);
}

export interface SpinPlan {
  face: number;
  startYaw: number;
  /** ψ final: startYaw + voltas, ≡ yawForFace(face). */
  endYaw: number;
  hopMs: number;
  spinMs: number;
  fallMs: number;
  settleMs: number;
  /** Inclinação máxima do bamboleio antes de tombar (rad). */
  wobble: number;
  /** Voltas da precessão (o eixo descrevendo um cone) até tombar. */
  precession: number;
}

export interface PlanOptions {
  reducedMotion?: boolean;
  /** 0..1: varia as voltas e o tempo, para dois giros não serem idênticos. */
  jitter?: number;
}

export function planSpin(face: number, startYaw: number, { reducedMotion = false, jitter = 0.5 }: PlanOptions = {}): SpinPlan {
  const target = yawForFace(face);
  const turns = reducedMotion ? 1 : 3 + Math.round(jitter * 2);
  // Gira no sentido positivo: do ψ atual até o próximo ψ equivalente ao alvo, mais as voltas.
  const endYaw = startYaw + mod(target - startYaw, TAU) + turns * TAU;
  return reducedMotion
    ? { face, startYaw, endYaw, hopMs: 0, spinMs: 450, fallMs: 300, settleMs: 150, wobble: 0, precession: 0 }
    : {
        face,
        startYaw,
        endYaw,
        hopMs: 260,
        spinMs: 2300 + Math.round(jitter * 500),
        fallMs: 520,
        settleMs: 620,
        wobble: (13 * Math.PI) / 180,
        precession: 2,
      };
}

/**
 * Som do giro. O arquivo "spin" (scripts/make-sounds.py) começa junto com o toque no botão:
 * a ponta bate na mesa aos 260 ms e ele zune com um estalo por face, sumindo entre
 * SPIN_SOUND.fadeFromMs e SPIN_SOUND.ms. Daí em diante, quem toca é a tela: um tique a
 * cada face que passa na frente, contado na própria animação.
 */
export const SPIN_SOUND = { ms: 1450, fadeFromMs: 1130 } as const;

/** A partir de quando a tela toca um tique por face (antes disso, o arquivo cobre). */
export function ticksFrom(plan: SpinPlan): number {
  return plan.hopMs === 0 ? 0 : plan.hopMs + plan.spinMs * 0.4;
}

export function planDuration(plan: SpinPlan): number {
  return plan.hopMs + plan.spinMs + plan.fallMs + plan.settleMs;
}

export interface Pose {
  /** ψ: giro em torno do próprio eixo. */
  yaw: number;
  /** θ: inclinação do eixo (0 em pé, π/2 deitado). */
  tilt: number;
  /** β: para que lado o eixo inclina. */
  azimuth: number;
  /** Altura extra (pairando ou quicando na mesa). */
  lift: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A pose em `ms` desde o início do giro. O giro (ψ) desacelera desde o primeiro instante
 * (velocidade ∝ (1 − u)^1,6, abaixo de ~25 rad/s para as 8 faces não "congelarem" na tela
 * a 60 quadros por segundo) e termina exatamente em endYaw quando ele encosta deitado;
 * depois ainda balança um pouco em torno da face de baixo.
 */
export function poseAt(plan: SpinPlan, ms: number): Pose {
  const { hopMs, spinMs, fallMs, settleMs } = plan;
  const rolling = spinMs + fallMs;
  const t = ms - hopMs;
  // Altura: cai da mão (HOVER → 0) com um quique pequeno.
  let lift = 0;
  if (ms < hopMs) {
    const u = ms / hopMs;
    lift = HOVER * (1 - u * u);
  } else if (t < 220 && hopMs > 0) {
    lift = 0.05 * Math.sin((t / 220) * Math.PI);
  }
  // O giro começa já na mão (durante a queda na mesa) e desacelera até encostar deitado.
  const p = 1.6;
  const span = plan.endYaw - plan.startYaw;
  const ur = Math.min(1, ms / (hopMs + rolling));
  let yaw = plan.startYaw + span * (1 - Math.pow(1 - ur, p + 1));
  if (t <= 0) return { yaw, tilt: 0, azimuth: 0, lift };

  let tilt: number;
  let azimuth: number;
  if (t < spinMs) {
    const u = t / spinMs;
    tilt = plan.wobble * Math.pow(smooth(0.25, 1, u), 1.4);
    // O cone da precessão acelera e termina inclinando para o fundo (β ≡ 0).
    azimuth = TAU * plan.precession * u * u;
  } else if (t < rolling) {
    const u = (t - spinMs) / fallMs;
    tilt = plan.wobble + (Math.PI / 2 - plan.wobble) * u * u;
    azimuth = 0;
  } else {
    // Deitado: balança em torno da face de baixo e para.
    const u = Math.min(1, (t - rolling) / Math.max(1, settleMs));
    yaw = plan.endYaw + 0.16 * Math.exp(-4.5 * u) * Math.sin(u * Math.PI * 3.2) * (settleMs > 200 ? 1 : 0);
    tilt = Math.PI / 2;
    azimuth = 0;
    lift = 0.04 * Math.exp(-6 * u) * Math.abs(Math.sin(u * Math.PI * 2.4)) * (settleMs > 200 ? 1 : 0);
  }
  return { yaw, tilt, azimuth, lift };
}

const Y = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();
const qTilt = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();

/** Orientação do sevivon para uma pose (escreve em `out`). */
export function orientation(pose: Pick<Pose, 'yaw' | 'tilt' | 'azimuth'>, out = new THREE.Quaternion()): THREE.Quaternion {
  axis.set(Math.cos(pose.azimuth), 0, Math.sin(pose.azimuth));
  qTilt.setFromAxisAngle(axis, -pose.tilt);
  qYaw.setFromAxisAngle(Y, pose.yaw);
  return out.copy(qTilt).multiply(qYaw);
}

/** Pontos do contorno do sevivon (no espaço dele) que podem encostar na mesa. */
const HULL: readonly THREE.Vector3[] = (() => {
  const { radius, body, point, shoulder, handle, handleRadius } = SEVIVON;
  const pts = [new THREE.Vector3(0, -body / 2 - point, 0)];
  for (let i = 0; i < FACE_COUNT; i++) {
    const a = (i + 0.5) * FACE_ANGLE;
    pts.push(new THREE.Vector3(radius * Math.sin(a), body / 2, radius * Math.cos(a)));
    pts.push(new THREE.Vector3(radius * Math.sin(a), -body / 2, radius * Math.cos(a)));
    pts.push(new THREE.Vector3(handleRadius * Math.sin(a), body / 2 + shoulder + handle, handleRadius * Math.cos(a)));
  }
  return pts;
})();
const probe = new THREE.Vector3();

/** Quanto subir o centro do corpo para o ponto mais baixo ficar na mesa (y = 0). */
export function restHeight(q: THREE.Quaternion): number {
  let min = Infinity;
  for (const p of HULL) min = Math.min(min, probe.copy(p).applyQuaternion(q).y);
  return -min;
}

/** Direção (no mundo) da normal da face k para uma orientação. */
export function faceNormal(face: number, q: THREE.Quaternion, out = new THREE.Vector3()): THREE.Vector3 {
  const a = face * FACE_ANGLE;
  return out.set(Math.sin(a), 0, Math.cos(a)).applyQuaternion(q);
}

/** Pose parada, pairando de pé (antes de girar): gira devagar mostrando as faces. */
export function idlePose(ms: number, startYaw = 0): Pose {
  return { yaw: startYaw + ms * 0.0006, tilt: 0, azimuth: 0, lift: HOVER + 0.03 * Math.sin(ms * 0.0021) };
}

/** Pose deitada com a face k para cima (ao reabrir uma partida já girada). */
export function restingPose(face: number): Pose {
  return { yaw: yawForFace(face), tilt: Math.PI / 2, azimuth: 0, lift: 0 };
}
