# apps/api

API do jogo em NestJS 12 (ESM), com Prisma 7 e PostgreSQL. O servidor tem autoridade total: sorteia a roleta, escolhe e embaralha as perguntas, controla o prazo e corrige. O app nunca recebe o gabarito antes de responder.

## Rodando

```bash
pnpm db:up && pnpm db:migrate && pnpm db:generate   # banco pronto (uma vez)
pnpm api:dev                                        # http://localhost:3000, recarrega ao salvar
```

Em produção: `pnpm --filter @trivia/api build` e `pnpm --filter @trivia/api start`, com `NODE_ENV=production`. A API se recusa a subir com os segredos de exemplo do `.env.example` (em qualquer ambiente) e, em produção, com CORS sem https. O checklist completo está em [`docs/SECURITY.md`](../../docs/SECURITY.md).

A página de revisão humana fica em **http://localhost:3000/admin**: entra só quem tem conta de revisor (`pnpm reviewers create --email … --name …`). A página pública de exclusão de conta, exigida pelo Google Play, fica em **/conta/excluir**.

## Endpoints

Todos, exceto `/auth/*` (menos `logout-all`), `/health` e as páginas `/admin` e `/conta/excluir`, exigem `Authorization: Bearer <accessToken>`. As rotas `/admin/api/*` exigem, além disso, uma conta com papel de revisor ou admin. Os formatos de entrada e saída são os schemas de `@trivia/shared` (`api-contracts.ts`).

| Método e rota | O que faz |
|---|---|
| `POST /auth/guest` | Cria conta de convidado e devolve tokens |
| `POST /auth/register` | Cadastro com e-mail e senha; com token de convidado no header, promove o convidado (mantém o progresso) |
| `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` | Login, renovação (o refresh token gira a cada uso) e saída |
| `POST /auth/logout-all` | Encerra as sessões da conta em todos os aparelhos |
| `GET /me` · `PATCH /me` | Perfil e estatísticas; troca do nome de exibição |
| `POST /me/password` | `{ currentPassword, newPassword }`: troca a senha, derruba as outras sessões e devolve tokens novos |
| `POST /me/delete` | `{ confirm: true, password? }`: exclui a conta (cadastrada confirma com a senha) |
| `POST /games` | `{ mode: "solo" \| "random" \| "friend", inviteCode? }`: cria partida, entra na fila aleatória ou entra por convite |
| `GET /games` | Minhas partidas (as que estão na minha vez primeiro) |
| `GET /games/:id` | Estado da partida com a `phase` (o que fazer agora) |
| `POST /games/:id/spin` | Gira a roleta (fase `spin`) |
| `POST /games/:id/question` | `{ spinId }`: pergunta da categoria sorteada (fase `spun`) |
| `GET /games/:id/question` | Reabre a pergunta em andamento (mesmo prazo, mesma ordem) |
| `POST /games/:id/crown` | `{ category }`: disputa de selo (fase `choose_crown`) |
| `POST /games/:id/answer` | `{ playId, optionIndex \| null }`: corrige e devolve gabarito, explicação e fonte |
| `POST /games/:id/forfeit` | Desistir |
| `GET /ranking?period=week\|all` | Ranking semanal (zera segunda 00:00 em `RANKING_TIMEZONE`) ou geral |
| `POST /questions/report` | `{ playId, reason, comment? }`: denuncia uma pergunta já respondida |
| `GET /admin/api/me` | Quem é o revisor logado |
| `GET /admin/api/questions` | Fila de revisão (filtros: `status`, `category`, `book`, `limit`, `offset`) |
| `POST /admin/api/questions/:id/review` | Aprovar ou reprovar, com edições opcionais |
| `POST /admin/api/questions/bulk-review` | Aprovar ou reprovar em lote |
| `GET /admin/api/reports` · `POST /admin/api/reports/:id/resolve` | Denúncias abertas e resolução |
| `GET /admin/api/stats` | Contagem de perguntas e passagens por categoria e status |

Erros de regra de negócio voltam com um `code` estável (`NOT_YOUR_TURN`, `WRONG_PHASE`, `ALREADY_ANSWERED`, `NO_QUESTIONS`, `INVITE_NOT_FOUND`, `WEAK_PASSWORD`, `WRONG_PASSWORD`…) e uma `message` em português. Passar de um limite de requisições devolve **429** com `code: "RATE_LIMITED"` e o header `Retry-After` (segundos). Senha errada em rota autenticada (troca de senha, exclusão) devolve **422**, nunca 401, para o app não confundir com sessão vencida.

## Fases da partida

O campo `phase` de `GET /games/:id` diz ao app o que mostrar:

| Fase | Próximo passo |
|---|---|
| `waiting_opponent` | Aguardar o adversário (mostrar o `inviteCode` no modo amigo) |
| `spin` | Girar a roleta |
| `spun` | Pedir a pergunta do `pendingSpin` |
| `question` | Responder a pergunta `pendingPlayId` |
| `choose_crown` | Escolher a categoria do selo |
| `opponent_turn` | Aguardar |
| `finished` | Mostrar o resultado (`winnerUserId`) |

Prazos vencidos são aplicados na próxima ação ou consulta: pergunta aberta além do tempo conta como erro, e 48 h sem jogar a vez dão a vitória ao adversário.

## Testes

```bash
pnpm --filter @trivia/api test
```

`test/rules.test.ts` cobre as regras puras e `test/security.unit.test.ts` o limitador, as senhas e a configuração. `test/e2e.test.ts` joga partidas completas e `test/security.e2e.test.ts` testa cabeçalhos, limites, sessões, exclusão de conta, revisores, denúncias e limpeza, os dois contra um PostgreSQL de verdade, com relógio e sorteio controlados; rodam quando `TEST_DATABASE_URL` aponta para um banco de teste migrado e **diferente** do de desenvolvimento.

## Decisões

- **Injeção explícita (`@Inject(...)`) em todos os construtores.** Assim a injeção de dependências não depende de metadados de decorator, e o código roda igual com `tsc`, `tsx` e Vitest.
- **Uma transação com `SELECT … FOR UPDATE` por ação.** Dois toques rápidos ou os dois jogadores ao mesmo tempo nunca corrompem a partida.
- **Sorteio com `crypto.randomInt`.** O resultado da roleta não é previsível pelo cliente.
- **Senhas com scrypt** (`node:crypto`, N=2^15, r=8, p=3), sem dependência nativa; hashes antigos são refeitos no login.
- **Segurança em `src/security/`**: limite de requisições (guard por IP antes da autenticação, interceptor por conta depois), cabeçalhos e limites HTTP, limpeza periódica. Detalhes em [`docs/SECURITY.md`](../../docs/SECURITY.md).
- **Categorias sem perguntas aprovadas ficam fora da roleta** e da escolha da Coroa, para a partida nunca travar. Para vencer por selos, são necessárias perguntas aprovadas nas 6 categorias.
