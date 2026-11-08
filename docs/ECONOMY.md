# Economia, loja e anúncios (Fase 9)

Como o jogo ganha dinheiro sem tirar a justiça da roleta nem o mérito do estudo.

## Duas moedas

| | Moedas de sabedoria | Shekels |
|---|---|---|
| Como se ganha | Estudando: cada obstáculo vencido no Golem World e cada fase concluída; estrelas novas no Pedras do Choshen | Comprando (App Store / Google Play) ou, aos poucos, em anúncios com prêmio |
| O que compra | Equipamentos do armário (vantagens só no Golem World) e os **personagens da própria história** (Adão, Eva, a Serpente…), depois de estudar a parashá onde aparecem | Material do Golem (barro do Nilo, cobre do Mishkan…), **personagens visitantes** (Davi, Ester, Mordecai, Jonas), vidas da roleta e ajudas do Golem World |
| No código | `User.coins` | `User.shekels` |

Regra que um teste garante (`packages/shared/test/economy.test.ts`): **nada que se compra com shekels dá vantagem**. Material e personagens só mudam o visual; vidas e ajudas valem fora da partida da roleta (as ajudas, só no Golem World). Na roleta todo mundo joga igual.

Os personagens são fantasias, como no Purim: cobrem cabeça, corpo e mão, e os itens vestidos continuam valendo por baixo. Cada um traz o versículo de onde vem, com link para o Sefaria. Nenhuma peça tem texto (nem o tzitz do Kohen Gadol).

## Extrato e entregas únicas

Toda mudança de saldo passa por `WalletService.apply` (`apps/api/src/economy/wallet.service.ts`):

- o desconto só acontece se houver saldo, numa única atualização condicional (dois toques simultâneos não gastam duas vezes), e o banco ainda recusa saldo negativo (CHECK);
- cada mudança vira uma linha de `WalletEntry`, com motivo, referência e o saldo depois;
- com chave de idempotência, a mesma entrega não acontece duas vezes: `purchase:<loja>:<transação>`, `reward:<oferta>`, `journey:<resposta>`, `completion:<fase>`, `puzzle:<partida>`.

## Compras com dinheiro

Produtos (`STORE_PRODUCTS`): `shekels_120`, `shekels_650`, `shekels_1400` (consumíveis) e `no_ads` (permanente). Os mesmos ids precisam existir na App Store Connect e no Google Play Console; o preço de cada país vem da loja.

1. O app compra pela loja (expo-iap), ligando a compra à conta do jogo (`appAccountToken` na Apple, `obfuscatedAccountId` no Google).
2. Manda o comprovante para `POST /store/purchases`. O app nunca diz "comprei".
3. O servidor confere com a loja:
   - **Apple**: a transação assinada (JWS do StoreKit 2) é verificada com a biblioteca oficial (`@apple/app-store-server-library`) contra os certificados raiz da Apple, com checagem online de revogação. Compras de Sandbox são aceitas, porque é com elas que a revisão da Apple e o TestFlight testam o app.
   - **Google**: o token é consultado na Play Developer API com uma conta de serviço, e a compra é confirmada (acknowledge) depois da entrega; sem isso, o Google estorna em 3 dias.
4. Uma entrega por transação (`StorePurchase` com chave única loja + transação). Reenviar ou restaurar a mesma compra não dá nada em dobro, e uma compra de outra conta é recusada.
5. Só depois o app fecha a transação na loja (consome o pacote, que pode ser comprado de novo).

Compra interrompida (o app fechou entre a loja e o servidor): o app entrega ao abrir, sem pedir senha. "Restaurar compras" traz o "Sem anúncios" para um aparelho novo.

## Anúncios com prêmio

Sempre por escolha do jogador, e **o prêmio aparece antes** de ele decidir assistir. Isso também afasta qualquer semelhança com as "caixas de recompensa" que a Lei 15.211/2025 (ECA Digital) proíbe em jogos acessíveis a crianças: não há sorteio pago nem surpresa depois do anúncio.

| Lugar | Quando | Prêmio |
|---|---|---|
| Continuar | Perdeu o último coração numa fase (1 vez por fase, até 15 min depois) | Volta com 1 coração, do mesmo obstáculo |
| Dobrar | Concluiu uma fase (até 15 min depois) | As moedas da fase de novo |
| Prêmio da rodada | Quando o sevivon cai na face Prêmio (no máximo uma vez por turno); depois, gira-se de novo | Moedas, vida, ajuda ou shekels |
| Vida | Sem vidas na roleta | +1 vida |
| Ajuda | Na loja, aba Ajudas (mostra qual ajuda vem antes) | +1 ajuda |
| Presente da pausa | Antes do anúncio obrigatório (veja abaixo) | Moedas, vida, ajuda ou shekels |
| Jogadas | Acabaram as jogadas no Pedras do Choshen (1 vez por partida) | +5 jogadas |

Cada lugar tem um teto por dia (`REWARD_RULES.dailyCap`). O prêmio sai de um HMAC do contexto (turno, pausa) com uma chave do servidor: fica fixo para aquele momento, o jogador não prevê nem "sorteia de novo" recarregando.

Fluxo (`apps/api/src/economy/rewards.service.ts`):

1. `POST /rewards/offers` cria a oferta e devolve o prêmio. O app mostra.
2. O anúncio é visto até o fim. Com anúncios reais, **quem confirma é o Google**: o AdMob chama `GET /rewards/ssv` (Server-Side Verification), com a assinatura ECDSA conferida contra as chaves públicas do Google. O app manda o id da oferta no `custom_data`.
3. `POST /rewards/:id/claim` entrega o prêmio uma única vez. Se a confirmação do Google ainda não chegou, a resposta é `pending` e o app tenta de novo em instantes.

Modos (`ADS_MODE`):

- `admob`: anúncios reais, prêmio só com SSV. É o único aceito em produção (além de `off`).
- `trust-client`: blocos de teste do AdMob, confiando no aviso do app (`POST /rewards/:id/watched`). Para builds de desenvolvimento, já que os blocos de teste não mandam SSV.
- `demo`: o próprio jogo desenha um "anúncio de demonstração" (web, Expo Go, `pnpm lan`).
- `off`: sem anúncios.

## Anúncio obrigatório e "Sem anúncios"

- Pausas são o fim de uma partida da roleta, de uma fase do Golem World ou de uma partida do Pedras do Choshen. A cada 3 a 5 pausas (sorteado de novo a cada vez) vem um anúncio, com pelo menos 2 minutos entre um e outro. Nunca no meio de uma pergunta nem ao abrir o jogo.
- Antes dele, o jogo oferece um **presente**: uma tela mostra o prêmio, começa sozinha em 5 segundos e tem "Não, obrigado". Quem aceita vê o anúncio de pausa com prêmio (formato *rewarded interstitial* do AdMob, que exige essa tela de aviso com opção de sair); quem recusa vê o anúncio comum, sem prêmio. As regras do AdMob proíbem dar prêmio por anúncio intersticial comum, então o prêmio "obrigatório" ficou como escolha entre os dois formatos.
- Os prêmios de vida (presente da pausa e prêmio da rodada) são vidas do sevivon, e a tela diz isso ("+1 vida no sevivon"). Com as vidas cheias, a vida sai da tabela: o prêmio se perderia (o máximo é 5) e, oferecido no fim de uma partida do Pedras do Choshen, ainda dava a impressão de que o jogador tinha perdido alguma (Fase 13).
- Assistir a um anúncio com prêmio por vontade própria conta como anúncio visto: quem assiste sempre quase não vê os obrigatórios; quem pula todos vê um a cada 3 a 5 pausas.
- O botão **Sem anúncios** flutua em todas as telas (nas de pergunta, fica no cabeçalho para não cobrir alternativa). A compra tira só os anúncios obrigatórios; os com prêmio continuam disponíveis. Vale para a conta, em qualquer aparelho.

## Privacidade dos anúncios

Todos os pedidos de anúncio são **não personalizados** e com classificação **G** (livre): o jogo é estudo de Torá e pode ser usado por crianças, e o ECA Digital proíbe perfilamento publicitário de menores. O app não pede rastreamento (sem a tela do ATT no iPhone). Se o app for publicado com público principal infantil, marque também `EXPO_PUBLIC_ADS_CHILD_DIRECTED=true` e siga a política de Famílias do Google Play.

## Como configurar

Servidor (`.env` da raiz):

| Variável | Para quê |
|---|---|
| `ADS_MODE` | `admob`, `trust-client`, `demo`, `off` (vazio: `demo` em desenvolvimento, `off` em produção) |
| `STORE_MODE` | `live`, `demo`, `off` (vazio: `demo` em desenvolvimento; em produção, `live` se houver loja configurada) |
| `APPLE_BUNDLE_ID`, `APPLE_APP_ID` | App na App Store Connect (o id numérico é obrigatório em produção) |
| `APPLE_ROOT_CERTS_DIR` | Pasta com `AppleRootCA-G3.cer` (padrão `certs/apple`) |
| `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE` | App no Google Play e o JSON da conta de serviço com acesso à API do Play |
| `ADMOB_SSV_KEYS_URL` | Chaves públicas do AdMob (já vem com o endereço do Google) |

No AdMob, cadastre em cada bloco com prêmio o endereço de SSV: `https://<sua-api>/rewards/ssv`.

App (no build, por exemplo nos *secrets* do EAS):

| Variável | Para quê |
|---|---|
| `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID` | Ids do app no AdMob (sem eles, os de teste do Google) |
| `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID` / `_IOS` | Bloco do anúncio com prêmio |
| `EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_ANDROID` / `_IOS` | Bloco do presente da pausa |
| `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID` / `_IOS` | Bloco do anúncio de pausa comum |
| `EXPO_PUBLIC_ADS_CHILD_DIRECTED` | `true` para tratar todo pedido como dirigido a crianças |

AdMob e compras de verdade precisam de um build do app (EAS, `npx expo run:android` ou `run:ios`); no Expo Go e na web, o jogo usa o anúncio e a compra de demonstração, e o servidor só aceita isso fora de produção.

## O que ainda falta para publicar

- Notificações de reembolso das lojas (App Store Server Notifications V2 e Google Real-time Developer Notifications) para marcar compras revogadas e tirar o "Sem anúncios" de quem foi reembolsado. Hoje a revogação é conferida só quando a compra chega ao servidor.
- Termos de uso com as regras das moedas e a política de reembolso.
- Revisar com um advogado a classificação indicativa e o ECA Digital antes da publicação.
