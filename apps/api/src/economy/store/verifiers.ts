/**
 * Conferência das compras com as lojas. O app nunca diz "comprei": ele manda o que a
 * loja entregou (a transação assinada da Apple, o token do Google) e o servidor
 * confere com a própria loja antes de entregar shekels ou o "Sem anúncios".
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import type { StoreName } from '@trivia/shared';
import { GoogleAuth } from 'google-auth-library';
import { Errors } from '../../common/http.js';

export interface VerifiedPurchase {
  /** Identifica a compra na loja (uma entrega por transação). */
  transactionId: string;
  /** Apple: originalTransactionId (mesma compra nas restaurações). */
  originalId: string | null;
  productId: string;
  purchasedAt: Date;
  /** Production, Sandbox, Test, demo. */
  environment: string;
  /** Reembolsada ou revogada pela loja. */
  revoked: boolean;
  /** A conta do jogo a que a compra foi ligada no aparelho (appAccountToken / obfuscatedAccountId). */
  accountId: string | null;
  /** Google: confirmar a compra depois de entregar (sem isso, o Google estorna em 3 dias). */
  acknowledge?: () => Promise<void>;
}

export interface PurchaseVerifier {
  readonly store: StoreName;
  verify(input: { productId: string; receipt: string }): Promise<VerifiedPurchase>;
}

const invalid = () => Errors.unprocessable('PURCHASE_INVALID', 'Não foi possível confirmar esta compra com a loja.');
const unavailable = () => Errors.unavailable('STORE_UNAVAILABLE', 'A loja não respondeu agora. Sua compra não se perdeu: tente de novo em instantes.');

// ---------------------------------------------------------------------------
// App Store (StoreKit 2)
// ---------------------------------------------------------------------------

/** Lê os certificados raiz da Apple (.cer) de uma pasta. */
export function loadAppleRootCerts(dir: string): Buffer[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /\.(cer|der)$/i.test(f));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    throw new Error(`Nenhum certificado raiz da Apple em ${dir}. Baixe AppleRootCA-G3.cer em https://www.apple.com/certificateauthority/ e coloque nesta pasta.`);
  }
  return files.map((f) => readFileSync(path.join(dir, f)));
}

/** Lê o ambiente do JWS sem conferir (só para escolher o verificador; a conferência vem depois). */
function peekEnvironment(jws: string): string | null {
  const payload = jws.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { environment?: unknown };
    return typeof json.environment === 'string' ? json.environment : null;
  } catch {
    return null;
  }
}

export class AppleVerifier implements PurchaseVerifier {
  readonly store = 'apple' as const;
  private readonly production: SignedDataVerifier | null;
  private readonly sandbox: SignedDataVerifier;

  /**
   * Compras de Sandbox também são aceitas: é com elas que a revisão da Apple testa o app
   * publicado (e o TestFlight). O ambiente fica gravado em cada compra.
   */
  constructor(cfg: { bundleId: string; appAppleId: number | null; rootCerts: Buffer[] }, onlineChecks = true) {
    this.production = cfg.appAppleId !== null ? new SignedDataVerifier(cfg.rootCerts, onlineChecks, Environment.PRODUCTION, cfg.bundleId, cfg.appAppleId) : null;
    this.sandbox = new SignedDataVerifier(cfg.rootCerts, onlineChecks, Environment.SANDBOX, cfg.bundleId);
  }

  async verify({ productId, receipt }: { productId: string; receipt: string }): Promise<VerifiedPurchase> {
    const env = peekEnvironment(receipt);
    const verifier = env === Environment.PRODUCTION ? this.production : env === Environment.SANDBOX ? this.sandbox : null;
    if (!verifier) throw invalid();
    let tx: Awaited<ReturnType<SignedDataVerifier['verifyAndDecodeTransaction']>>;
    try {
      tx = await verifier.verifyAndDecodeTransaction(receipt);
    } catch {
      throw invalid();
    }
    if (tx.productId !== productId || !tx.transactionId || !tx.purchaseDate) throw invalid();
    return {
      transactionId: tx.transactionId,
      originalId: tx.originalTransactionId ?? null,
      productId,
      purchasedAt: new Date(tx.purchaseDate),
      environment: String(tx.environment ?? env),
      revoked: tx.revocationDate !== undefined && tx.revocationDate !== null,
      accountId: tx.appAccountToken?.toLowerCase() ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// Google Play (Play Developer API)
// ---------------------------------------------------------------------------

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** O que o Google devolve sobre uma compra de produto (só os campos usados). */
interface ProductPurchase {
  purchaseTimeMillis?: string;
  /** 0 comprado, 1 cancelado, 2 pendente. */
  purchaseState?: number;
  /** 0 ainda não confirmada pelo app/servidor. */
  acknowledgementState?: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  /** 0 = compra de teste (contas de teste do Play Console). */
  purchaseType?: number;
}

/** O cliente HTTP autenticado (permite trocar por um falso nos testes). */
export interface PlayHttp {
  request<T>(opts: { url: string; method?: 'GET' | 'POST' }): Promise<{ data: T }>;
}

export class GoogleVerifier implements PurchaseVerifier {
  readonly store = 'google' as const;
  private client: Promise<PlayHttp> | null = null;

  constructor(
    private readonly packageName: string,
    private readonly http: () => Promise<PlayHttp>,
  ) {}

  /** Conta de serviço com acesso à API do Google Play (arquivo JSON). */
  static fromServiceAccount(packageName: string, keyFile: string): GoogleVerifier {
    const auth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    return new GoogleVerifier(packageName, async () => (await auth.getClient()) as unknown as PlayHttp);
  }

  private async api(): Promise<PlayHttp> {
    this.client ??= this.http().catch((e: unknown) => {
      this.client = null;
      throw e;
    });
    return this.client;
  }

  async verify({ productId, receipt: token }: { productId: string; receipt: string }): Promise<VerifiedPurchase> {
    const url = `${PLAY_API}/${encodeURIComponent(this.packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
    let data: ProductPurchase;
    try {
      data = (await (await this.api()).request<ProductPurchase>({ url })).data;
    } catch (e) {
      const status = (e as { response?: { status?: number }; status?: number }).response?.status ?? (e as { status?: number }).status;
      throw status && status >= 400 && status < 500 ? invalid() : unavailable();
    }
    if (data.purchaseState === 2) throw Errors.conflict('PURCHASE_PENDING', 'O pagamento ainda está sendo processado. Assim que ele for aprovado, a compra aparece aqui.');
    if (data.purchaseState !== 0 || !data.purchaseTimeMillis) throw invalid();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return {
      transactionId: data.orderId || `token:${tokenHash.slice(0, 64)}`,
      originalId: null,
      productId,
      purchasedAt: new Date(Number(data.purchaseTimeMillis)),
      environment: data.purchaseType === 0 ? 'Test' : 'Production',
      revoked: false,
      accountId: data.obfuscatedExternalAccountId?.toLowerCase() ?? null,
      acknowledge:
        data.acknowledgementState === 0
          ? async () => {
              await (await this.api()).request({ url: `${url}:acknowledge`, method: 'POST' });
            }
          : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Demonstração (web, Expo Go e testes; nunca em produção)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O app de demonstração gera um id por compra; o servidor só confere o formato. */
export class DemoVerifier implements PurchaseVerifier {
  readonly store = 'demo' as const;

  constructor(private readonly now: () => Date) {}

  async verify({ productId, receipt }: { productId: string; receipt: string }): Promise<VerifiedPurchase> {
    if (!UUID.test(receipt)) throw invalid();
    return {
      transactionId: `demo:${receipt.toLowerCase()}`,
      originalId: null,
      productId,
      purchasedAt: this.now(),
      environment: 'demo',
      revoked: false,
      accountId: null,
    };
  }
}
