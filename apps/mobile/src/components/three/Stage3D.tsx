/** Palco 3D na web: WebGL do navegador. */
import { Canvas } from '@react-three/fiber';
import { makeStage3D } from './Stage3DBase';

let webgl: boolean | null = null;

function supported(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    webgl = !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

export const Stage3D = makeStage3D(Canvas, supported);
export type { Stage3DProps } from './Stage3DBase';
