/**
 * Confirmação dos anúncios com prêmio pelo próprio Google (AdMob SSV, server-side
 * verification). Quando o jogador termina um anúncio, o Google chama
 * GET /rewards/ssv?...&signature=...&key_id=... ; a assinatura (ECDSA P-256 com
 * SHA-256) cobre a consulta inteira até antes de "&signature=". As chaves públicas
 * vêm de ADMOB_SSV_KEYS_URL e ficam em cache (o Google as troca de tempos em tempos).
 *
 * https://developers.google.com/admob/android/ssv
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export interface SsvPayload {
  adNetwork: string;
  adUnit: string;
  /** O que o app mandou junto do anúncio: o id da oferta (RewardTicket). */
  customData: string;
  /** O que o app mandou como usuário: o id do jogador. */
  userId: string;
  rewardAmount: number;
  rewardItem: string;
  timestamp: Date;
  transactionId: string;
}

export class SsvError extends Error {}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const KEYS_TTL_MS = 24 * 60 * 60 * 1000;

export class AdmobSsvVerifier {
  private keys = new Map<string, KeyObject>();
  private loadedAt = 0;

  constructor(
    private readonly keysUrl: string,
    private readonly fetchFn: Fetch = (url) => fetch(url),
    private readonly now: () => number = Date.now,
  ) {}

  private async loadKeys(force = false): Promise<void> {
    if (!force && this.keys.size > 0 && this.now() - this.loadedAt < KEYS_TTL_MS) return;
    const res = await this.fetchFn(this.keysUrl);
    if (!res.ok) throw new SsvError(`Chaves do AdMob indisponíveis (HTTP ${res.status}).`);
    const body = (await res.json()) as { keys?: { keyId?: number | string; pem?: string }[] };
    const keys = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) {
      if (k.keyId === undefined || !k.pem) continue;
      keys.set(String(k.keyId), createPublicKey(k.pem));
    }
    if (keys.size === 0) throw new SsvError('Resposta de chaves do AdMob sem chaves.');
    this.keys = keys;
    this.loadedAt = this.now();
  }

  /** Confere a assinatura e devolve os campos. `rawQuery` é a consulta original, sem o "?". */
  async verify(rawQuery: string): Promise<SsvPayload> {
    const sigAt = rawQuery.indexOf('&signature=');
    if (sigAt < 0) throw new SsvError('Consulta sem assinatura.');
    const message = rawQuery.slice(0, sigAt);
    const params = new URLSearchParams(rawQuery);
    const signature = params.get('signature');
    const keyId = params.get('key_id');
    if (!signature || !keyId) throw new SsvError('Consulta sem assinatura ou sem key_id.');

    await this.loadKeys();
    let key = this.keys.get(keyId);
    if (!key) {
      // Chave nova do Google: recarrega uma vez antes de recusar.
      await this.loadKeys(true);
      key = this.keys.get(keyId);
    }
    if (!key) throw new SsvError(`key_id desconhecido: ${keyId}`);
    const ok = verify('sha256', Buffer.from(message, 'utf8'), key, Buffer.from(signature, 'base64url'));
    if (!ok) throw new SsvError('Assinatura inválida.');

    const transactionId = params.get('transaction_id');
    const timestamp = Number(params.get('timestamp'));
    if (!transactionId || !Number.isFinite(timestamp)) throw new SsvError('Consulta sem transaction_id ou timestamp.');
    return {
      adNetwork: params.get('ad_network') ?? '',
      adUnit: params.get('ad_unit') ?? '',
      customData: params.get('custom_data') ?? '',
      userId: params.get('user_id') ?? '',
      rewardAmount: Number(params.get('reward_amount') ?? 0),
      rewardItem: params.get('reward_item') ?? '',
      timestamp: new Date(timestamp),
      transactionId,
    };
  }
}
