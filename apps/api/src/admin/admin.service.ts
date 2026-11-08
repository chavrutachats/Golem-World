/**
 * Revisão humana das perguntas e tratamento das denúncias.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, QuestionStatus } from '@trivia/db';
import {
  dedupeFingerprint,
  findDivineNameIssues,
  normalizeForMatch,
  renderDivineNamesForDisplay,
  sefariaUrlForRef,
  type CategoryId,
  type ReviewDecisionRequestSchema,
} from '@trivia/shared';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { Errors } from '../common/http.js';
import { CLOCK, PRISMA, type Clock } from '../common/infra.js';
import { QuestionSelector } from '../game/question-selector.service.js';

type ReviewDecision = z.infer<typeof ReviewDecisionRequestSchema>;

const QUESTION_INCLUDE = {
  passage: true,
  reports: { orderBy: { createdAt: 'desc' }, take: 20 },
  reviews: { orderBy: { createdAt: 'desc' }, take: 5, include: { reviewer: { select: { displayName: true } } } },
} satisfies Prisma.QuestionInclude;
type LoadedQuestion = Prisma.QuestionGetPayload<{ include: typeof QUESTION_INCLUDE }>;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Perguntas de molde não têm passagem: usamos uma vazia com a referência da pergunta. */
function passageOf(q: LoadedQuestion) {
  return (
    q.passage ?? {
      ref: q.sourceRef,
      bookTitle: '',
      segments: [],
      heVersionTitle: null,
      heLicense: null,
      enVersionTitle: null,
      enLicense: null,
      ptVersionTitle: q.versionTitle,
      ptLicense: q.license,
    }
  );
}

function toItem(q: LoadedQuestion) {
  const passage = passageOf(q);
  const segments = (Array.isArray(passage.segments) ? passage.segments : []) as {
    ref: string;
    he?: string;
    en?: string;
    pt?: string;
  }[];
  return {
    id: q.id,
    status: q.status,
    category: q.category,
    difficulty: q.difficulty,
    aiDifficulty: q.aiDifficulty,
    difficultyRationale: q.difficultyRationale,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    sourceRef: q.sourceRef,
    sourceUrl: sefariaUrlForRef(q.sourceRef),
    evidenceQuote: q.evidenceLanguage === 'he' ? renderDivineNamesForDisplay(q.evidenceQuote) : q.evidenceQuote,
    evidenceLanguage: q.evidenceLanguage,
    verifierConfidence: q.verifierConfidence,
    validationReport: q.validationReport,
    timesServed: q.timesServed,
    timesCorrect: q.timesCorrect,
    createdAt: q.createdAt.toISOString(),
    passage: {
      ref: passage.ref,
      bookTitle: passage.bookTitle,
      segments: segments.map((s) => ({ ...s, ...(s.he ? { he: renderDivineNamesForDisplay(s.he) } : {}) })),
      versions: {
        he: passage.heVersionTitle ? { title: passage.heVersionTitle, license: passage.heLicense } : null,
        en: passage.enVersionTitle ? { title: passage.enVersionTitle, license: passage.enLicense } : null,
        pt: passage.ptVersionTitle ? { title: passage.ptVersionTitle, license: passage.ptLicense } : null,
      },
    },
    reports: q.reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      comment: r.comment,
      trusted: r.trusted,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
    reviews: q.reviews.map((r) => ({
      decision: r.decision,
      notes: r.notes,
      reviewer: r.reviewer?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface QuestionListFilter {
  status?: QuestionStatus | undefined;
  category?: CategoryId | undefined;
  book?: string | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(QuestionSelector) private readonly selector: QuestionSelector,
  ) {}

  async listQuestions(filter: QuestionListFilter) {
    const where: Prisma.QuestionWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.book ? { passage: { bookTitle: { equals: filter.book, mode: 'insensitive' } } } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: QUESTION_INCLUDE,
        orderBy: [{ passage: { bookTitle: 'asc' } }, { passage: { sequence: 'asc' } }, { createdAt: 'asc' }],
        take: filter.limit,
        skip: filter.offset,
      }),
    ]);
    return { total, items: items.map(toItem) };
  }

  async reviewer(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, displayName: true, role: true } });
    return user;
  }

  async review(reviewerId: string, id: string, input: ReviewDecision) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw Errors.notFound('Pergunta não encontrada.');

    const edits = input.edits ?? {};
    const text = edits.text ?? q.text;
    const options = edits.options ?? q.options;
    const correctIndex = edits.correctIndex ?? q.correctIndex;
    const explanation = edits.explanation ?? q.explanation;
    const hasEdits = Object.keys(edits).length > 0;

    if (hasEdits) {
      if (new Set(options.map(normalizeForMatch)).size !== options.length) {
        throw Errors.unprocessable('DUPLICATE_OPTIONS', 'As alternativas precisam ser diferentes entre si.');
      }
      const issues = [text, explanation, ...options].flatMap(findDivineNameIssues).filter((i) => i.severity === 'error');
      if (issues.length) throw Errors.unprocessable('DIVINE_NAME', issues[0]!.message);
    }

    const dedupeKey = sha256(dedupeFingerprint(text, options[correctIndex] ?? ''));
    if (dedupeKey !== q.dedupeKey && (await this.prisma.question.findUnique({ where: { dedupeKey } }))) {
      throw Errors.conflict('DUPLICATE_QUESTION', 'Já existe outra pergunta igual a esta versão editada.');
    }

    await this.prisma.$transaction([
      this.prisma.question.update({
        where: { id },
        data: {
          status: input.decision === 'approve' ? 'approved' : 'rejected',
          text,
          options,
          correctIndex,
          explanation,
          dedupeKey,
          ...(edits.difficulty ? { difficulty: edits.difficulty } : {}),
        },
      }),
      this.prisma.questionReview.create({
        data: {
          questionId: id,
          reviewerId,
          decision: input.decision,
          ...(input.notes ? { notes: input.notes } : {}),
          ...(hasEdits
            ? { edits: { before: { text: q.text, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, difficulty: q.difficulty }, after: edits } }
            : {}),
        },
      }),
      // Pergunta editada: as traduções eram da versão antiga e saem (o servidor traduz de novo).
      ...(hasEdits ? [this.prisma.questionTranslation.deleteMany({ where: { questionId: id } })] : []),
    ]);
    this.selector.invalidateAvailability();
    const updated = await this.prisma.question.findUniqueOrThrow({ where: { id }, include: QUESTION_INCLUDE });
    return toItem(updated);
  }

  /** Aprova ou reprova várias de uma vez, sem edições (ex.: depois de ler o relatório do pipeline). */
  async bulkReview(reviewerId: string, ids: string[], decision: 'approve' | 'reject', notes?: string) {
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const found = await this.prisma.question.findMany({ where: { id: { in: ids } }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.question.updateMany({ where: { id: { in: found.map((f) => f.id) } }, data: { status } }),
      this.prisma.questionReview.createMany({
        data: found.map((f) => ({ questionId: f.id, reviewerId, decision, ...(notes ? { notes } : {}) })),
      }),
    ]);
    this.selector.invalidateAvailability();
    return { updated: found.length };
  }

  /**
   * Denúncias, das mais urgentes para as menos: desrespeito primeiro, depois as de
   * denunciantes confiáveis, depois as mais recentes.
   */
  async listReports(open: boolean) {
    const reports = await this.prisma.questionReport.findMany({
      where: open ? { resolvedAt: null } : {},
      include: {
        question: { select: { id: true, text: true, status: true, sourceRef: true } },
        user: { select: { displayName: true, isGuest: true } },
        resolvedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const urgency = (r: (typeof reports)[number]) => (r.reason === 'disrespectful' ? 0 : 2) + (r.trusted ? 0 : 1);
    return reports
      .sort((a, b) => urgency(a) - urgency(b) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        reason: r.reason,
        comment: r.comment,
        trusted: r.trusted,
        triggeredRetirement: r.triggeredRetirement,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolution: r.resolution,
        resolvedBy: r.resolvedBy?.displayName ?? null,
        reporter: r.user.displayName,
        reporterIsGuest: r.user.isGuest,
        question: r.question,
      }));
  }

  /** dismiss: denúncia improcedente; retire: tira a pergunta de circulação; restore: volta a aprovar. */
  async resolveReport(reviewerId: string, id: string, action: 'dismiss' | 'retire' | 'restore') {
    const report = await this.prisma.questionReport.findUnique({ where: { id } });
    if (!report) throw Errors.notFound('Denúncia não encontrada.');
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.questionReport.updateMany({
        where: { questionId: report.questionId, resolvedAt: null },
        data: { resolvedAt: now, resolvedById: reviewerId, resolution: action },
      }),
      ...(action === 'retire' ? [this.prisma.question.update({ where: { id: report.questionId }, data: { status: 'retired' } })] : []),
      ...(action === 'restore' ? [this.prisma.question.update({ where: { id: report.questionId }, data: { status: 'approved' } })] : []),
    ]);
    this.selector.invalidateAvailability();
    return { resolved: true };
  }

  async stats() {
    const [questions, passages, openReports] = await Promise.all([
      this.prisma.question.groupBy({ by: ['category', 'status'], _count: { _all: true } }),
      this.prisma.sourcePassage.groupBy({ by: ['category', 'status'], _count: { _all: true } }),
      this.prisma.questionReport.count({ where: { resolvedAt: null } }),
    ]);
    const flat = (rows: { category: string | null; status: string; _count: { _all: number } }[]) =>
      rows.map((r) => ({ category: r.category ?? 'golem_world', status: r.status, count: r._count._all }));
    return { questions: flat(questions), passages: flat(passages), openReports };
  }
}
