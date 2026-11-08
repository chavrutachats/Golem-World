# @trivia/db

Modelo de dados (Prisma 7 + PostgreSQL) e o client compartilhado entre a API e o pipeline.

- `prisma/schema.prisma`: o modelo.
- `prisma/migrations/`: histórico de migrations. Além do que o Prisma gera, elas trazem restrições `CHECK` (4 alternativas por pergunta, gabarito de 0 a 3, idioma da evidência, etc.).
- `src/client.ts`: `createPrismaClient()`, que usa o driver `pg` via `@prisma/adapter-pg`.

| Comando (na raiz) | O que faz |
|---|---|
| `pnpm db:migrate` | Aplica as migrations no banco de desenvolvimento (e cria novas quando o schema muda) |
| `pnpm db:deploy` | Aplica migrations em produção |
| `pnpm db:generate` | Gera o client em `src/generated/prisma` e compila o pacote |
| `pnpm db:studio` | Abre o Prisma Studio |

A URL do banco vem de `DATABASE_URL` no `.env` da raiz.
