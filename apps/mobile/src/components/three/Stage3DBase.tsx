/**
 * Palco das cenas 3D: o Canvas do react-three-fiber com as mesmas regras em todo
 * lugar (cores, sombras macias, densidade de pixels limitada para poupar bateria).
 * As versões web e celular só trocam de onde vem o Canvas (Stage3D.tsx /
 * Stage3D.native.tsx).
 *
 * A cena é decorativa para leitores de tela: o que importa nela (obstáculo, fase)
 * também está escrito na tela.
 */
import type { Canvas as WebCanvas } from '@react-three/fiber';
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type * as THREE from 'three';
import { configureRenderer } from '@/three/lighting';

export interface Stage3DProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Câmera em perspectiva: campo de visão, posição e para onde olha. */
  camera: { fov?: number; position: readonly [number, number, number]; lookAt?: readonly [number, number, number]; zoom?: number };
  orthographic?: boolean;
  shadows?: boolean;
  /** 'demand' para cenas paradas (movimento reduzido): só desenha quando algo muda. */
  frameloop?: 'always' | 'demand';
  /** O que mostrar se o aparelho não tiver WebGL (ou a cena falhar). */
  fallback?: ReactNode;
  testID?: string;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Cena 3D desligada:', error.message, info.componentStack?.split('\n')[1]?.trim());
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function makeStage3D(Canvas: ComponentType<React.ComponentProps<typeof WebCanvas>>, supported: () => boolean) {
  return function Stage3D({ children, style, camera, orthographic, shadows = true, frameloop = 'always', fallback = null, testID }: Stage3DProps) {
    const ok = supported();
    return (
      <View style={[styles.wrap, style]} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {ok ? (
          <SceneBoundary fallback={fallback}>
            <Canvas
              shadows={shadows ? 'percentage' : false}
              frameloop={frameloop}
              orthographic={orthographic}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
              camera={{ fov: camera.fov ?? 35, position: [...camera.position], near: 0.1, far: 200, ...(camera.zoom ? { zoom: camera.zoom } : {}) }}
              onCreated={({ gl, camera: cam }) => {
                configureRenderer(gl as THREE.WebGLRenderer, shadows);
                const target = camera.lookAt ?? [0, 0, 0];
                cam.lookAt(target[0], target[1], target[2]);
              }}
              style={StyleSheet.absoluteFill as never}
            >
              {children}
            </Canvas>
          </SceneBoundary>
        ) : (
          fallback
        )}
      </View>
    );
  };
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
