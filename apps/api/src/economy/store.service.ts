/**
 * Compras com dinheiro (pacotes de shekels e "Sem anúncios") e gastos de shekels em
 * vidas e ajudas. Cada compra da loja é entregue uma única vez, pela transação da
 * loja: reenviar (ou restaurar) a mesma compra não dá nada em dobro.
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@trivia/db';
import {
  LIVES_AFTER_REFILL,
  LIVES_RULES,
  livesAt,
  shekelOffer,
  storeProduct,
  type EconomyState,
  type PurchaseRequest,
  type PurchaseResult,
  type StoreName,
} from '@trivia/shared';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AppleVerifier, DemoVerifier, GoogleVerifier, loadAppleRootCerts, type PurchaseVerifier } from './store/verifiers.js';
import { WalletService, type Tx } from './wallet.service.js';

/** Injetável para os testes trocarem as lojas por versões controladas. */
export const PURCHASE_VERIFIERS = Symbol('PURCHASE_VERIFIERS');
export type PurchaseVerifiers = Partial<Record<StoreName, PurchaseVerifier>>;

/** Monta os verificadores conforme STORE_MODE e as lojas configuradas. */
export function purchaseVerifiersFor(config: AppConfig, clock: Clock): PurchaseVerifiers {
  const e = config.economy;
  if (e.storeMode === 'off') return {};
  if (e.storeMode === 'demo') return { demo: new DemoVerifier(() => clock.now()) };
  const out: PurchaseVerifiers = {};
  if (e.apple) out.apple = new AppleVerifier({ bundleId: e.apple.bundleId, appAppleId: e.apple.appAppleId, rootCerts: loadAppleRootCerts(e.apple.rootCertsDir) });
  if (e.google) out.google = GoogleVerifier.fromServiceAccount(e.google.packageName, e.google.serviceAccountFile);
  return out;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly logger = new Logger('Store');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(PURCHASE_VERIFIERS) private readonly verifiers: PurchaseVerifiers,
  ) {}

  onModuleInit(): void {
    const stores = Object.keys(this.verifiers);
    this.logger.log(`Loja: ${this.config.economy.storeMode}${stores.length ? ` (${stores.join(', ')})` : ''}. Anúncios: ${this.config.economy.adsMode}.`);
  }

  private transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  }

  // -------------------------------------------------------------------------
  // Compras com dinheiro
  // -------------------------------------------------------------------------

  async purchase(userId: string, req: PurchaseRequest): Promise<PurchaseResult> {
    const verifier = this.verifiers[req.store];
    if (!verifier) throw Errors.conflict('STORE_OFF', 'A loja não está disponível nesta versão do jogo.');
    const product = storeProduct(req.productId);
    if (!product) throw Errors.unprocessable('UNKNOWN_PRODUCT', 'Produto desconhecido.');

    const verified = await verifier.verify({ productId: product.id, receipt: req.receipt });
    if (verified.revoked) throw Errors.conflict('PURCHASE_REVOKED', 'Esta compra foi reembolsada pela loja.');
    // Compra feita no aparelho por outra conta do jogo (o app liga cada compra à conta logada).
    if (product.consumable && verified.accountId && verified.accountId !== userId.toLowerCase()) {
      throw Errors.conflict('PURCHASE_OTHER_ACCOUNT', 'Esta compra pertence a outra conta do jogo.');
    }

    const grant = async () =>
      this.transaction(async (tx) => {
        const existing = await tx.storePurchase.findUnique({ where: { store_transactionId: { store: req.store, transactionId: verified.transactionId } } });
        if (existing && existing.userId !== userId) throw Errors.conflict('PURCHASE_OTHER_ACCOUNT', 'Esta compra pertence a outra conta do jogo.');
        if (existing) {
          // Restauração do "Sem anúncios" (ou reenvio): garante o efeito, sem entregar de novo.
          if (product.kind === 'noAds') await tx.user.update({ where: { id: userId }, data: { adFree: true } });
          return true;
        }
        await tx.storePurchase.create({
          data: {
            userId,
            store: req.store,
            productId: product.id,
            transactionId: verified.transactionId,
            originalId: verified.originalId,
            environment: verified.environment,
            purchasedAt: verified.purchasedAt,
          },
        });
        if (product.kind === 'shekels') {
          await this.wallet.apply(tx, {
            userId,
            currency: 'shekels',
            delta: product.amount,
            reason: 'purchase',
            ref: product.id,
            idempotencyKey: `purchase:${req.store}:${verified.transactionId}`,
          });
        } else {
          await tx.user.update({ where: { id: userId }, data: { adFree: true } });
        }
        return false;
      });

    let alreadyGranted: boolean;
    try {
      alreadyGranted = await grant();
    } catch (e) {
      // Duas entregas da mesma compra ao mesmo tempo: a segunda vê a primeira e não entrega de novo.
      if (!isUniqueViolation(e)) throw e;
      alreadyGranted = await grant();
    }
    if (verified.acknowledge) {
      // Sem confirmação, o Google estorna em 3 dias; se falhar agora, o próximo envio confirma.
      await verified.acknowledge().catch((e: unknown) => this.logger.warn(`Confirmação no Google Play falhou: ${String(e)}`));
    }
    return {
      productId: product.id,
      alreadyGranted,
      granted: { shekels: product.kind === 'shekels' && !alreadyGranted ? product.amount : 0, adFree: product.kind === 'noAds' },
      economy: await this.wallet.state(userId),
    };
  }

  // -------------------------------------------------------------------------
  // Gastos de shekels (fora os itens do armário)
  // -------------------------------------------------------------------------

  async buyOffer(userId: string, offerId: string): Promise<EconomyState> {
    const offer = shekelOffer(offerId);
    if (!offer) throw Errors.notFound('Oferta não encontrada.');
    const now = this.clock.now();
    await this.transaction(async (tx) => {
      if (offer.kind === 'lives') {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { lives: true, livesUpdatedAt: true } });
        if (livesAt(u.lives, u.livesUpdatedAt, now).lives >= LIVES_RULES.max) throw Errors.conflict('LIVES_FULL', 'Suas vidas já estão cheias.');
        await this.wallet.apply(tx, { userId, currency: 'shekels', delta: -offer.price, reason: 'offer', ref: offer.id });
        await tx.user.update({ where: { id: userId }, data: { lives: LIVES_AFTER_REFILL, livesUpdatedAt: now } });
        return;
      }
      if ((await this.wallet.boostRoom(tx, userId, offer.boost)) < offer.amount) {
        throw Errors.conflict('BOOSTS_FULL', 'Sua mochila já está cheia desta ajuda.');
      }
      await this.wallet.apply(tx, { userId, currency: 'shekels', delta: -offer.price, reason: 'offer', ref: offer.id });
      await this.wallet.addBoost(tx, userId, offer.boost, offer.amount);
    });
    return this.wallet.state(userId);
  }
}
