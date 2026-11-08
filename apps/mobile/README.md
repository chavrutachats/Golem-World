# apps/mobile

O app do jogo em Expo (SDK 58, React Native 0.88, React 19.3, Expo Router), para iOS, Android e web.

## Rodando no celular com o Expo Go

1. No computador, com o banco e a API no ar (veja o README da raiz):
   ```bash
   pnpm api:dev          # API em http://localhost:3000
   pnpm mobile           # servidor do Expo; mostra um QR code
   ```
2. No celular, instale o **Expo Go** (App Store ou Google Play) e leia o QR code.
3. Celular e computador precisam estar **na mesma rede Wi-Fi**. O app descobre sozinho o endereço da API: o mesmo computador que serve o Expo, na porta 3000.

Se o app mostrar "Não foi possível falar com o servidor", confira se a API está rodando e se o firewall do computador libera a porta 3000. Também dá para fixar o endereço criando `apps/mobile/.env` com:

```bash
EXPO_PUBLIC_API_URL="http://192.168.0.10:3000"   # IP do seu computador na rede
```

Para ver o app no navegador: `pnpm mobile:web` (abre em http://localhost:8081; a API já aceita essa origem no CORS).

> **Versão do Expo Go:** o app usa o SDK 58, o mesmo do Expo Go atual nas lojas (o Expo Go só abre projetos do SDK dele; era isso que impedia abrir o jogo quando o projeto ainda estava no 57). Para mostrar o jogo sem instalar nada, use `pnpm lan` na raiz: ele abre no navegador do celular.

## Telas

| Rota | Tela |
|---|---|
| `/welcome` | Boas-vindas: nome e entrada como convidado |
| `/login` | Entrar com e-mail e senha |
| `/` | Início: vidas da roleta, entrada do Golem World, novo jogo (treino, adversário aleatório, amigo), suas partidas |
| `/join` | Entrar numa partida com o código de convite |
| `/game/[id]` | Tabuleiro: placar, selos, Coroa, sevivon e a próxima ação |
| `/game/[id]/question` | Pergunta com cronômetro; depois, gabarito, explicação e fonte no Sefaria |
| `/journey` | Golem World: mapa dos mundos, o Golem anda até a fase tocada; painel da fase |
| `/journey/parasha/[id]` | Caminhos de estudo de uma parashá (abrem depois da Torá dela) |
| `/journey/run/[id]` | Uma fase: cenário da parashá, obstáculos, perguntas, corações, poderes dos itens, vitória ou fim dos corações |
| `/journey/shop` | Armário do Golem: comprar e vestir itens |
| `/puzzle` | Pedras do Choshen: as pedras, o link para o Sefaria e as 60 fases em 6 capítulos |
| `/puzzle/[level]` | Uma partida do match-3: placar, tabuleiro (arrastar ou tocar), +5 jogadas com anúncio, resultado conferido no servidor |
| `/ranking` | Ranking da semana e geral |
| `/profile` | Nome, estatísticas, sons do jogo, criar conta (guardar o progresso do convidado), sair |
| `/account` | Conta e segurança: trocar senha, sair de todos os aparelhos, excluir a conta |

## Como o app conversa com a API

- `src/lib/api-core.ts`: cliente HTTP tipado. Toda resposta é validada com os schemas de `@trivia/shared`. A renovação do token é de voo único: várias requisições com token vencido esperam uma só renovação, porque a API gira o refresh token a cada uso.
- O token de acesso fica só em memória. O de renovação fica no chaveiro do aparelho (`expo-secure-store`, só neste aparelho, fora de backups); na web, no `localStorage`.
- A sessão guardada só é apagada quando a API responde 401. Sem rede, com limite de requisições (429) ou com o servidor fora, a tela inicial oferece "Tentar de novo", para um convidado não perder a conta.
- Em builds de produção, o app só fala com a API por `https://` (defina `EXPO_PUBLIC_API_URL`). Mais em [`docs/SECURITY.md`](../../docs/SECURITY.md).
- O sevivon só anima: o resultado vem do servidor (`sliceIndex`), e `src/lib/sevivon.ts` calcula um giro (cai na mesa, bambeia, tomba e balança) que termina com aquela face para cima. Sem WebGL, a roleta 2D de 8 fatias (`src/lib/wheel.ts`) faz o mesmo papel.
- O cronômetro usa a hora do servidor (`serverNow`), então funciona mesmo com o relógio do celular errado (`src/lib/countdown.ts`).
- Quando é a vez do adversário, a partida é consultada a cada 4 segundos. Ao voltar para o app, os dados são atualizados.

## Design

- **Fundo de veludo azul** nas telas de jogo, como o parochet (a cortina da arca), com destaques em **dourado**: a coroa da Torá e o **yad**, o ponteiro de leitura que aponta a fatia sorteada.
- **Categorias em tons de encadernação de sefarim**, cada uma com o nome em hebraico na roleta. As cores e os rótulos ficam em `@trivia/shared`, e um teste garante contraste de pelo menos 4,5:1 para o texto sobre cada cor.
- **Rubik** na interface (arredondada, desenhada também para o hebraico) e **Frank Ruhl Libre** nas perguntas e citações (serifa hebraica clássica).
- Tema claro e escuro; com "reduzir movimento" ativado no aparelho, a roleta gira menos.

## Movimento e som

O jogo tem um jeito só de se mexer (`src/lib/motion.ts`): as mesmas molas em todo lugar.

- **Peças 3D** (`components/ui/Chunky.tsx`): botões de ação, alternativas e cartões têm um rebordo mais escuro e afundam ao toque.
- **Sevivon** (Fase 12): 8 faces de madeira pintada com as palavras em relevo (תורה, נ״ך, משנה, תלמוד, הלכה, מדרש, tiradas da Frank Ruhl Libre por `scripts/make-sevivon-glyphs.mjs`), a Coroa e a moeda do Prêmio. Paira girando devagar; ao girar, cai na mesa, bambeia, tomba com a face sorteada para cima e a câmera chega perto. Nas noites de Chanucá, uma chanukiá acesa aparece atrás.
- **Roleta (sem WebGL)**: recua antes de partir, o yad bate em cada cravo do aro (com tique e vibração leve), a roda passa um pouco do ponto e volta, e a fatia sorteada pisca. Em seguida, a tela da categoria (`fx/CategoryReveal.tsx`) aparece com raios girando enquanto a pergunta é buscada.
- **Pergunta**: sobre o veludo, num cartão de papel; as alternativas entram em sequência, marcadas com א ב ג ד. O cronômetro é um medalhão que esvazia e, nos últimos 5 segundos, fica vermelho, pulsa e faz tique.
- **Resultado**: a certa pula e fica verde, com confete e os pontos subindo; a errada treme e fica vermelha. A Coroa enche com as coroinhas estourando, o selo novo é carimbado, e a vitória tem confete e fanfarra.
- **Sons** (`src/lib/sound.ts`): curtos, sintetizados por `scripts/make-sounds.py` (sem amostras de terceiros). Seguem o modo silencioso do celular, tocam junto com a música de quem estiver ouvindo algo e podem ser desligados no perfil.
- Com "reduzir movimento" ligado no aparelho, confete, tremidas, raios e pulsos não aparecem; as cores e os sons continuam.

Os ícones do app são gerados por `scripts/make-icons.py` (Pillow) e os sons por `scripts/make-sounds.py` (numpy).

## Golem World

Mundo 3D de "barro" em polígonos baixos (detalhes em [`docs/GOLEM_WORLD.md`](../../docs/GOLEM_WORLD.md#arte-e-som)). Tudo é montado em código a partir de formas simples, sem arquivos de modelo: o app não baixa nada além do próprio código.

- `src/three/` é o mundo, em three.js puro e testável no Node: `kit.ts` (paleta, materiais e geometrias reaproveitados), `golem.ts` (o Golem, seus itens e poses), `nature.ts` e `story.ts` (cenários, os 30 obstáculos da Torá, os marcos e as casas de estudo), `level.ts` e `map.ts` (fase e mapa), `merge.ts` (junta as peças paradas para desenhar com poucas chamadas à GPU) e `director.ts` (animações por tempo, iguais em qualquer taxa de quadros).
- `components/three/` liga isso ao React com `@react-three/fiber` (`Stage3D.tsx` na web, `Stage3D.native.tsx` com `expo-gl` no celular). Se o aparelho não tiver WebGL, a cena some e o jogo continua.
- O mapa usa câmera ortográfica inclinada com projeção linear: nomes, estrelas e áreas de toque são componentes React Native comuns por cima do 3D, alinhados por `contentPoint()` (testado em `test/three.test.ts`), e por isso continuam acessíveis a leitores de tela.
- `lib/journey-map.ts` e `lib/journey-level.ts` são a lógica pura do mapa e das fases (posições, trajeto do Golem, cenário de cada trecho, obstáculo de cada pergunta, chegada), com testes em `test/journey.test.ts`.
- A interface do Golem World usa Fredoka (tem hebraico) em títulos e botões; perguntas e fontes continuam em Rubik e Frank Ruhl Libre.

## Economia e anúncios

Regras e fluxo completo em [`docs/ECONOMY.md`](../../docs/ECONOMY.md). No app:

- `src/lib/monetization/` escolhe os adaptadores conforme o servidor: AdMob (`react-native-google-mobile-ads`) e App Store/Google Play (`expo-iap`) no app instalado; anúncio e compra de demonstração na web e no Expo Go (os módulos nativos só são carregados fora do Expo Go). Conduz os fluxos de prêmio (oferta, anúncio, resgate), da pausa (presente antes do anúncio obrigatório) e das compras (loja, servidor, fechamento da transação).
- `components/economy/`: carteira, prêmio, telas do anúncio de demonstração, do presente e da compra (`MonetizationHost`), o botão flutuante "Sem anúncios" e o prêmio da rodada.
- `app.config.ts` acrescenta os plugins do AdMob e das compras ao `app.json`. Sem `ADMOB_ANDROID_APP_ID`/`ADMOB_IOS_APP_ID`, usa os ids de teste do Google.
- Personagens e material em 3D: `src/three/costumes.ts` e a cor do barro em `src/three/golem.ts`.

## Login social

Google, Apple e Facebook ([`docs/AUTH.md`](../../docs/AUTH.md)). `src/lib/social/` tem um adaptador por provedor e plataforma: Google pelo SDK nativo (`@react-native-google-signin/google-signin`) no app e por OAuth na web; Apple pelo `expo-apple-authentication`, só no iPhone; Facebook por OAuth (`expo-auth-session`). Os botões aparecem só quando o servidor aceita o provedor e o aparelho consegue usá-lo (não no Expo Go, nem na web por `http://` na rede de casa). Variáveis: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_FACEBOOK_APP_ID`.

## Pedras do Choshen

O motor do match-3 roda no app, que reage na hora, sem esperar a rede. Cada jogada vira quadros de animação (`src/lib/puzzle-frames.ts`): a troca, o estouro com faíscas, as explosões dos especiais, a queda e as pedras novas descendo do alto.

As pedras são SVG com gradiente, e cada pedra é uma `Animated.View` própria (Reanimated). Os gestos usam a API de hooks do react-native-gesture-handler 3 (`usePanGesture`, `useTapGesture`). Na web, cada pedra animada vira uma camada própria (`will-change: transform`); sem isso, pulsar uma pedra repintava as outras 63.

O tabuleiro não espelha no hebraico, porque as jogadas são por linha e coluna. A barra de pontos segue a direção do idioma. Regras e conferência no servidor: [`docs/PUZZLE.md`](../../docs/PUZZLE.md).

## Verificação

```bash
pnpm --filter @trivia/mobile typecheck
pnpm --filter @trivia/mobile test           # lógica pura: roleta, cronômetro, cliente da API, mundo 3D
pnpm --filter @trivia/mobile export:web     # bundle web
npx expo export --platform android --platform ios   # compila os bundles nativos com Hermes
```
