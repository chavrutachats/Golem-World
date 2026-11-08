# Segurança

O que o projeto protege, como, o que conferir antes de publicar e o que ainda fica de fora.

## O que está em jogo

| Ativo | Ameaça principal | Onde se defende |
|---|---|---|
| Contas e sessões | Senha adivinhada, token roubado, sessão esquecida num aparelho | Política de senha, limite de tentativas, sessões revogáveis |
| Integridade da partida e do ranking | App adulterado, requisições repetidas, ler o gabarito no tráfego | Servidor decide tudo; trava por partida; gabarito só depois da resposta |
| O acervo de perguntas | Vandalismo por denúncia em massa, revisor indevido | Denunciante confiável, disjuntor, revisores com conta pessoal |
| Dados pessoais (e-mail, apelido) | Vazamento, retenção sem motivo | Mínimo de dados, exclusão de conta, limpeza periódica, logs sem e-mail |
| O servidor | Enxurrada de requisições, corpo gigante, conexões lentas | Limites por IP e por conta, corpo de 16 KB, timeouts |

## Contas, senhas e sessões

- **Senha nova** (cadastro e troca): pelo menos 12 caracteres, sem regras de composição, seguindo OWASP ASVS e NIST SP 800-63B. São recusadas sequências óbvias (`123456789012`), poucas letras repetidas, senhas que contêm o e-mail ou o nome da pessoa, e as que estão numa lista de ~19 mil senhas vazadas ou comuns (NCSC/SecLists), inclusive com números no fim (`iloveyou2026!!`).
- **Hash**: scrypt com N=2^15, r=8, p=3 (OWASP Password Storage Cheat Sheet). Hashes com parâmetros antigos são refeitos no próximo login certo. No máximo 2 hashes rodam ao mesmo tempo, para uma enxurrada de logins não travar o servidor. Um hash adulterado no banco que pedisse mais de 64 MB ou CPU demais é recusado sem calcular.
- **Login**: leva o mesmo tempo com e sem conta (hash falso para e-mail inexistente). Senhas erradas: 5 por conta e endereço em 15 min, 30 por conta em 1 h vindo de qualquer lugar. A tentativa é contada antes de conferir a senha, então tentativas em paralelo não furam o limite; login certo devolve a tentativa. O contador vale também para e-mails sem conta, então o bloqueio não revela quem tem conta. A chave do contador é um HMAC do e-mail com um segredo do servidor: o e-mail não fica em memória nem no log, e não dá para testar e-mails candidatos contra o log.
- **Token de acesso**: JWT HS256 de 15 minutos, só em memória no app. Leva a versão de sessão do usuário; o servidor confere conta, versão e papel no banco a cada requisição. Tokens com `alg: none`, outra chave ou assinatura trocada são recusados.
- **Refresh token**: 48 bytes aleatórios, guardado no banco só como HMAC, gira a cada uso. Nos 60 s seguintes, o token anterior pode ser trocado uma única vez por um par novo (resposta perdida na rede, duas abas do navegador renovando juntas). Qualquer outro reuso é tratado como vazamento: todas as sessões caem, inclusive os tokens de acesso. Cada conta tem no máximo 10 sessões abertas.
- **Encerrar sessões**: "Sair de todos os aparelhos", troca de senha, exclusão de conta, senha nova dada por um admin e retirada do papel de revisor derrubam todos os tokens na hora, inclusive o que acabou de girar e ainda estava na tolerância.

- **Login social** (Google, Apple, Facebook): o servidor confere o token com o provedor (assinatura JWKS, emissor, público deste app, validade e nonce; no Facebook, `debug_token` com o token do app). Nada de juntar contas pelo e-mail sem o jogador pedir. Detalhes em [`AUTH.md`](AUTH.md).

## Limites de requisição

Respondem 429 com `code: "RATE_LIMITED"`, mensagem com o tempo de espera e o header `Retry-After`. Os de IP são generosos para não punir uma sinagoga ou escola inteira no mesmo Wi-Fi; os de conta e e-mail são os que barram força bruta. IPv6 conta por /64. Todos ficam em `apps/api/src/security/rate-limit.ts`.

| Limite | Valor |
|---|---|
| Qualquer rota, por IP | 600 por minuto |
| Criar convidado, por IP | 30 por hora e 150 por dia |
| Cadastro, por IP | 10 por hora |
| Login, por IP | 30 por 15 min |
| Login social, por IP | 60 por hora |
| Pedras do Choshen, por conta | 240 por hora (começar ou terminar partida) |
| Senha errada, por conta e IP / por conta | 5 por 15 min / 30 por hora |
| Renovar sessão, por IP | 300 por hora |
| Qualquer rota autenticada, por conta | 300 por minuto |
| Criar ou entrar em partida, por conta | 30 por hora |
| Trocar nome / trocar senha / excluir conta | 10 / 5 / 5 por hora |
| Denúncias, por conta | 20 por dia (contado no banco) |
| Revisão, por revisor | 600 por minuto |

Os contadores ficam em memória, num único processo, com teto de 200 mil chaves. Quando a memória enche, saem primeiro as chaves vencidas ou longe do limite; as que estão bloqueando alguém (uma conta sob força bruta) são as últimas. Com mais de uma instância da API, implemente `RateLimitStore` com Redis (a interface tem três métodos).

## Jogo

- O servidor sorteia a roleta (`crypto.randomInt`), escolhe e embaralha a pergunta, controla o prazo e corrige. O app recebe a pergunta sem gabarito e sem a referência da fonte.
- Cada giro só pode ser usado uma vez; cada ação trava a partida (`SELECT … FOR UPDATE`).
- Toda rota de partida confere se a conta joga nela (o id de uma partida alheia dá 404). Só se responde e denuncia a própria pergunta.
- Códigos de convite: 6 caracteres (~887 milhões de combinações), aleatórios, válidos só enquanto a partida espera adversário e no máximo 7 dias (conferido na hora de entrar). Cada conta cria ou entra em no máximo 30 partidas por hora, o que torna inútil chutar códigos.

## Compras e anúncios (Fase 9)

- O app nunca diz "comprei" nem "assisti": o servidor confere a compra com a loja (JWS da Apple verificado contra os certificados raiz, com checagem de revogação; Play Developer API no Google) e o anúncio com o Google (SSV assinado com ECDSA). Detalhes em [`ECONOMY.md`](ECONOMY.md).
- Cada compra é entregue uma vez (chave única loja + transação), e cada compra é ligada à conta que a fez: o comprovante de uma conta não vale em outra.
- Saldos só descem com condição na própria atualização e nunca ficam negativos (CHECK no banco); toda mudança fica no extrato com chave de idempotência.
- Prêmio de anúncio: decidido e mostrado antes, fixo pelo contexto (HMAC com chave do servidor), resgatado uma vez, com teto diário por lugar.
- Em produção, a API não sobe com anúncio ou compra de demonstração (`ADS_MODE=demo`/`trust-client`, `STORE_MODE=demo`).
- Anúncios só não personalizados e com classificação livre (sem perfilamento de menores, ECA Digital).

## Pedras do Choshen (Fase 11)

- O app nunca diz quantos pontos fez. Ele manda as jogadas, e o servidor refaz a partida com o mesmo motor determinístico, a partir da semente que ele mesmo sorteou (`crypto.randomInt`). Jogada inválida ou depois do fim recusa o envio.
- Moedas só pelas estrelas novas de cada fase, com chave de idempotência; a partida fica travada durante a conferência.
- As fases abrem em ordem, e as jogadas a mais só valem com o anúncio resgatado para aquela partida.
- Limite: 240 partidas (começar ou terminar) por hora, por conta.

## Revisão humana e denúncias

- **Sem chave compartilhada.** Cada revisor tem conta própria, com papel `reviewer` ou `admin`, criada só por quem tem acesso ao servidor (`pnpm reviewers create`). Nenhuma rota HTTP muda papéis. O papel é lido do banco a cada requisição, e toda decisão (aprovar, reprovar, resolver denúncia) fica registrada com quem decidiu.
- **Denúncias à prova de abuso**: só denunciantes confiáveis (cadastrados há 3 dias, contando do cadastro com e-mail e não da criação do convidado, e com 30 respostas; revisores sempre) tiram perguntas de circulação sozinhos, com disjuntor de 20 retiradas automáticas por dia no jogo e 5 por pessoa, conferido sob trava no banco. As demais vão para a fila, as de desrespeito no topo. Regras completas em [`CONTENT_POLICY.md`](CONTENT_POLICY.md).
- **Apelidos**: só letras latinas (com acentos) e hebraicas, algarismos e alguns sinais; outros alfabetos ficam de fora porque têm letras iguais às latinas ("Аdmin" com A cirílico). Nomes que imitam a equipe e ofensas (português e inglês, com atenção ao antissemitismo) são recusados, mesmo disfarçados (`4dm1n`, `a.d.m.i.n`, `Hıtler`). Apelidos que passarem são trocados com `pnpm reviewers reset-name`.

## Dados pessoais e exclusão de conta

- O jogo guarda o mínimo: apelido, e-mail e hash de senha (só contas cadastradas) e o histórico de jogo. O banco não guarda IP, aparelho nem localização; só o log de bloqueios registra o IP de quem passou de um limite.
- **Exclusão de conta** no app (Perfil, Conta e segurança) e na web em `/conta/excluir`, como pedem a App Store (diretriz 5.1.1(v)) e o Google Play. Apaga e-mail, senha, apelido, pontos, sessões e comentários de denúncias; a conta cai primeiro e depois as partidas em andamento terminam com vitória do adversário. A linha do usuário fica anonimizada ("Conta excluída") para não destruir o histórico dos adversários; dado anonimizado não é dado pessoal (LGPD, art. 12). O e-mail fica livre para um cadastro novo.
- **Limpeza a cada 6 horas**: refresh tokens vencidos, convites parados há 7 dias e convidados com mais de 30 dias que nunca jogaram.
- **Logs de segurança** (`[security]`): reuso de refresh token, bloqueios por limite (no máximo um por minuto por chave), disjuntor de denúncias, troca de senha, exclusão de conta. Identificam a conta pelo id, nunca pelo e-mail; os limites por e-mail usam um HMAC do e-mail como chave.

## HTTP

- Cabeçalhos em todas as respostas: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, sem `X-Powered-By`, e HSTS em produção.
- As páginas `/admin` e `/conta/excluir` têm CSP própria: só script do mesmo servidor, nada inline, sem formulário para outro domínio, sem iframe. Todo texto vindo do banco é inserido como texto, nunca como HTML.
- Corpo JSON de no máximo 16 KB; cabeçalhos em até 15 s e requisição em até 30 s.
- CORS só para `CORS_ORIGINS` (em produção, só `https://`), só com os métodos e cabeçalhos usados.

## App

- Refresh token no chaveiro do aparelho com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: não vai para backup do iCloud nem para outro aparelho. Quem já tinha o app ganha a proteção na primeira abertura (o token vai para um item novo do chaveiro e o antigo é apagado). No Android, `allowBackup: false`.
- Builds de produção só falam com a API por `https://` (o app se recusa a mandar qualquer dado por http); a única exceção é o próprio aparelho (`localhost`), para testar o build no computador.
- A sessão guardada só é apagada quando a API diz que ela acabou. Rede fora, 429 ou erro do servidor mostram "Tentar de novo", para um convidado não perder a conta.
- Toda resposta da API é validada contra os schemas de `@trivia/shared`. O link da fonte só abre `https://www.sefaria.org/`.
- Nenhum segredo vai no app: só `EXPO_PUBLIC_API_URL`.

## Pipeline e dependências

- Caminhos montados a partir do `books.json` (dado baixado da internet) não saem da pasta do export, e downloads só vão por https para os servidores configurados, sem seguir redirecionamentos e com teto de 300 MB por arquivo, conferido enquanto o arquivo chega.
- A saída do LLM é tratada como dado: validada por schema, conferida contra o texto-fonte, verificada por outro modelo e revisada por uma pessoa antes de ir ao jogo. O app mostra tudo como texto.
- O pnpm só deixa rodar scripts de instalação dos pacotes listados em `onlyBuiltDependencies`.
- O `decode-uri-component@0.2.2` com o CVE-2026-45822, que era corrigido por um patch, saiu da árvore com o expo-router 58.

## Checklist para publicar

1. `NODE_ENV=production`. Segredos gerados por `pnpm secrets:init` (ou pelo cofre de segredos da hospedagem), diferentes dos de desenvolvimento.
2. API atrás de HTTPS. Se houver proxy reverso ou CDN na frente, `TRUST_PROXY` com o número de proxies (ex.: `1`) ou o IP do proxy; sem isso, todos os jogadores parecem o mesmo IP e o limite por IP pega todo mundo. E só o proxy pode alcançar a porta da API (`HOST=127.0.0.1` com o proxy na mesma máquina, ou firewall): quem falar direto com a API poderia forjar o IP no `X-Forwarded-For`. A API avisa no log quando `TRUST_PROXY` está ligado e ela escuta em todas as interfaces.
3. `CORS_ORIGINS` só com a origem `https://` da versão web (ou vazio, se não houver versão web).
4. Banco gerenciado com TLS (`?sslmode=require`), sem porta aberta para a internet, com backup. A API conecta com um usuário que não altera tabelas; as migrations rodam com outro:
   ```sql
   CREATE ROLE trivia_app LOGIN PASSWORD '…';
   GRANT CONNECT ON DATABASE trivia_torah TO trivia_app;
   GRANT USAGE ON SCHEMA public TO trivia_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trivia_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trivia_app;
   ```
5. App: `EXPO_PUBLIC_API_URL` com `https://` no build de produção.
6. Revisores criados com `pnpm reviewers create`; peça para cada um trocar a senha no app. Para tirar alguém: `pnpm reviewers revoke`.
7. Nas lojas: link de exclusão de conta (`https://<sua-api>/conta/excluir`) no Google Play Console e política de privacidade publicada.
8. Mais de uma instância da API: troque o `RateLimitStore` por Redis.
9. Rode `pnpm audit` antes de cada versão.
10. Login social: só os ids de cliente do próprio app em `GOOGLE_CLIENT_IDS` e `APPLE_SIGNIN_CLIENT_IDS`; o segredo do Facebook fica só no servidor (nunca em `EXPO_PUBLIC_*`).
11. Compras e anúncios: `STORE_MODE=live` com as lojas configuradas, `AppleRootCA-G3.cer` em `certs/apple`, `ADS_MODE=admob` e o endereço de SSV (`https://<sua-api>/rewards/ssv`) em cada bloco com prêmio no AdMob.

## O que ainda fica de fora

- **Recuperação de senha e verificação de e-mail.** Precisam de um provedor de e-mail. Até lá, quem perder a senha recebe uma nova de um admin (`pnpm reviewers reset-password`, depois de confirmar a identidade por outro canal), e qualquer pessoa pode cadastrar um e-mail que não é dela (que fica preso até a exclusão).
- **Bloqueio de conta por tentativas.** Quem souber o e-mail de alguém pode, com 30 senhas erradas vindas de vários endereços, bloquear o login dessa conta por até 1 hora (inclusive com a senha certa). As sessões já abertas continuam funcionando. É a troca comum para impedir força bruta distribuída.
- **O cadastro diz "este e-mail já está cadastrado"**, o que revela quais e-mails têm conta. É a troca comum sem verificação de e-mail; o limite de 10 cadastros por hora por IP reduz a varredura.
- **Bots que decoram respostas.** O gabarito aparece depois de cada pergunta (é parte do jogo). Um banco grande de perguntas e o anti-repetição reduzem a vantagem, mas não a eliminam.
- **Versão web**: o refresh token fica no `localStorage` do navegador (não há chaveiro na web). O app web não injeta HTML, mas a página do Expo Web não tem CSP própria.
- **Revisores sem segundo fator (2FA).** Use senhas geradas e troque a de quem sair da equipe.
- **Moderação de apelidos** é por lista; não pega tudo, nem nomes em hebraico.
- **Ferramentas de desenvolvimento do Expo:** o `@expo/cli` e o `@expo/fingerprint` do SDK 58 pedem `glob` 13 e `minimatch` 10, com falhas conhecidas (GHSA-3g3m-2fjr-6pw4 e negação de serviço no minimatch). O `pnpm-workspace.yaml` força `glob` 14 e `minimatch` 11, que corrigem e mantêm a API; `pnpm audit` fica limpo.
- **Pedido de cópia dos dados (LGPD, art. 18, II)** não tem tela: atenda por e-mail com uma consulta ao banco.
- Não foi feito teste de invasão nem teste de carga.

## Como reportar uma vulnerabilidade

Não abra issue pública. Escreva direto para o responsável pelo projeto, com os passos para reproduzir.
