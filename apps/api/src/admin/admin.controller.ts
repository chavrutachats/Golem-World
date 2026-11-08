import { Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CategoryIdSchema, ReviewDecisionRequestSchema } from '@trivia/shared';
import { z } from 'zod';
import { AuthGuard, ReviewerGuard } from '../auth/guards.js';
import { CurrentUser, ZodPipe, type AuthUser } from '../common/http.js';
import { PAGE_CSP } from '../common/pages.js';
import { LIMITS } from '../security/rate-limit.js';
import { UserLimit } from '../security/rate-limit.guards.js';
import { ADMIN_APP_JS, adminPageHtml } from './admin-page.js';
import { AdminService } from './admin.service.js';

const ListQuerySchema = z.object({
  status: z.enum(['pending_review', 'approved', 'rejected', 'retired']).optional(),
  category: CategoryIdSchema.optional(),
  book: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const BulkReviewSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(1000).optional(),
});

const ResolveReportSchema = z.object({ action: z.enum(['dismiss', 'retire', 'restore']) });
const ReportsQuerySchema = z.object({ open: z.enum(['true', 'false']).default('true') });

/** Página web de revisão (pública: sem login de revisor ela não carrega nenhum dado). */
@Controller('admin')
export class AdminPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', PAGE_CSP)
  page(): string {
    return adminPageHtml();
  }

  @Get('app.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  script(): string {
    return ADMIN_APP_JS;
  }
}

/**
 * API de revisão: só contas com papel de revisor ou admin (veja `pnpm reviewers`).
 * Cada decisão fica registrada com quem a tomou.
 */
@Controller('admin/api')
@UseGuards(AuthGuard, ReviewerGuard)
@UserLimit(LIMITS.review)
export class AdminApiController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('me')
  whoami(@CurrentUser() user: AuthUser) {
    return this.admin.reviewer(user.id);
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('questions')
  list(@Query(new ZodPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.admin.listQuestions(query);
  }

  @Post('questions/bulk-review')
  @HttpCode(200)
  bulk(@CurrentUser() user: AuthUser, @Body(new ZodPipe(BulkReviewSchema)) body: z.infer<typeof BulkReviewSchema>) {
    return this.admin.bulkReview(user.id, body.ids, body.decision, body.notes);
  }

  @Post('questions/:id/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(ReviewDecisionRequestSchema)) body: z.infer<typeof ReviewDecisionRequestSchema>,
  ) {
    return this.admin.review(user.id, id, body);
  }

  @Get('reports')
  reports(@Query(new ZodPipe(ReportsQuerySchema)) query: z.infer<typeof ReportsQuerySchema>) {
    return this.admin.listReports(query.open === 'true');
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(ResolveReportSchema)) body: z.infer<typeof ResolveReportSchema>,
  ) {
    return this.admin.resolveReport(user.id, id, body.action);
  }
}
