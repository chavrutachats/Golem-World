/**
 * O sevivon dos temas (Fase 12), no lugar da roleta: 8 faces (as 6 categorias, a Coroa e
 * o Prêmio). Parado, ele paira de pé girando devagar, mostrando as faces. Ao girar, cai na
 * mesa rodando, bambeia cada vez mais, tomba e balança até parar com a face sorteada para
 * cima; a câmera chega perto dela e a face brilha.
 *
 * O resultado vem sempre do servidor: a tela chama `spinTo(sliceIndex)` com o índice da
 * API e o sevivon só anima até lá (contas em lib/sevivon.ts). Sem WebGL, a mesma alça
 * comanda a roleta 2D de 8 fatias.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as THREE from 'three';
import { Stage3D } from '@/components/three/Stage3D';
import { Wheel, type WheelHandle } from '@/components/Wheel';
import { haptic } from '@/lib/feedback';
import { t, tc } from '@/lib/i18n';
import { FACE_ANGLE, FACE_COUNT, INNER_RADIUS, idlePose, orientation, planDuration, planSpin, poseAt, restHeight, restingPose, ticksFrom, type Pose, type SpinPlan } from '@/lib/sevivon';
import { play } from '@/lib/sound';
import { buildLights } from '@/three/lighting';
import { buildChanukiah, buildSevivon, buildTable } from '@/three/sevivon';
import { brand, WHEEL_STYLE } from '@/theme/tokens';

export interface SevivonHandle {
  /** Gira até cair com a face `index` (posição em WHEEL_SLICES) para cima; resolve quando para. */
  spinTo(index: number): Promise<void>;
  /** Deitado com a face para cima, sem animação (ex.: ao reabrir uma partida já girada). */
  jumpTo(index: number): void;
  /** Volta a pairar de pé, pronto para o próximo giro. */
  rest(): void;
}

type Mode = { kind: 'idle'; since: number; yaw: number } | { kind: 'spin'; plan: SpinPlan; since: number; done: () => void } | { kind: 'landed'; face: number; since: number };

interface Controller {
  mode: Mode;
  /** A cena 3D já desenhou: os comandos vão para ela (senão, para a roleta 2D). */
  alive: boolean;
  reducedMotion: boolean;
}

// De frente, um pouco de cima: a mesa inteira (com o fundo em volta) e o sevivon pairando.
const CAM_IDLE = { pos: new THREE.Vector3(0, 2.45, 5.9), look: new THREE.Vector3(0, 0.82, 0) };
// Perto e por cima da face que ficou para cima (o centro dela fica a 2 × INNER_RADIUS do chão).
const CAM_FACE = { pos: new THREE.Vector3(0, 3.15, 1.75), look: new THREE.Vector3(0, INNER_RADIUS * 2 - 0.1, -0.15) };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function Scene({ ctl, hanukkah }: { ctl: React.RefObject<Controller>; hanukkah: number | null }) {
  const rig = useMemo(() => buildSevivon(), []);
  const table = useMemo(() => buildTable(), []);
  const chanukiah = useMemo(() => (hanukkah ? buildChanukiah(hanukkah) : null), [hanukkah]);
  const lights = useMemo(() => {
    const l = buildLights('indoor', { shadowSize: 5 });
    l.sun.position.set(2.5, 6, 3.5);
    // Ambiente mais baixo: quem ilumina é a luz quente de cima, numa poça sobre o feltro.
    l.hemi.intensity = 0.4;
    l.sun.intensity = 0.55;
    // Cone estreito: a luz cai no meio do feltro e esmaece antes da borda de madeira.
    const spot = new THREE.SpotLight('#FFE1AE', 150, 11, 0.19, 0.9, 1.2);
    spot.position.set(0.3, 6.4, 2.4);
    spot.target.position.set(0, 0.3, 0);
    // Contraluz de tekhelet: o contorno do sevivon não some no fundo escuro.
    const rim = new THREE.DirectionalLight('#8E9BFF', 1.8);
    rim.position.set(-3, 3.5, -4.5);
    l.group.add(spot, spot.target, rim);
    return l.group;
  }, []);
  const camera = useThree((s) => s.camera);
  const q = useRef(new THREE.Quaternion());
  const look = useRef(CAM_IDLE.look.clone());
  const lastFace = useRef(-1);
  const landedAt = useRef(0);
  const zoom = useRef(0);

  useFrame((_, dt) => {
    const c = ctl.current;
    c.alive = true;
    const t = now();
    const mode = c.mode;
    let pose: Pose;
    // Para onde a câmera vai: 0 = de frente para a mesa, 1 = perto da face de cima.
    let toFace = 0;
    if (mode.kind === 'idle') {
      pose = idlePose(c.reducedMotion ? 0 : t - mode.since, mode.yaw);
    } else if (mode.kind === 'spin') {
      const elapsed = t - mode.since;
      const total = planDuration(mode.plan);
      pose = poseAt(mode.plan, Math.min(elapsed, total));
      // O começo do giro toca no arquivo "spin" (disparado no toque). Quando ele some, um
      // tique a cada face que passa na frente, mais forte conforme ele bambeia.
      const face = Math.floor((pose.yaw + FACE_ANGLE / 2) / FACE_ANGLE);
      const fallEnd = mode.plan.hopMs + mode.plan.spinMs + mode.plan.fallMs;
      if (face !== lastFace.current) {
        if (elapsed >= ticksFrom(mode.plan) && elapsed < fallEnd) {
          const sway = mode.plan.wobble > 0 ? Math.min(1, pose.tilt / mode.plan.wobble) : 0;
          play('tick', 0.26 + 0.2 * sway);
        }
        lastFace.current = face;
      }
      if (elapsed >= fallEnd && landedAt.current < mode.since) {
        landedAt.current = t;
        haptic.land();
        play('topple', 0.85);
      }
      toFace = elapsed > fallEnd - 150 ? 1 : 0;
      if (elapsed >= total) {
        const done = mode.done;
        c.mode = { kind: 'landed', face: mode.plan.face, since: t };
        done();
      }
    } else {
      pose = restingPose(mode.face);
      toFace = 1;
    }
    orientation(pose, q.current);
    rig.root.quaternion.copy(q.current);
    rig.root.position.set(0, restHeight(q.current) + pose.lift, 0);

    // A face sorteada brilha (pulsando de leve) enquanto o sevivon está deitado nela.
    const lit = c.mode.kind === 'landed' ? c.mode.face : -1;
    rig.panels.forEach((m, i) => {
      m.emissiveIntensity = i === lit ? 0.35 + 0.2 * Math.sin((t - (c.mode.kind === 'landed' ? c.mode.since : 0)) / 160) : 0.08;
    });

    // Câmera: de frente para a mesa; perto da face de cima quando ele para (suave nos dois sentidos).
    zoom.current = c.reducedMotion ? toFace : zoom.current + (toFace - zoom.current) * Math.min(1, dt * 4.5);
    const k = zoom.current * zoom.current * (3 - 2 * zoom.current);
    camera.position.lerpVectors(CAM_IDLE.pos, CAM_FACE.pos, k);
    look.current.lerpVectors(CAM_IDLE.look, CAM_FACE.look, k);
    camera.lookAt(look.current);
  });

  return (
    <>
      <color attach="background" args={[brand.velvetDeep]} />
      <primitive object={lights} />
      <primitive object={table} />
      {chanukiah ? <primitive object={chanukiah} position={[0, 0, -1.55]} scale={0.95} /> : null}
      <primitive object={rig.root} />
    </>
  );
}

export interface SevivonProps {
  size: number;
  ref?: Ref<SevivonHandle>;
  /** Noite de Chanucá (1 a 8): a chanukiá aparece acesa atrás do sevivon. */
  hanukkah?: number | null;
  /** Fora de foco (a pergunta aberta por cima), a cena para de desenhar e poupa bateria. */
  active?: boolean;
}

export function Sevivon({ size, ref, hanukkah = null, active = true }: SevivonProps) {
  const reducedMotion = useReducedMotion();
  const wheel = useRef<WheelHandle>(null);
  const ctl = useRef<Controller>({ mode: { kind: 'idle', since: now(), yaw: 0 }, alive: false, reducedMotion });
  ctl.current.reducedMotion = reducedMotion;

  useImperativeHandle(
    ref,
    () => ({
      spinTo(index: number) {
        const c = ctl.current;
        if (!c.alive) return wheel.current?.spinTo(index) ?? Promise.resolve();
        // Gira a partir do ψ em que estava (pairando ou deitado).
        const from = c.mode.kind === 'idle' ? idlePose(now() - c.mode.since, c.mode.yaw).yaw : c.mode.kind === 'landed' ? restingPose(c.mode.face).yaw : 0;
        const plan = planSpin(index, from, { reducedMotion, jitter: Math.random() });
        haptic.tap();
        // O som sai junto com a animação: a ponta bate na mesa aos hopMs, como no arquivo.
        if (!reducedMotion) play('spin', 0.9);
        return new Promise<void>((resolve) => {
          c.mode = { kind: 'spin', plan, since: now(), done: resolve };
        });
      },
      jumpTo(index: number) {
        ctl.current.mode = { kind: 'landed', face: index, since: now() };
        wheel.current?.jumpTo(index);
      },
      rest() {
        const c = ctl.current;
        const yaw = c.mode.kind === 'landed' ? restingPose(c.mode.face).yaw : 0;
        c.mode = { kind: 'idle', since: now(), yaw };
      },
    }),
    [reducedMotion],
  );

  const faces = WHEEL_STYLE.map((st) => tc(st.labelPt)).join(', ');
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={t('Sevivon com {n} faces: {faces}', { n: FACE_COUNT, faces })} testID="sevivon">
      <Stage3D
        style={{ width: size, height: size }}
        camera={{ fov: 32, position: [CAM_IDLE.pos.x, CAM_IDLE.pos.y, CAM_IDLE.pos.z], lookAt: [CAM_IDLE.look.x, CAM_IDLE.look.y, CAM_IDLE.look.z] }}
        frameloop={active ? 'always' : 'demand'}
        fallback={<Wheel ref={wheel} size={size * 0.86} />}
        testID="sevivon-3d"
      >
        <Scene ctl={ctl} hanukkah={hanukkah} />
      </Stage3D>
    </View>
  );
}
