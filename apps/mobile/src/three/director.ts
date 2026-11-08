/**
 * Diretor das animações das cenas 3D: canais numéricos (posição do obstáculo,
 * altura do pulo, rolagem do chão…) que andam por tempo, com curvas de suavização.
 *
 * A tela da fase pede "leve o obstáculo até x em 1,1 s" e espera a promessa; a cena
 * lê os canais a cada quadro. Fica fora do React e do three, então dá para testar
 * sem tela e o mesmo diretor serve ao celular e ao navegador.
 */
export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
} as const satisfies Record<string, Easing>;

interface Step {
  to: number;
  ms: number;
  easing: Easing;
}

interface Track {
  from: number;
  start: number;
  steps: Step[];
  done: () => void;
}

export class SceneDirector<K extends string = string> {
  private readonly values = new Map<K, number>();
  private readonly tracks = new Map<K, Track>();
  private now = 0;

  constructor(initial: Readonly<Record<K, number>>) {
    for (const [k, v] of Object.entries(initial) as [K, number][]) this.values.set(k, v);
  }

  get(key: K): number {
    return this.values.get(key) ?? 0;
  }

  /** Põe o valor na hora, cancelando a animação do canal. */
  set(key: K, value: number): void {
    this.finish(key, false);
    this.values.set(key, value);
  }

  /** Anima até `to` em `ms`; a promessa resolve no fim (ou na hora, se ms = 0). */
  to(key: K, to: number, ms: number, easing: Easing = ease.linear): Promise<void> {
    return this.sequence(key, [{ to, ms, easing }]);
  }

  /** Vários trechos seguidos no mesmo canal (sobe e desce, pisca…). */
  sequence(key: K, steps: readonly { to: number; ms: number; easing?: Easing }[]): Promise<void> {
    this.finish(key, false);
    const list = steps.map((s) => ({ to: s.to, ms: Math.max(0, s.ms), easing: s.easing ?? ease.linear }));
    if (list.every((s) => s.ms === 0)) {
      if (list.length) this.values.set(key, list[list.length - 1]!.to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tracks.set(key, { from: this.get(key), start: this.now, steps: list, done: resolve });
    });
  }

  /** Avança o relógio (ms desde qualquer origem fixa) e atualiza os canais. */
  update(nowMs: number): void {
    this.now = nowMs;
    for (const [key, track] of this.tracks) {
      let elapsed = nowMs - track.start;
      let from = track.from;
      let value = from;
      let finished = true;
      for (const step of track.steps) {
        if (elapsed < step.ms) {
          value = from + (step.to - from) * step.easing(step.ms === 0 ? 1 : elapsed / step.ms);
          finished = false;
          break;
        }
        elapsed -= step.ms;
        from = step.to;
        value = step.to;
      }
      this.values.set(key, value);
      if (finished) {
        this.tracks.delete(key);
        track.done();
      }
    }
  }

  /** Algum canal está em movimento? (a cena pode parar de desenhar quando não) */
  get busy(): boolean {
    return this.tracks.size > 0;
  }

  /** Encerra o canal (indo ao valor final, se `jump`) e resolve quem esperava. */
  finish(key: K, jump = true): void {
    const track = this.tracks.get(key);
    if (!track) return;
    this.tracks.delete(key);
    if (jump && track.steps.length) this.values.set(key, track.steps[track.steps.length - 1]!.to);
    track.done();
  }

  finishAll(): void {
    for (const key of [...this.tracks.keys()]) this.finish(key);
  }
}
