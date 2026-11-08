/**
 * Cronômetro da pergunta sem depender do relógio do celular (que pode estar errado):
 * a API manda a hora dela (`serverNow`) junto com o prazo, e o app mede a diferença
 * para o próprio relógio no momento em que recebe a pergunta.
 */

/** Quanto o relógio do servidor está à frente do local, em ms. */
export function clockOffsetMs(serverNowIso: string, receivedAtMs: number): number {
  return Date.parse(serverNowIso) - receivedAtMs;
}

export function remainingMs(deadlineIso: string, localNowMs: number, offsetMs: number): number {
  return Math.max(0, Date.parse(deadlineIso) - (localNowMs + offsetMs));
}

/** Segundos inteiros exibidos (arredonda para cima: "1" até o último instante). */
export function displaySeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

/** Últimos segundos ficam em destaque. */
export function isUrgent(ms: number, thresholdMs = 5_000): boolean {
  return ms > 0 && ms <= thresholdMs;
}
