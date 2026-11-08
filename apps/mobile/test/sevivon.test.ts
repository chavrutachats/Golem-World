import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FACE_ANGLE,
  FACE_COUNT,
  INNER_RADIUS,
  SEVIVON,
  SPIN_SOUND,
  faceNormal,
  faceUp,
  idlePose,
  orientation,
  planDuration,
  planSpin,
  poseAt,
  restHeight,
  restingPose,
  ticksFrom,
  yawForFace,
} from '../src/lib/sevivon';

const UP = new THREE.Vector3(0, 1, 0);

describe('sevivon', () => {
  it('tem uma face para cada resultado do servidor (6 categorias, Coroa e Prêmio)', () => {
    expect(FACE_COUNT).toBe(8);
  });

  it('cai sempre com a face sorteada para cima, de qualquer giro inicial', () => {
    for (let face = 0; face < FACE_COUNT; face++) {
      for (const start of [0, 1.234, 7.9, -3.3]) {
        for (const jitter of [0, 0.5, 1]) {
          const plan = planSpin(face, start, { jitter });
          expect(plan.endYaw).toBeGreaterThan(start);
          const end = poseAt(plan, planDuration(plan));
          expect(end.tilt).toBeCloseTo(Math.PI / 2, 6);
          expect(faceUp(end.yaw)).toBe(face);
          const n = faceNormal(face, orientation(end));
          expect(n.dot(UP)).toBeGreaterThan(0.999);
        }
      }
    }
  });

  it('com movimento reduzido também acerta a face, mais rápido e sem bambolear', () => {
    const plan = planSpin(5, 0.4, { reducedMotion: true });
    expect(planDuration(plan)).toBeLessThan(1000);
    expect(plan.wobble).toBe(0);
    expect(faceUp(poseAt(plan, planDuration(plan)).yaw)).toBe(5);
  });

  it('gira sempre para o mesmo lado e cada vez mais devagar, sem passar de ~25 rad/s', () => {
    const plan = planSpin(3, 0, { jitter: 1 });
    const rolling = plan.hopMs + plan.spinMs + plan.fallMs;
    let prev = poseAt(plan, 0).yaw;
    let prevSpeed = Infinity;
    for (let ms = 16; ms <= rolling; ms += 16) {
      const yaw = poseAt(plan, ms).yaw;
      const speed = (yaw - prev) / 0.016;
      expect(speed).toBeGreaterThanOrEqual(0);
      expect(speed).toBeLessThan(26);
      expect(speed).toBeLessThanOrEqual(prevSpeed + 1e-6);
      prev = yaw;
      prevSpeed = speed;
    }
  });

  it('bambeia antes de tombar e tomba para o fundo (o cabo longe da câmera)', () => {
    const plan = planSpin(0, 0);
    const late = poseAt(plan, plan.hopMs + plan.spinMs - 1);
    expect(late.tilt).toBeGreaterThan(plan.wobble * 0.9);
    const lying = orientation(poseAt(plan, planDuration(plan)));
    const handle = new THREE.Vector3(0, 1, 0).applyQuaternion(lying);
    expect(handle.z).toBeLessThan(-0.99);
  });

  it('fica apoiado na mesa: em pé pela ponta, deitado sobre uma face', () => {
    const standing = orientation({ yaw: 0.3, tilt: 0, azimuth: 0 });
    expect(restHeight(standing)).toBeCloseTo(SEVIVON.body / 2 + SEVIVON.point, 6);
    for (let face = 0; face < FACE_COUNT; face++) {
      expect(restHeight(orientation(restingPose(face)))).toBeCloseTo(INNER_RADIUS, 6);
    }
  });

  it('o giro até a face é o menor possível mais as voltas', () => {
    const plan = planSpin(2, yawForFace(2));
    expect(plan.endYaw - plan.startYaw).toBeCloseTo(Math.round((plan.endYaw - plan.startYaw) / (2 * Math.PI)) * 2 * Math.PI, 6);
  });

  it('o som acompanha o giro: o arquivo cobre o começo e os tiques assumem enquanto ele some', () => {
    for (const jitter of [0, 0.25, 0.5, 0.75, 1]) {
      const plan = planSpin(3, 0.4, { jitter });
      const from = ticksFrom(plan);
      // Os tiques começam dentro do trecho em que o arquivo está sumindo: sem buraco nem eco.
      expect(from).toBeGreaterThanOrEqual(SPIN_SOUND.fadeFromMs);
      expect(from).toBeLessThanOrEqual(SPIN_SOUND.ms);
      // E muito antes do tombo (o defeito antigo: o som só começava perto da queda).
      expect(from).toBeLessThan(plan.hopMs + plan.spinMs * 0.5);
      // Ali ele ainda passa várias faces por segundo (o tique soa como giro, não como relógio).
      const a = poseAt(plan, from).yaw;
      const b = poseAt(plan, from + 100).yaw;
      expect((b - a) / FACE_ANGLE).toBeGreaterThan(0.6);
    }
    expect(ticksFrom(planSpin(2, 0, { reducedMotion: true }))).toBe(0);
  });

  it('parado, paira girando devagar', () => {
    const a = idlePose(0);
    const b = idlePose(1000);
    expect(a.tilt).toBe(0);
    expect(b.yaw).toBeGreaterThan(a.yaw);
    expect(b.lift).toBeGreaterThan(0.2);
  });
});

describe('Chanucá', () => {
  it('conta as 8 noites a partir das 17h da véspera (24 de Kislev)', async () => {
    const { hanukkahNight } = await import('../src/lib/hanukkah');
    expect(hanukkahNight(new Date(2026, 11, 4, 16, 59))).toBeNull();
    expect(hanukkahNight(new Date(2026, 11, 4, 17, 0))).toBe(1);
    expect(hanukkahNight(new Date(2026, 11, 5, 12, 0))).toBe(1);
    expect(hanukkahNight(new Date(2026, 11, 5, 18, 0))).toBe(2);
    expect(hanukkahNight(new Date(2026, 11, 11, 20, 0))).toBe(8);
    expect(hanukkahNight(new Date(2026, 11, 12, 17, 1))).toBeNull();
    expect(hanukkahNight(new Date(2025, 11, 14, 19, 0))).toBe(1);
    expect(hanukkahNight(new Date(2026, 10, 3, 12, 0))).toBeNull();
  });
});
