import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, ReviewerGuard } from './guards.js';
import { SOCIAL_VERIFIERS, SocialAuthService, type SocialVerifiers } from './social/social.service.js';
import { AppleVerifier, FacebookVerifier, GoogleVerifier } from './social/verifiers.js';
import { TokensService } from './tokens.service.js';

/** Só os logins configurados no .env existem (os outros botões nem aparecem no app). */
export function socialVerifiersFor(config: AppConfig): SocialVerifiers {
  const s = config.social;
  return {
    ...(s.google ? { google: new GoogleVerifier(s.google.clientIds) } : {}),
    ...(s.apple ? { apple: new AppleVerifier(s.apple.clientIds) } : {}),
    ...(s.facebook ? { facebook: new FacebookVerifier(s.facebook.appId, s.facebook.appSecret) } : {}),
  };
}

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    TokensService,
    AuthGuard,
    ReviewerGuard,
    SocialAuthService,
    { provide: SOCIAL_VERIFIERS, inject: [APP_CONFIG], useFactory: socialVerifiersFor },
  ],
  exports: [AuthService, TokensService, AuthGuard, ReviewerGuard],
})
export class AuthModule {}
