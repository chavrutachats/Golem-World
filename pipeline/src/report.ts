/**
 * Relatório em Markdown para revisão humana das perguntas geradas.
 * Mostra, para cada pergunta: alternativas com o gabarito, evidência e link para o
 * Sefaria, explicação, dificuldade da IA, veredito do verificador, avisos e o trecho
 * de origem (com os Nomes Divinos grafados como no app).
 */
import type { Prisma, PrismaClient, QuestionStatus } from '@trivia/db';
import {
  CATEGORIES,
  DIFFICULTY_LABELS_PT,
  renderDivineNamesForDisplay,
  sefariaUrlForRef,
  type CategoryId,
} from '@trivia/shared';

export interface ReportFilter {
  statuses?: QuestionStatus[];
  batchId?: string;
  categories?: CategoryId[];
  titles?: string[];
  limit: number;
}

interface StoredReport {
  errors?: { message: string }[];
  warnings?: { message: string }[];
  rejectionCodes?: string[];
  verification?: { result?: { confidence: number; notes: string }; verdict?: { reasons: string[] }; error?: string } | null;
}

const STATUS_LABEL: Record<QuestionStatus, string> = {
  pending_review: 'aguardando revisão',
  approved: 'aprovada',
  rejected: 'reprovada',
  retired: 'retirada',
};

const LANG_LABEL: Record<string, string> = { he: 'hebraico', en: 'inglês', pt: 'português' };

function quote(text: string): string {
  return text.replace(/\n/g, ' ');
}

export async function buildReviewReport(prisma: PrismaClient, filter: ReportFilter): Promise<string> {
  const where: Prisma.QuestionWhereInput = {
    ...(filter.statuses?.length ? { status: { in: filter.statuses } } : {}),
    ...(filter.batchId ? { batchId: filter.batchId } : {}),
    ...(filter.categories?.length ? { category: { in: filter.categories } } : {}),
    ...(filter.titles?.length ? { passage: { bookTitle: { in: filter.titles, mode: 'insensitive' } } } : {}),
  };
  const [questions, byStatus] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { passage: true },
      orderBy: [{ passage: { bookTitle: 'asc' } }, { passage: { sequence: 'asc' } }, { createdAt: 'asc' }],
      take: filter.limit,
    }),
    prisma.question.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  const lines: string[] = [];
  lines.push('# Revisão de perguntas geradas', '');
  lines.push(`Gerado em ${new Date().toISOString()}.`, '');
  lines.push(
    'Totais no filtro: ' +
      byStatus.map((s) => `${STATUS_LABEL[s.status]}: ${s._count._all}`).join(' · ') +
      `. Mostrando ${questions.length}.`,
    '',
  );
  lines.push(
    'Como revisar: confira se a resposta marcada ✅ está no trecho, se só ela é defensável, se os distratores são plausíveis e respeitosos e se o nível faz sentido.',
    '',
  );

  questions.forEach((q, n) => {
    const report = (q.validationReport ?? {}) as StoredReport;
    const category = q.category ? CATEGORIES[q.category].labelPt : 'Golem World';
    const passage = q.passage ?? {
      ref: q.sourceRef,
      segments: [],
      heVersionTitle: null,
      heLicense: null,
      enVersionTitle: null,
      enLicense: null,
      ptVersionTitle: q.versionTitle,
      ptLicense: q.license,
    };
    lines.push('---', '');
    lines.push(`### ${n + 1}. ${q.text}`, '');
    lines.push(
      `${category} · **${DIFFICULTY_LABELS_PT[q.difficulty]}** · ${STATUS_LABEL[q.status]} · ` +
        `fonte: [${q.sourceRef}](${sefariaUrlForRef(q.sourceRef)})`,
      '',
    );
    q.options.forEach((option, i) => lines.push(`- ${i === q.correctIndex ? '✅' : '▫️'} ${option}`));
    lines.push('');
    lines.push(`**Evidência (${LANG_LABEL[q.evidenceLanguage] ?? q.evidenceLanguage}):** "${quote(renderDivineNamesForDisplay(q.evidenceQuote))}"`, '');
    lines.push(`**Explicação:** ${q.explanation}`, '');
    if (q.difficultyRationale) lines.push(`**Por que este nível:** ${q.difficultyRationale}`, '');
    const v = report.verification;
    if (v?.result) {
      lines.push(`**Verificador:** confiança ${v.result.confidence.toFixed(2)} — ${v.result.notes || 'sem observações'}`, '');
    } else if (v?.error) {
      lines.push(`**Verificador:** não rodou (${v.error})`, '');
    }
    if (report.warnings?.length) lines.push(`**Avisos:** ${report.warnings.map((w) => w.message).join(' ')}`, '');
    if (q.status === 'rejected') {
      const reasons = [...(report.errors ?? []).map((e) => e.message), ...(v?.verdict?.reasons ?? [])];
      lines.push(`**Reprovada:** ${reasons.join(' ') || (report.rejectionCodes ?? []).join(', ')}`, '');
    }
    const segments = (Array.isArray(passage.segments) ? passage.segments : []) as {
      ref: string;
      he?: string;
      en?: string;
      pt?: string;
    }[];
    const shown = segments.filter((s) => s.ref === q.sourceRef);
    const context = shown.length ? shown : segments;
    lines.push(`<details><summary>Trecho ${passage.ref}</summary>`, '');
    for (const s of context) {
      lines.push(`**${s.ref}**`, '');
      if (s.he) lines.push(`> ${renderDivineNamesForDisplay(s.he)}`, '');
      if (s.en) lines.push(`> ${s.en}`, '');
      if (s.pt) lines.push(`> ${s.pt}`, '');
    }
    const versions = [
      passage.heVersionTitle && `he: ${passage.heVersionTitle} (${passage.heLicense})`,
      passage.enVersionTitle && `en: ${passage.enVersionTitle} (${passage.enLicense})`,
      passage.ptVersionTitle && `pt: ${passage.ptVersionTitle} (${passage.ptLicense})`,
    ].filter(Boolean);
    lines.push(`<sub>Versões: ${versions.join(' · ')}</sub>`, '', '</details>', '');
  });
  return lines.join('\n');
}

export async function contentStats(prisma: PrismaClient) {
  const [passages, questions] = await Promise.all([
    prisma.sourcePassage.groupBy({ by: ['category', 'status'], _count: { _all: true } }),
    prisma.question.groupBy({ by: ['category', 'status'], _count: { _all: true } }),
  ]);
  return { passages, questions };
}
