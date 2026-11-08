import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  SocialLoginRequestSchema,
  SocialProviderSchema,
  type AuthProviders,
  type SocialLoginRequest,
  ChangePasswordRequestSchema,
  GuestLoginRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  UpdateMeRequestSchema,
  type AuthTokens,
  type MeResponse,
} from '@trivia/shared';
import type { z } from 'zod';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { LIMITS } from '../security/rate-limit.js';
import { IpLimit, requestClientKey, UserLimit } from '../security/rate-limit.guards.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, bearerToken } from './guards.js';
import { SocialAuthService } from './social/social.service.js';
import { TokensService } from './tokens.service.js';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(SocialAuthService) private readonly social: SocialAuthService,
  ) {}

  /** Logins sociais configurados neste servidor. */
  @Get('providers')
  providers(): AuthProviders {
    return this.social.providers();
  }

  /**
   * Entrar com Google, Apple ou Facebook. Com sessão no header (convidado ou conta),
   * o login é ligado à conta atual, que mantém todo o progresso.
   */
  @Post('social')
  @HttpCode(200)
  @IpLimit(LIMITS.socialPerIp)
  async socialLogin(@Req() req: RequestLike, @Body(new ZodPipe(SocialLoginRequestSchema)) body: SocialLoginRequest): Promise<AuthTokens> {
    const token = bearerToken(req);
    const current = token ? await this.tokens.verifyAccess(token).catch(() => null) : null;
    return this.social.signIn(body, current?.id ?? null);
  }

  @Post('guest')
  @IpLimit(LIMITS.guestPerIp, LIMITS.guestPerIpDaily)
  guest(@Body(new ZodPipe(GuestLoginRequestSchema)) body: z.infer<typeof GuestLoginRequestSchema>): Promise<AuthTokens> {
    return this.auth.guest(body.displayName, body.locale);
  }

  /** Com um token de convidado no header, a conta de convidado é promovida (mantém o progresso). */
  @Post('register')
  @IpLimit(LIMITS.registerPerIp)
  async register(
    @Req() req: RequestLike,
    @Body(new ZodPipe(RegisterRequestSchema)) body: z.infer<typeof RegisterRequestSchema>,
  ): Promise<AuthTokens> {
    const token = bearerToken(req);
    const current = token ? await this.tokens.verifyAccess(token).catch(() => null) : null;
    return this.auth.register(body, current?.id ?? null);
  }

  @Post('login')
  @HttpCode(200)
  @IpLimit(LIMITS.loginPerIp)
  login(@Req() req: RequestLike, @Body(new ZodPipe(LoginRequestSchema)) body: z.infer<typeof LoginRequestSchema>): Promise<AuthTokens> {
    return this.auth.login(body.email, body.password, requestClientKey(req));
  }

  @Post('refresh')
  @HttpCode(200)
  @IpLimit(LIMITS.refreshPerIp)
  refresh(@Body(new ZodPipe(RefreshRequestSchema)) body: z.infer<typeof RefreshRequestSchema>): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshRequestSchema)) body: z.infer<typeof RefreshRequestSchema>): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  /** Encerra todas as sessões da conta, em todos os aparelhos (inclusive este). */
  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @UserLimit(LIMITS.logoutAll)
  async logoutAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }
}

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SocialAuthService) private readonly social: SocialAuthService,
  ) {}

  /** Desliga um login social (se sobrar outro jeito de entrar). */
  @Delete('identities/:provider')
  @HttpCode(200)
  @UserLimit(LIMITS.rename)
  async unlink(@CurrentUser() user: AuthUser, @Param('provider', new ZodPipe(SocialProviderSchema)) provider: z.infer<typeof SocialProviderSchema>): Promise<MeResponse> {
    await this.social.unlink(user.id, provider);
    return this.auth.me(user.id);
  }

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.auth.me(user.id);
  }

  @Patch()
  @UserLimit(LIMITS.rename)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UpdateMeRequestSchema)) body: z.infer<typeof UpdateMeRequestSchema>,
  ): Promise<MeResponse> {
    return this.auth.updateMe(user.id, body);
  }

  @Post('password')
  @HttpCode(200)
  @UserLimit(LIMITS.passwordChange)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ChangePasswordRequestSchema)) body: z.infer<typeof ChangePasswordRequestSchema>,
  ): Promise<AuthTokens> {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }
}
