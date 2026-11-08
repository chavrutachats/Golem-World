/**
 * CLI do pipeline. Uso: `pnpm pipeline <comando> [opções]` (na raiz do monorepo).
 * Rode `pnpm pipeline help` para a lista de comandos.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createPrismaClient, type PrismaClient, type QuestionStatus } from '@trivia/db';
import { CATEGORY_IDS, JOURNEY_TRACKS, isCategoryId, parashaById, type CategoryId, type JourneyTrack } from '@trivia/shared';
import { calibrate } from './calibrate.js';
import { removeDemo, seedDemo } from './demo/seed.js';
import { loadConfig, type PipelineConfig } from './config.js';
import { buildGeneratorRequest, type Engine } from './generation/engine.js';
import { toPassageInput } from './generation/persist.js';
import { collectBatches, runSync, selectPassages, submitBatch } from './generation/run.js';
import { ingest } from './ingest/ingest.js';
import { createProvider } from './llm/factory.js';
import { FakeProvider } from './llm/fake.js';
import { loadPrompt } from './prompts.js';
import { buildReviewReport, contentStats } from './report.js';
import { downloadBooks } from './sefaria/download.js';
import { errorMessage, log } from './util.js';
import { downloadJourney } from './journey/download-journey.js';
import { generateForJourney } from './journey/generate-journey.js';
import { translateQuestions, translateSegments } from './translate.js';
import { ingestJourney } from './journey/ingest-journey.js';
import { buildBank, readBank, writeBank } from './bank/build.js';
import { Corpus } from './bank/corpus.js';
import { importBank } from './bank/import.js';

const HELP = `
Pipeline de perguntas — trivia-torah

  pnpm pipeline download  --title Genesis [--title ...] | --category torah [--force] [--refresh-index]
      Baixa do Sefaria-Export (bucket público) só os livros pedidos, nos idiomas de SOURCE_LANGUAGES.

  pnpm pipeline download --journey [--force]
      Golem World: baixa a Torá, os comentaristas (Rashi, Ramban, Ibn Ezra, Sforno), o Midrash
      Rabá, o Zohar, o Sefer HaChinuch, as conexões do Sefaria e os tratados da Mishná e do
      Talmud ligados à Torá.

  pnpm pipeline journey-ingest [--title "Rashi on Genesis"] [--track commentators] [--dry-run]
      Grava os textos das trilhas, cada segmento ligado aos versículos e às parashiot. É com
      eles que o jogo monta perguntas na hora, sem IA.

  pnpm pipeline journey-generate [--track mishnah] [--parasha bereshit] [--limit 3] [--watch 30]
      Gera perguntas por IA para as fases com menos perguntas, na ordem do mapa. Com --watch N,
      continua rodando e repete a cada N minutos.

  pnpm pipeline translate --lang pt|en [--track torah] [--parasha bereshit] [--limit 2000] [--dry-run]
  pnpm pipeline translate --lang en|he --questions [--limit 200] [--dry-run]
      Fase 8: traduz em lote, a partir do original, os textos que ainda não existem no idioma
      (padrão: a Torá inteira) ou, com --questions, as perguntas aprovadas do motor de IA. A API
      traduz na hora o que faltar, mas o que já vem pronto daqui não faz ninguém esperar.
      Usa o mesmo prompt e as mesmas checagens da API; a tradução reprovada não é gravada.

  pnpm pipeline ingest    [--title Genesis] [--category torah] [--dry-run]
      Escolhe a melhor versão permitida de cada idioma, recorta em passagens e grava no banco.

  pnpm pipeline generate  [--title Genesis] [--category torah] [--sections 1-11] [--limit 20]
                          [--sync | --batch] [--retry-failed] [--dry-run]
      Gera, valida e verifica perguntas. --sync responde na hora; --batch usa a Batch API
      (mais barata, resultado em até 24 h; colete com "collect"). --dry-run só mostra o prompt.

  pnpm pipeline collect   [--batch-id <id>]
      Coleta lotes enviados com --batch que já terminaram.

  pnpm pipeline report    [--status pending_review] [--title Genesis] [--batch-id <id>] [--limit 20] [--out arquivo.md]
      Gera um relatório Markdown para revisão humana (padrão: pipeline/out/review-<data>.md).

  pnpm pipeline calibrate [--dry-run]
      Recalibra a dificuldade das perguntas aprovadas com base no desempenho dos jogadores.

  pnpm pipeline stats
      Contagem de passagens e perguntas por categoria e status.

  pnpm pipeline seed-demo [--approve] [--remove]
      Carrega 17 perguntas de demonstração (Torá, Mishná e Talmud), escritas à mão a partir dos
      trechos de pipeline/fixtures, para testar o jogo sem chave de LLM. Entram aguardando revisão;
      --approve já as aprova. --remove tira todas.

Categorias: ${CATEGORY_IDS.join(', ')}
`;

const BANK_HELP = `
  pnpm pipeline bank-build [--category torah] [--export /outro/espelho]
      Fase 12: monta o banco de perguntas (pipeline/bank/*.jsonl) a partir do espelho local do
      Sefaria-Export (SEFARIA_EXPORT_PATH e cada --export), já em português, inglês e hebraico.
      Cada pergunta é conferida contra o texto citado; o relatório mostra o que ficou de fora.

  pnpm pipeline bank-import [--approve] [--dry-run]
      Grava o banco no PostgreSQL. As perguntas dos geradores entram aprovadas; as escritas à
      mão (bank/curated) entram aguardando revisão, ou aprovadas com --approve.
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string', multiple: true },
    category: { type: 'string', multiple: true },
    sections: { type: 'string' },
    limit: { type: 'string' },
    status: { type: 'string', multiple: true },
    'batch-id': { type: 'string' },
    out: { type: 'string' },
    batch: { type: 'boolean', default: false },
    sync: { type: 'boolean', default: false },
    'retry-failed': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'refresh-index': { type: 'boolean', default: false },
    approve: { type: 'boolean', default: false },
    remove: { type: 'boolean', default: false },
    journey: { type: 'boolean', default: false },
    track: { type: 'string', multiple: true },
    parasha: { type: 'string' },
    watch: { type: 'string' },
    lang: { type: 'string' },
    questions: { type: 'boolean', default: false },
    export: { type: 'string', multiple: true },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

function parseCategories(): CategoryId[] | undefined {
  const raw = values.category;
  if (!raw?.length) return undefined;
  for (const c of raw) {
    if (!isCategoryId(c)) throw new Error(`Categoria desconhecida: "${c}". Use: ${CATEGORY_IDS.join(', ')}`);
  }
  return raw as CategoryId[];
}

function parseTracks(): JourneyTrack[] | undefined {
  const raw = values.track;
  if (!raw?.length) return undefined;
  for (const t of raw) {
    if (!(JOURNEY_TRACKS as readonly string[]).includes(t)) throw new Error(`Trilha desconhecida: "${t}". Use: ${JOURNEY_TRACKS.join(', ')}`);
  }
  return raw as JourneyTrack[];
}

function parseSections(): { from: number; to: number } | undefined {
  if (!values.sections) return undefined;
  const m = /^(\d+)(?:-(\d+))?$/.exec(values.sections.trim());
  if (!m) throw new Error('--sections deve ser N ou N-M (ex.: 1-11).');
  const from = Number(m[1]);
  return { from, to: m[2] ? Number(m[2]) : from };
}

function parseLimit(fallback: number): number {
  if (!values.limit) return fallback;
  const n = Number(values.limit);
  if (!Number.isInteger(n) || n < 1) throw new Error('--limit deve ser um inteiro positivo.');
  return n;
}

function buildEngine(config: PipelineConfig, { dryRun = false } = {}): Engine {
  // Na simulação nada é chamado, então não exigimos chave de API.
  const offline = (role: 'generator' | 'verifier') =>
    new FakeProvider(config.llm[role].model, () => {
      throw new Error('simulação: chamada ao LLM desativada');
    });
  return {
    generator: dryRun ? offline('generator') : createProvider(config, 'generator'),
    verifier: dryRun ? offline('verifier') : createProvider(config, 'verifier'),
    generatorPrompt: loadPrompt('generator'),
    verifierPrompt: loadPrompt('verifier'),
    options: {
      locale: config.generation.locale,
      nameStyle: config.generation.nameStyle,
      questionsPerPassage: config.generation.questionsPerPassage,
      maxOutputTokens: config.llm.maxOutputTokens,
      requireHumanReview: config.generation.requireHumanReview,
    },
  };
}

function printStats(stats: import('./generation/persist.js').BatchStats) {
  const q = stats.questions;
  log.info(
    `Passagens: ${stats.passages} (geraram: ${stats.generated}, puladas: ${stats.skipped}, falharam: ${stats.failed})`,
  );
  log.info(
    `Perguntas: ${q.total} — aguardando revisão: ${q.pending_review}, aprovadas: ${q.approved}, reprovadas: ${q.rejected}, repetidas: ${q.duplicates}`,
  );
  const reasons = Object.entries(stats.rejectionReasons);
  if (reasons.length) log.info(`Motivos de reprovação: ${reasons.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  log.info(`Tokens: ${stats.usage.inputTokens} de entrada, ${stats.usage.outputTokens} de saída`);
}

async function withPrisma<T>(config: PipelineConfig, fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = createPrismaClient({ databaseUrl: config.databaseUrl });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const command = positionals[0] ?? 'help';
  if (values.help || command === 'help') {
    process.stdout.write(HELP + BANK_HELP);
    return;
  }
  const config = loadConfig();

  switch (command) {
    case 'download': {
      if (values.journey) {
        const summaries = await downloadJourney(config, { force: values.force });
        const files = summaries.reduce((n, x) => n + x.files, 0);
        const failed = summaries.flatMap((x) => x.failed);
        log.info(`Golem World: ${files} arquivo(s) baixado(s). Próximo passo: pnpm pipeline journey-ingest`);
        for (const f of failed) log.warn(`falhou: ${f.url} — ${f.error}`);
        if (failed.length) process.exitCode = 1;
        return;
      }
      const categories = parseCategories();
      if (!values.title?.length && !categories) {
        throw new Error('Informe --title e/ou --category (o export completo tem ~26 GB).');
      }
      const summary = await downloadBooks(config, {
        ...(values.title ? { titles: values.title } : {}),
        ...(categories ? { categories } : {}),
        force: values.force,
        refreshIndex: values['refresh-index'],
      });
      log.info(
        `${summary.books} livro(s): ${summary.files} arquivo(s) baixado(s) (${(summary.bytes / 1e6).toFixed(1)} MB), ${summary.skipped} já existiam.`,
      );
      for (const f of summary.failed) log.warn(`falhou: ${f.url} — ${f.error}`);
      if (summary.failed.length) process.exitCode = 1;
      return;
    }

    case 'ingest': {
      const categories = parseCategories();
      const options = {
        ...(values.title ? { titles: values.title } : {}),
        ...(categories ? { categories } : {}),
        dryRun: values['dry-run'],
      };
      const results = values['dry-run']
        ? await ingest(config, null, options)
        : await withPrisma(config, (prisma) => ingest(config, prisma, options));
      for (const r of results.filter((r) => r.status === 'skipped')) log.warn(`${r.title}: ignorado — ${r.reason}`);
      const ingested = results.filter((r) => r.status === 'ingested');
      log.info(
        `${ingested.length} livro(s) ingerido(s), ${ingested.reduce((n, r) => n + r.passages, 0)} passagens` +
          (values['dry-run'] ? ' (simulação: nada gravado).' : '.'),
      );
      return;
    }

    case 'generate': {
      const categories = parseCategories();
      const sections = parseSections();
      const engine = buildEngine(config, { dryRun: values['dry-run'] });
      await withPrisma(config, async (prisma) => {
        const passages = await selectPassages(prisma, {
          ...(categories ? { categories } : {}),
          ...(values.title ? { titles: values.title } : {}),
          ...(sections ? { sections } : {}),
          limit: parseLimit(config.generation.batchSize),
          retryFailed: values['retry-failed'],
        });
        if (passages.length === 0) {
          log.info('Nenhuma passagem pendente para esses filtros. Rode "ingest" antes, ou use --retry-failed.');
          return;
        }
        if (values['dry-run']) {
          const req = buildGeneratorRequest(engine, toPassageInput(passages[0]!));
          process.stdout.write(
            `# SYSTEM\n\n${req.system}\n\n# USER\n\n${req.user}\n\n# JSON SCHEMA\n\n${JSON.stringify(req.jsonSchema, null, 2)}\n`,
          );
          log.info(`(simulação) ${passages.length} passagem(ns) seriam enviadas; nada foi chamado nem gravado.`);
          return;
        }
        const wantBatch = values.batch || (config.llm.useBatchApi && !values.sync);
        if (wantBatch && engine.generator.batch) {
          const { batchId, providerBatchId } = await submitBatch(engine, prisma, passages);
          log.info(`Lote enviado: ${passages.length} passagens (lote ${batchId}, provedor ${providerBatchId}).`);
          log.info('Quando terminar (em geral menos de 1 h, no máximo 24 h), rode: pnpm pipeline collect');
          return;
        }
        if (wantBatch) log.warn(`"${engine.generator.name}" não tem Batch API aqui; rodando em modo síncrono.`);
        log.info(`Gerando ${passages.length} passagem(ns) em modo síncrono…`);
        const { batchId, stats } = await runSync(engine, prisma, passages, {
          concurrency: config.llm.maxConcurrency,
          locale: config.generation.locale,
        });
        printStats(stats);
        log.info(`Lote ${batchId}. Para revisar: pnpm pipeline report --batch-id ${batchId}`);
      });
      return;
    }

    case 'journey-ingest': {
      const tracks = parseTracks();
      const options = {
        ...(values.title ? { titles: values.title } : {}),
        ...(tracks ? { tracks } : {}),
        dryRun: values['dry-run'],
      };
      const results = values['dry-run']
        ? await ingestJourney(config, null, options)
        : await withPrisma(config, (prisma) => ingestJourney(config, prisma, options));
      const ingested = results.filter((r) => r.status === 'ingested');
      const missing = results.filter((r) => r.status === 'skipped');
      log.info(
        `${ingested.length} livro(s) das trilhas, ${ingested.reduce((n, r) => n + r.segments, 0)} segmentos ligados à Torá` +
          (values['dry-run'] ? ' (simulação: nada gravado).' : '.'),
      );
      if (missing.length) log.info(`${missing.length} livro(s) sem arquivo ou sem licença aceita: ${missing.map((r) => `${r.title} (${r.reason})`).slice(0, 8).join('; ')}${missing.length > 8 ? '…' : ''}`);
      return;
    }

    case 'translate': {
      const lang = values.lang;
      if (lang !== 'pt' && lang !== 'en' && lang !== 'he') throw new Error('Use --lang pt, --lang en ou --lang he.');
      const dryRun = values['dry-run'];
      const provider = dryRun
        ? new FakeProvider(config.llm.generator.model, () => {
            throw new Error('simulação: chamada ao LLM desativada');
          })
        : createProvider(config, 'generator');
      await withPrisma(config, async (prisma) => {
        if (values.questions) {
          const stats = await translateQuestions(provider, prisma, { locale: lang, limit: parseLimit(200), concurrency: config.llm.maxConcurrency, dryRun });
          log.info(`Perguntas: ${stats.segments} a traduzir; ${stats.translated} traduzidas, ${stats.rejected} reprovadas, ${stats.failed} com erro.`);
          log.info(`Tokens: ${stats.inputTokens} de entrada, ${stats.outputTokens} de saída`);
          return;
        }
        if (lang === 'he') throw new Error('Os textos já estão no original hebraico; em hebraico, só as perguntas da IA (--questions) precisam de tradução.');
        if (values.parasha && !parashaById(values.parasha)) throw new Error(`Parashá desconhecida: "${values.parasha}".`);
        const stats = await translateSegments(provider, prisma, {
          locale: lang,
          tracks: parseTracks() ?? ['torah'],
          ...(values.parasha ? { parashaId: values.parasha } : {}),
          limit: parseLimit(2000),
          concurrency: config.llm.maxConcurrency,
          dryRun,
        });
        log.info(
          `Trechos: ${stats.segments} a traduzir${dryRun ? ' (simulação: nada chamado nem gravado)' : `; ${stats.translated} traduzidos, ${stats.rejected} reprovados, ${stats.failed} com erro`}.`,
        );
        if (!dryRun) log.info(`Tokens: ${stats.inputTokens} de entrada, ${stats.outputTokens} de saída`);
      });
      return;
    }

    case 'journey-generate': {
      const tracks = parseTracks() ?? [...JOURNEY_TRACKS];
      if (values.parasha && !parashaById(values.parasha)) throw new Error(`Parashá desconhecida: "${values.parasha}" (use o id, ex.: bereshit, lech-lecha).`);
      const engine = buildEngine(config);
      const watchMinutes = values.watch ? Number(values.watch) : 0;
      if (values.watch && !(watchMinutes >= 1)) throw new Error('--watch deve ser um número de minutos (1 ou mais).');
      await withPrisma(config, async (prisma) => {
        for (;;) {
          const stats = await generateForJourney(engine, prisma, {
            tracks,
            nodes: parseLimit(3),
            passagesPerNode: 4,
            concurrency: config.llm.maxConcurrency,
            locale: config.generation.locale,
            ...(values.parasha ? { parashaId: values.parasha } : {}),
          });
          if (stats.passages) printStats(stats);
          if (!watchMinutes) return;
          log.info(`Próxima rodada em ${watchMinutes} min (Ctrl+C para parar).`);
          await new Promise((r) => setTimeout(r, watchMinutes * 60_000));
        }
      });
      return;
    }

    case 'collect': {
      const engine = buildEngine(config);
      await withPrisma(config, async (prisma) => {
        const results = await collectBatches(engine, prisma, {
          ...(values['batch-id'] ? { batchId: values['batch-id'] } : {}),
          concurrency: config.llm.maxConcurrency,
          locale: config.generation.locale,
        });
        if (results.length === 0) log.info('Nenhum lote em andamento.');
        for (const r of results) {
          if (r.state === 'still_running') {
            log.info(`Lote ${r.batchId}: ainda processando ${r.counts ? JSON.stringify(r.counts) : ''}`);
          } else {
            log.info(`Lote ${r.batchId}: coletado.`);
            printStats(r.stats!);
          }
        }
      });
      return;
    }

    case 'report': {
      const categories = parseCategories();
      const statuses = (values.status ?? []) as QuestionStatus[];
      const markdown = await withPrisma(config, (prisma) =>
        buildReviewReport(prisma, {
          ...(statuses.length ? { statuses } : {}),
          ...(values['batch-id'] ? { batchId: values['batch-id'] } : {}),
          ...(categories ? { categories } : {}),
          ...(values.title ? { titles: values.title } : {}),
          limit: parseLimit(50),
        }),
      );
      const out = values.out
        ? path.resolve(values.out)
        : path.join(config.outDir, `review-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, markdown);
      log.info(`Relatório salvo em ${out}`);
      return;
    }

    case 'calibrate': {
      const result = await withPrisma(config, (prisma) => calibrate(prisma, { dryRun: values['dry-run'] }));
      log.info(`${result.examined} pergunta(s) com amostra suficiente; ${result.changes.length} mudança(s) de nível.`);
      for (const c of result.changes) {
        log.info(`  ${c.sourceRef}: ${c.from} → ${c.to} (acerto suavizado ${(c.smoothedAccuracy * 100).toFixed(0)}%)`);
      }
      return;
    }

    case 'stats': {
      const { passages, questions } = await withPrisma(config, contentStats);
      const table = (rows: { category: string | null; status: string; _count: { _all: number } }[]) =>
        rows.map((r) => `  ${(r.category ?? 'golem_world').padEnd(16)} ${r.status.padEnd(15)} ${r._count._all}`).join('\n') || '  (vazio)';
      process.stdout.write(`Passagens\n${table(passages)}\n\nPerguntas\n${table(questions)}\n`);
      return;
    }

    case 'seed-demo': {
      await withPrisma(config, async (prisma) => {
        if (values.remove) {
          const r = await removeDemo(prisma);
          log.info(`Perguntas de demonstração removidas: ${r.deleted} apagadas, ${r.retired} já jogadas foram retiradas de circulação.`);
          return;
        }
        const r = await seedDemo(config, prisma, { approve: values.approve });
        if (r.ingestedFixtures.length) log.info(`Trechos de demonstração ingeridos: ${r.ingestedFixtures.join(', ')}.`);
        log.info(
          `${r.created} pergunta(s) de demonstração criada(s)` +
            (r.skipped ? `, ${r.skipped} já existiam` : '') +
            (r.status === 'approved' ? ', já aprovadas.' : '. Aprove-as em /admin para entrarem no jogo.'),
        );
      });
      return;
    }

    case 'bank-build': {
      const corpus = new Corpus([config.sefaria.exportPath, ...(values.export ?? [])]);
      // As parashiot de cada trecho do Midrash Rabá vêm do Golem World (journey-ingest), se o banco de dados estiver no ar.
      const parashotByRef = await withPrisma(config, async (prisma) => {
        const rows = await prisma.studyText.findMany({ where: { track: 'midrash' }, select: { ref: true, parashot: true } });
        return new Map(rows.map((r) => [r.ref, r.parashot]));
      }).catch(() => {
        log.warn('Banco de dados fora do ar: as perguntas "qual parashá o Midrash Rabá comenta" ficam de fora.');
        return new Map<string, string[]>();
      });
      const only = parseCategories();
      const { questions, report } = buildBank(corpus, { ...(only ? { only } : {}), midrash: { parashotByRef } });
      if (!values['dry-run']) writeBank(questions, undefined, only);
      for (const [c, n] of Object.entries(report.kept)) {
        const d = Object.entries(report.byDifficulty[c as CategoryId]).map(([k, v]) => `${k} ${v}`).join(', ');
        log.info(`  ${c.padEnd(16)} ${String(n).padStart(5)}  (${d})`);
      }
      log.info(`Total: ${questions.length} perguntas; ${report.rejected.length} ficaram de fora.`);
      const reasons = new Map<string, number>();
      for (const r of report.rejected) reasons.set(r.reason.replace(/\d[\d:ab]*/g, 'N').slice(0, 100), (reasons.get(r.reason.replace(/\d[\d:ab]*/g, 'N').slice(0, 100)) ?? 0) + 1);
      for (const [r, n] of reasons) log.info(`  fora: ${n}× ${r}`);
      return;
    }

    case 'bank-import': {
      const questions = readBank();
      const stats = await withPrisma(config, (prisma) => importBank(prisma, questions, { approveCurated: values.approve, dryRun: values['dry-run'] }));
      log.info(`Banco: ${stats.created} novas, ${stats.updated} atualizadas, ${stats.unchanged} sem mudança, ${stats.retired} retiradas.`);
      return;
    }

    default:
      throw new Error(`Comando desconhecido: "${command}". Rode: pnpm pipeline help`);
  }
}

main().catch((error) => {
  log.error(errorMessage(error));
  process.exitCode = 1;
});
