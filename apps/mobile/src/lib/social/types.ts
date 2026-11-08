/**
 * Cada login social entrega ao servidor o que o provedor deu (ID token ou access token);
 * quem confere é sempre o servidor. `null` = o jogador cancelou.
 */
import type { SocialProvider } from '@trivia/shared';

export interface SocialCredential {
  provider: SocialProvider;
  token: string;
  /** Nonce original (o provedor recebeu só o SHA-256 dele). */
  nonce?: string;
  /** Nome informado pelo provedor no aparelho (a Apple só manda na primeira vez). */
  displayName?: string;
}

export interface SocialAdapter {
  readonly provider: SocialProvider;
  /** Funciona neste aparelho? (módulo nativo presente, ids configurados no build). */
  available(): Promise<boolean>;
  signIn(): Promise<SocialCredential | null>;
}
