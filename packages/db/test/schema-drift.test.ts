/**
 * O banco migrado bate com o schema.prisma? Compara cada modelo com a tabela real
 * (colunas, tipos, nulos) e cada enum com o tipo do Postgres. Pega erro de digitação
 * numa migration escrita à mão antes que ele vire erro em produção.
 *
 * Roda quando TEST_DATABASE_URL aponta para um banco já migrado (como os testes e2e).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = readFileSync(fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)), 'utf8');

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  dbType: string | null;
}

/** Leitor mínimo do schema: blocos `model` e `enum`, campos escalares (sem relações). */
function parseSchema(src: string) {
  const clean = src.replace(/\/\/.*$/gm, '');
  const enums = new Map<string, string[]>();
  for (const m of clean.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
    enums.set(m[1]!, m[2]!.split(/\s+/).filter(Boolean));
  }
  const modelNames = [...clean.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
  const models = new Map<string, Field[]>();
  for (const m of clean.matchAll(/^model\s+(\w+)\s*\{([^}]*)\}/gm)) {
    const fields: Field[] = [];
    for (const line of m[2]!.split('\n')) {
      const f = line.trim().match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!f || f[1]!.startsWith('@@')) continue;
      const [, name, type, list, optional, rest] = f;
      if (modelNames.includes(type!) || rest!.includes('@relation')) continue;
      fields.push({ name: name!, type: type!, list: !!list, optional: !!optional, dbType: rest!.match(/@db\.(\w+)/)?.[1] ?? null });
    }
    models.set(m[1]!, fields);
  }
  return { enums, models };
}

/** O tipo do Postgres que o Prisma usa para cada tipo do schema. */
function expectedUdt(field: Field, enums: Map<string, string[]>): string {
  if (enums.has(field.type)) return field.list ? `_${field.type}` : field.type;
  const db = field.dbType;
  const base = (() => {
    switch (field.type) {
      case 'String':
        return db === 'Uuid' ? 'uuid' : db === 'VarChar' ? 'varchar' : db === 'Char' ? 'bpchar' : 'text';
      case 'Int':
        return db === 'SmallInt' ? 'int2' : 'int4';
      case 'BigInt':
        return 'int8';
      case 'Float':
        return 'float8';
      case 'Boolean':
        return 'bool';
      case 'DateTime':
        return db === 'Date' ? 'date' : 'timestamp';
      case 'Json':
        return 'jsonb';
      case 'Decimal':
        return 'numeric';
      default:
        throw new Error(`Tipo sem mapeamento no teste: ${field.type}`);
    }
  })();
  return field.list ? `_${base}` : base;
}

describe.skipIf(!url)('schema.prisma × banco migrado', () => {
  const client = new pg.Client({ connectionString: url });
  const { enums, models } = parseSchema(SCHEMA);
  let columns: Map<string, Map<string, { udt: string; nullable: boolean }>>;
  let dbEnums: Map<string, string[]>;

  beforeAll(async () => {
    await client.connect();
    const cols = await client.query<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(
      `select table_name, column_name, udt_name, is_nullable from information_schema.columns where table_schema = current_schema()`,
    );
    columns = new Map();
    for (const c of cols.rows) {
      if (!columns.has(c.table_name)) columns.set(c.table_name, new Map());
      columns.get(c.table_name)!.set(c.column_name, { udt: c.udt_name, nullable: c.is_nullable === 'YES' });
    }
    const en = await client.query<{ typname: string; label: string }>(
      `select t.typname, e.enumlabel as label from pg_type t join pg_enum e on e.enumtypid = t.oid
       join pg_namespace n on n.oid = t.typnamespace where n.nspname = current_schema() order by t.typname, e.enumsortorder`,
    );
    dbEnums = new Map();
    for (const r of en.rows) dbEnums.set(r.typname, [...(dbEnums.get(r.typname) ?? []), r.label]);
  });

  afterAll(() => client.end());

  it('cada modelo tem a sua tabela, e nenhuma tabela sobra', () => {
    const tables = [...columns.keys()].filter((t) => t !== '_prisma_migrations').sort();
    expect(tables).toEqual([...models.keys()].sort());
  });

  it('cada campo tem a coluna com o mesmo tipo e a mesma regra de nulo', () => {
    const problems: string[] = [];
    for (const [model, fields] of models) {
      const table = columns.get(model);
      if (!table) continue;
      for (const f of fields) {
        const col = table.get(f.name);
        if (!col) {
          problems.push(`${model}.${f.name}: coluna ausente`);
          continue;
        }
        const udt = expectedUdt(f, enums);
        if (col.udt !== udt) problems.push(`${model}.${f.name}: ${col.udt} no banco, ${udt} no schema`);
        // Listas do Prisma são NOT NULL só com @default; o Postgres guarda arrays como anuláveis sem default.
        if (!f.list && col.nullable !== f.optional) problems.push(`${model}.${f.name}: nulo ${col.nullable} no banco, ${f.optional} no schema`);
      }
      for (const name of table.keys()) {
        if (!fields.some((f) => f.name === name)) problems.push(`${model}.${name}: coluna sobrando no banco`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('enums com os mesmos valores', () => {
    // A ordem pode diferir: valores acrescentados depois (ALTER TYPE … ADD VALUE) entram no fim.
    for (const [name, values] of enums) expect([...(dbEnums.get(name) ?? [])].sort(), name).toEqual([...values].sort());
  });
});
