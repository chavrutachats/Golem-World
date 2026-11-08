/** Palco 3D no celular: expo-gl (vem no Expo Go e nos builds). */
import { Canvas } from '@react-three/fiber/native';
import { makeStage3D } from './Stage3DBase';

export const Stage3D = makeStage3D(Canvas as never, () => true);
export type { Stage3DProps } from './Stage3DBase';
