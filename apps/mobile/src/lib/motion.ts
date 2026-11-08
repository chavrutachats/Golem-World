/**
 * Vocabulário de movimento do jogo: as mesmas molas em todo lugar, para o app ter
 * um "jeito" só de quicar. Com "reduzir movimento" ligado no aparelho, os efeitos
 * decorativos (confete, tremida, raios) não aparecem; as mudanças de estado continuam.
 */
import type { WithSpringConfig } from 'react-native-reanimated';

export const springs = {
  /** Toque em botão/peça: afunda e volta rápido. */
  press: { damping: 15, stiffness: 420, mass: 0.6 } satisfies WithSpringConfig,
  /** Algo que chega na tela com alegria (peças, selos, coroas). */
  pop: { damping: 11, stiffness: 220, mass: 0.8 } satisfies WithSpringConfig,
  /** Painéis grandes subindo (resultado). */
  panel: { damping: 18, stiffness: 160, mass: 1 } satisfies WithSpringConfig,
} as const;

/** Atraso entre peças que entram em sequência (alternativas, cartões). */
export const STAGGER_MS = 70;

/** Altura do "rebordo" das peças 3D (botões, alternativas). */
export const LIP = 3;
