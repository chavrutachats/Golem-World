import { Body, Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  AdBreakRequestSchema,
  BuyOfferRequestSchema,
  PurchaseRequestSchema,
  RewardOfferRequestSchema,
  type AdBreakResult,
  type EconomyState,
  type PurchaseRequest,
  type PurchaseResult,
  type RewardClaimResult,
  type RewardOfferRequest,
  type RewardTicket,
} from '@trivia/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { CLOCK, type Clock } from '../common/infra.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { LIMITS } from '../security/rate-limit.js';
import { IpLimit, UserLimit } from '../security/rate-limit.guards.js';
import { RewardsService } from './rewards.service.js';
import { PURCHASE_VERIFIERS, purchaseVerifiersFor, StoreService } from './store.service.js';
import { WalletService } from './wallet.service.js';

const TicketId = new ParseUUIDPipe({ version: '4' });

@Controller()
@UseGuards(AuthGuard)
export class EconomyController {
  constructor(
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(RewardsService) private readonly rewards: RewardsService,
  ) {}

  /** Carteira, mochila, vidas, "Sem anúncios" e como anúncios e loja funcionam aqui. */
  @Get('economy')
  state(@CurrentUser() user: AuthUser): Promise<EconomyState> {
    return this.wallet.state(user.id);
  }

  /** Gasta shekels em vidas da roleta ou ajudas do Golem World. */
  @Post('economy/offers')
  @HttpCode(200)
  @UserLimit(LIMITS.shop)
  buyOffer(@CurrentUser() user: AuthUser, @Body(new ZodPipe(BuyOfferRequestSchema)) body: z.infer<typeof BuyOfferRequestSchema>): Promise<EconomyState> {
    return this.store.buyOffer(user.id, body.offerId);
  }

  /** Entrega uma compra da App Store, do Google Play (ou de demonstração), conferida com a loja. */
  @Post('store/purchases')
  @HttpCode(200)
  @UserLimit(LIMITS.purchase)
  purchase(@CurrentUser() user: AuthUser, @Body(new ZodPipe(PurchaseRequestSchema)) body: PurchaseRequest): Promise<PurchaseResult> {
    return this.store.purchase(user.id, body);
  }

  /** Pede a oferta de um anúncio com prêmio: o prêmio vem aqui, antes do anúncio. */
  @Post('rewards/offers')
  @HttpCode(200)
  @UserLimit(LIMITS.rewards)
  offer(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RewardOfferRequestSchema)) body: RewardOfferRequest): Promise<RewardTicket> {
    return this.rewards.offer(user.id, body.placement, body.ref);
  }

  /** Anúncio de teste ou de demonstração terminou (com anúncios reais, quem confirma é o Google). */
  @Post('rewards/:id/watched')
  @HttpCode(200)
  @UserLimit(LIMITS.rewards)
  watched(@CurrentUser() user: AuthUser, @Param('id', TicketId) id: string): Promise<RewardTicket> {
    return this.rewards.markWatchedByClient(user.id, id);
  }

  @Post('rewards/:id/claim')
  @HttpCode(200)
  @UserLimit(LIMITS.rewards)
  claim(@CurrentUser() user: AuthUser, @Param('id', TicketId) id: string): Promise<RewardClaimResult> {
    return this.rewards.claim(user.id, id);
  }

  /** Fim de partida ou de fase: é hora do anúncio obrigatório? */
  @Post('ads/break')
  @HttpCode(200)
  @UserLimit(LIMITS.rewards)
  adBreak(@CurrentUser() user: AuthUser, @Body(new ZodPipe(AdBreakRequestSchema)) _body: z.infer<typeof AdBreakRequestSchema>): Promise<AdBreakResult> {
    return this.rewards.adBreak(user.id);
  }
}

/** Chamada do Google (AdMob SSV): sem login, conferida pela assinatura. */
@Controller('rewards')
export class AdmobCallbackController {
  constructor(@Inject(RewardsService) private readonly rewards: RewardsService) {}

  @Get('ssv')
  @IpLimit(LIMITS.ssv)
  ssv(@Req() req: Request): Promise<{ ok: boolean }> {
    const q = req.originalUrl.indexOf('?');
    return this.rewards.handleSsv(q >= 0 ? req.originalUrl.slice(q + 1) : '');
  }
}

@Module({
  imports: [AuthModule],
  controllers: [EconomyController, AdmobCallbackController],
  providers: [
    WalletService,
    RewardsService,
    StoreService,
    { provide: PURCHASE_VERIFIERS, inject: [APP_CONFIG, CLOCK], useFactory: (config: AppConfig, clock: Clock) => purchaseVerifiersFor(config, clock) },
  ],
  exports: [WalletService, RewardsService],
})
export class EconomyModule {}
