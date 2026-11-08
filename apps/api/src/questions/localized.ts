/**
 * Uma pergunta no idioma do jogador (Fase 8): a própria, se foi escrita ou montada
 * nesse idioma, ou a tradução guardada (perguntas do motor de IA, que nascem em
 * português). Nunca devolve campos misturados de idiomas diferentes.
 */
import type { Prisma, PrismaClient, Question } from '@trivia/db';
import { parseQuestionLocale, renderDivineNamesForDisplay, type Locale, type SourceLanguage } from '@trivia/shared';
import { questionSourceHash } from '../translation/translation.service.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface LocalizedQuestion {
  text: string;
  /** Na ordem canônica (a mesma de Question.options). */
  options: string[];
  explanation: string;
  evidenceQuote: string;
  evidenceLanguage: SourceLanguage;
  context: { label: string; text: string; language: SourceLanguage } | null;
  /** O texto citado é tradução automática. */
  machineTranslated: boolean;
  /** Versão e licença do texto citado neste idioma, quando diferem das da pergunta (banco). */
  version?: { title: string | null; license: string | null };
}

function original(q: Question): LocalizedQuestion {
  const contextLang = (q.contextLanguage ?? null) as SourceLanguage | null;
  const lang = q.evidenceLanguage as SourceLanguage;
  return {
    text: q.text,
    options: [...q.options],
    explanation: q.explanation,
    evidenceQuote: lang === 'he' ? renderDivineNamesForDisplay(q.evidenceQuote) : q.evidenceQuote,
    evidenceLanguage: lang,
    context:
      q.contextText && contextLang
        ? { label: q.contextLabel ?? '', text: contextLang === 'he' ? renderDivineNamesForDisplay(q.contextText) : q.contextText, language: contextLang }
        : null,
    machineTranslated: q.machineTranslated,
  };
}

export async function localizeQuestion(db: Db, q: Question, locale: Locale): Promise<LocalizedQuestion> {
  if (parseQuestionLocale(q.locale) === locale) return original(q);
  const tr = await db.questionTranslation.findUnique({ where: { questionId_locale: { questionId: q.id, locale } } });
  if (!tr || tr.sourceHash !== questionSourceHash(q) || tr.options.length !== q.options.length) return original(q);
  if (tr.status === 'bank') {
    // Banco: escrita junto com a pergunta. A citação pode ser o original hebraico (pt, he) ou a
    // tradução publicada (en), sempre com a versão e a licença de onde saiu.
    const evidenceLanguage = (tr.evidenceLanguage ?? locale) as SourceLanguage;
    const contextLanguage = (tr.contextLanguage ?? locale) as SourceLanguage;
    const he = (lang: SourceLanguage, text: string) => (lang === 'he' ? renderDivineNamesForDisplay(text) : text);
    return {
      text: tr.text,
      options: [...tr.options],
      explanation: tr.explanation,
      evidenceQuote: he(evidenceLanguage, tr.evidenceQuote),
      evidenceLanguage,
      context: tr.contextText ? { label: tr.contextLabel ?? '', text: he(contextLanguage, tr.contextText), language: contextLanguage } : null,
      machineTranslated: false,
      ...(tr.versionTitle !== null || tr.license !== null ? { version: { title: tr.versionTitle, license: tr.license } } : {}),
    };
  }
  return {
    text: tr.text,
    options: [...tr.options],
    explanation: tr.explanation,
    evidenceQuote: tr.evidenceQuote,
    evidenceLanguage: locale,
    context: tr.contextText ? { label: tr.contextLabel ?? '', text: tr.contextText, language: locale } : null,
    machineTranslated: true,
  };
}
