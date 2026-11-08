/**
 * A fase em 3D: cenário da parashá, o obstáculo da vez, a chegada e o Golem. Quem
 * anima é a tela da fase, pelo diretor (canais numéricos com tempo); a cena só lê os
 * canais a cada quadro, sem renderizar o React de novo.
 */
import { useFrame, useThree } from '@react-three/fiber';
import type { GolemLook, ObstacleId, SceneStage } from '@trivia/shared';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as THREE from 'three';
import { GameText } from '@/components/game/GameText';
import { GolemModel } from '@/components/three/GolemModel';
import { Stage3D } from '@/components/three/Stage3D';
import type { SceneDirector } from '@/three/director';
import type { GolemPose } from '@/three/golem';
import { buildLevelEnvironment, LEVEL } from '@/three/level';
import { buildLights } from '@/three/lighting';
import { buildGoal, buildObstacle, type GoalModel } from '@/three/story';

export type LevelChannel = 'scroll' | 'obstacleX' | 'goalX' | 'golemY' | 'golemDX' | 'blink';

export const LEVEL_CHANNELS: Readonly<Record<LevelChannel, number>> = {
  scroll: 0,
  obstacleX: LEVEL.spawnX,
  goalX: LEVEL.spawnX,
  golemY: 0,
  golemDX: 0,
  blink: 0,
};

/** Altura da cena em relação à largura. */
export const LEVEL_ASPECT = 0.66;

interface WorldProps {
  stage: SceneStage;
  seed: string;
  obstacle: ObstacleId | null;
  goal: GoalModel | null;
  look: GolemLook | undefined;
  pose: GolemPose;
  director: SceneDirector<LevelChannel>;
  still: boolean;
}

function Environment({ stage, seed, director }: { stage: SceneStage; seed: string; director: SceneDirector<LevelChannel> }) {
  const scene = useThree((s) => s.scene);
  const env = useMemo(() => buildLevelEnvironment(stage, seed), [stage, seed]);
  const lights = useMemo(() => buildLights(env.mood, { shadowSize: 14 }), [env]);
  useEffect(() => {
    scene.fog = env.fog;
    scene.background = env.background;
    return () => {
      scene.fog = null;
    };
  }, [env, scene]);
  useFrame(({ clock }) => env.update(director.get('scroll'), clock.elapsedTime));
  return (
    <>
      <primitive object={env.root} />
      <primitive object={lights.group} />
    </>
  );
}

function Mover({ object, channel, director, z = 0 }: { object: THREE.Object3D; channel: LevelChannel; director: SceneDirector<LevelChannel>; z?: number }) {
  useFrame(() => {
    object.position.set(director.get(channel), 0, z);
  });
  return <primitive object={object} />;
}

/** No pulo, a câmera sobe um pouco com o Golem, para a cabeça não sair do quadro. */
function CameraFollow({ director }: { director: SceneDirector<LevelChannel> }) {
  const camera = useThree((s) => s.camera);
  const [cx, cy, cz] = LEVEL.camera.position;
  const [lx, ly, lz] = LEVEL.camera.lookAt;
  useFrame(() => {
    const lift = director.get('golemY') * 0.4;
    camera.position.set(cx, cy + lift, cz);
    camera.lookAt(lx, ly + lift, lz);
  });
  return null;
}

function World({ stage, seed, obstacle, goal, look, pose, director, still }: WorldProps) {
  const obstacleObj = useMemo(() => (obstacle ? buildObstacle(obstacle) : null), [obstacle]);
  const goalObj = useMemo(() => {
    if (!goal) return null;
    const g = buildGoal(goal);
    if (goal.kind === 'beitMidrash') g.scale.setScalar(0.8);
    return g;
  }, [goal]);
  useFrame(({ clock }) => director.update(clock.elapsedTime * 1000));
  return (
    <>
      <CameraFollow director={director} />
      <Environment stage={stage} seed={seed} director={director} />
      {goalObj ? <Mover object={goalObj} channel="goalX" director={director} z={-1.4} /> : null}
      {obstacleObj ? <Mover object={obstacleObj} channel="obstacleX" director={director} /> : null}
      <GolemModel
        look={look}
        pose={pose}
        still={still}
        rotationY={0.55}
        onFrame={(_, root) => {
          root.position.set(LEVEL.golemX + director.get('golemDX'), director.get('golemY'), 0);
          root.visible = director.get('blink') < 0.5;
        }}
      />
    </>
  );
}

export interface LevelScene3DProps extends WorldProps {
  width: number;
  caption: string | null;
  /** Cenário escuro (noite, trevas): legenda clara. */
  dark?: boolean;
}

export const LevelScene3D = memo(function LevelScene3D({ width, caption, dark, ...world }: LevelScene3DProps) {
  const height = Math.round(width * LEVEL_ASPECT);
  return (
    <View style={{ width, height }}>
      <Stage3D style={StyleSheet.absoluteFill} camera={{ fov: LEVEL.camera.fov, position: LEVEL.camera.position, lookAt: LEVEL.camera.lookAt }} testID="level-scene">
        <World {...world} />
      </Stage3D>
      {caption ? (
        <Animated.View key={caption} entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[styles.caption, dark ? styles.captionDark : styles.captionLight]} pointerEvents="none">
          <GameText size="sm" weight="semibold" align="center" color={dark ? '#1B1E3D' : '#FFFFFF'}>
            {caption}
          </GameText>
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  caption: { position: 'absolute', top: 10, left: 14, right: 14, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 },
  captionLight: { backgroundColor: 'rgba(20,24,60,0.55)' },
  captionDark: { backgroundColor: 'rgba(255,255,255,0.85)' },
});
