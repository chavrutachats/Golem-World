# Contas e login social (Fase 10)

Três jeitos de entrar, que podem conviver na mesma conta:

| Jeito | Onde funciona |
|---|---|
| **Convidado** (sem nada) | Em todo lugar. A conta vive só no aparelho até o jogador guardá-la |
| **E-mail e senha** | Em todo lugar |
| **Google, Apple, Facebook** | No app instalado (build de desenvolvimento ou de loja) e na web em `https://` ou `localhost`. A Apple, só no iPhone |

## Como o servidor confere

O app nunca diz "sou fulano do Google": ele manda ao servidor o que o provedor entregou, e o servidor confere com o próprio provedor (`apps/api/src/auth/social/verifiers.ts`).

- **Google e Apple**: ID token (JWT). A assinatura é conferida contra as chaves públicas do provedor (JWKS, com cache), junto com o emissor, o público (precisa ser um dos ids de cliente **deste** app) e a validade.
- **Nonce**: o app gera um nonce aleatório e manda ao provedor só o SHA-256 dele. O token volta com esse hash, e o servidor confere contra o nonce original, que só o app conhecia. Um token roubado de outro login não serve aqui. Na Apple é obrigatório; no Google, o SDK nativo não manda nonce, o login da web manda.
- **Facebook**: access token conferido na Graph API (`debug_token`) com o token do app. O token precisa ter sido emitido para **este** app, senão um token de qualquer outro app com login do Facebook serviria para entrar aqui.
- Falha de conferência responde 422 `SOCIAL_INVALID`; provedor fora do ar, 503 `SOCIAL_UNAVAILABLE`.

## Contas

- **Sem sessão**: entra na conta ligada a esse login. Se não houver, cria uma conta nova com o **primeiro nome** que o provedor informar (o nome completo apareceria no ranking) e o e-mail, se o provedor garantir que ele é confirmado.
- **Com sessão** (convidado ou conta completa): liga o login à conta aberta. O convidado vira conta completa e **mantém pontos, partidas, moedas e itens**. No perfil, "Guarde seu progresso com um toque".
- **Nada de juntar contas pelo e-mail sem o jogador pedir.** Se o e-mail confirmado já pertence a uma conta com senha, o login é recusado (`ACCOUNT_EXISTS`): o jogador entra com a senha e conecta o provedor no perfil. Juntar automaticamente abriria a porta para quem controla aquele e-mail num provedor tomar uma conta de outro lugar.
- Uma conta do Google (ou da Apple, ou do Facebook) fica ligada a um jogador só (`UserIdentity`, único por provedor + id no provedor), e cada jogador tem no máximo um login de cada provedor.
- **Desconectar** só se sobrar outro jeito de entrar (senha ou outro login): `LAST_LOGIN`.
- Conta criada por login social não tem senha: o app esconde "Trocar senha" e a exclusão da conta não pede senha.
- Excluir a conta apaga os logins ligados.

## O que não existe, e por quê

- **Instagram**: a Meta encerrou em 2024 a API de login de contas pessoais do Instagram (a Basic Display API). O que restou é para contas profissionais gerenciarem conteúdo, não para entrar em apps. Quem usa Instagram entra com a conta do Facebook ligada a ele.
- **Login social na rede de casa (`pnpm lan`)**: Google e Facebook só devolvem o login para endereços cadastrados em `https://` ou `localhost`. Pelo `http://192.168.x.x:3000` os botões não aparecem; o jogo funciona como convidado e com e-mail e senha.
- **Expo Go**: os módulos nativos do Google e da Apple não existem nele, e o retorno do Facebook (`fb<id>://`) só entra no app instalado.

## Como configurar

Servidor (`.env` da raiz):

| Variável | Para quê |
|---|---|
| `GOOGLE_CLIENT_IDS` | Ids de cliente OAuth do app no Google Cloud (web, iOS, Android), separados por vírgula |
| `APPLE_SIGNIN_CLIENT_IDS` | Quem pode receber o token da Apple: o bundle id (vazio = `APPLE_BUNDLE_ID`) e, se houver, o Services ID |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | App no Meta for Developers (os dois juntos) |

Sem as variáveis de um provedor, `GET /auth/providers` diz que ele está desligado e o botão não aparece.

App (no build, por exemplo nos *secrets* do EAS):

| Variável | Para quê |
|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Id de cliente **web**: é para ele que o Google emite o ID token, no app e na web |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Id de cliente iOS (o `app.config.ts` monta o esquema de retorno a partir dele) |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` | Id do app no Meta (o `app.config.ts` acrescenta o esquema `fb<id>`) |

Do lado dos provedores:

- **Google Cloud**: crie os clientes OAuth web, iOS e Android (este com o SHA-1 do certificado de assinatura do app). No cliente web, cadastre as origens e endereços de retorno da versão web em `https://`.
- **Apple Developer**: ligue "Sign in with Apple" no App ID. A App Store exige o login da Apple em apps que oferecem Google ou Facebook.
- **Meta for Developers**: produto "Login do Facebook", com o endereço de retorno da web e `fb<id>://authorize`.

## Arquivos

- Servidor: `apps/api/src/auth/social/` (verificadores e serviço), rotas `GET /auth/providers`, `POST /auth/social` (com token de sessão = ligar à conta aberta) e `DELETE /me/identities/:provider`.
- Banco: `UserIdentity` (`packages/db/prisma/migrations/20261104120000_social_login`).
- App: `src/lib/social/` (um adaptador por provedor e plataforma, mais o nonce) e `src/components/social/` (botões, "Contas conectadas").
