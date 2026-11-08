import { Body, Controller, Get, Header, HttpCode, Inject, Module, Post, UseGuards } from '@nestjs/common';
import { DeleteAccountRequestSchema } from '@trivia/shared';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { PAGE_CSP } from '../common/pages.js';
import { GameModule } from '../game/game.module.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { AccountService } from './account.service.js';
import { DELETE_PAGE_JS, deletePageHtml } from './delete-page.js';

@Controller('me')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  /** Exclui a conta. Contas cadastradas confirmam com a senha. */
  @Post('delete')
  @HttpCode(204)
  @UserLimit(LIMITS.accountDelete)
  async delete(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(DeleteAccountRequestSchema)) body: z.infer<typeof DeleteAccountRequestSchema>,
  ): Promise<void> {
    await this.account.deleteAccount(user.id, body.password);
  }
}

/** Página pública para pedir a exclusão pela web (exigência do Google Play). */
@Controller('conta')
export class AccountPageController {
  @Get('excluir')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', PAGE_CSP)
  page(): string {
    return deletePageHtml();
  }

  @Get('excluir.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  script(): string {
    return DELETE_PAGE_JS;
  }
}

@Module({
  imports: [AuthModule, GameModule],
  controllers: [AccountController, AccountPageController],
  providers: [AccountService],
})
export class AccountModule {}
