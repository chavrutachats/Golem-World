# Trivia Torá em Godot 4 (Fases 14 a 18)

Cliente novo do jogo, feito no motor **Godot 4.7** (gratuito, código aberto; exporta para
Android, iOS e web). Fala com a **mesma API** do app React Native (`apps/api`), então contas,
partidas, perguntas e ranking são os mesmos. Desde a Fase 18 ele cobre tudo o que o app faz
(o que depende do app instalado está em "Fora da web", abaixo).

## O que já funciona

- Boas-vindas com conta de convidado, escolha de idioma (português, inglês, hebraico; o
  hebraico espelha a interface inteira) e "Já tenho conta" (entrar com e-mail e senha).
- Início: novo treino, adversário aleatório ou desafiar um amigo (com o preparo das perguntas
  no idioma do jogador), "Tenho um código de convite", partidas em andamento e encerradas, a
  carteira (moedas e shekels), o "Sem anúncios" e as entradas do Golem World, das Pedras do
  Choshen, do ranking e do perfil.
- Partida: placar, selos, Coroa, vidas, o **sevivon 3D** girando até a face sorteada pelo
  servidor, revelação da categoria, escolha do selo, desistência, fim de partida com confete.
- Pergunta: cartão de pergaminho, contexto, cronômetro pelo relógio do servidor, resposta,
  explicação, a fonte no Sefaria (com vocalização e cantilação do hebraico) e "Denunciar"
  (o motivo e um comentário; a pergunta vai para a revisão humana).
- **Partida com amigo** (Fase 18): o código de 6 letras com "Compartilhar código" (o
  compartilhamento do celular, ou a mensagem copiada) e a tela "Entrar com código".
- **Chanucá** (Fase 18): nas 8 noites, a chanukiá de prata com as velas da noite acesas ao
  lado do sevivon (a mesma tabela de datas do app; `?preview=stage&hanukkah=5` mostra fora da
  festa).
- **Golem World** (Fase 15):
  - o mapa das ilhas (um livro da Torá por ilha), com as fases, o caminho de pedrinhas, a
    casa de estudos de cada livro e o Golem andando de uma fase a outra; rolagem por arrasto;
    as 53 cenas animadas entre as fases (a arca, a escada de Yaakov, o mar aberto…), a
    Criação no topo e as bolinhas dos caminhos de estudo de cada parashá;
  - a ficha de cada fase (episódios, cadeados explicados, caminhos de estudo depois da Torá);
  - a fase jogável: o diorama da parashá (céu, chão, peças em paralaxe, o cenário que muda
    nos dias da Criação), os 30 obstáculos, o pulo, o tropeço, os corações, os poderes
    (eliminar 2, pular, dica, +10 s), o resultado com a fonte e o fim (estrelas, moedas,
    caminhos abertos) ou a derrota;
  - a loja do Golem: armário, personagens e barro, com prova na vitrine, compra e vestir;
    os 14 personagens e todos os itens aparecem no Golem.

- **Pedras do Choshen** (Fase 16):
  - o mapa das 60 fases em 6 capítulos (um por pedra do peitoral), com estrelas e cadeados;
  - a partida: as seis pedras desenhadas, cada uma com cor e forma próprias, os especiais
    (Raio na linha ou na coluna, Estrondo, Urim), o barro do Golem, troca por arrasto ou por
    toque, pedras que estouram, caem e descem do alto, cadeias com "×2", "×3", embaralhamento
    quando não há jogada, dica depois de 6 s parado;
  - o placar (jogadas, objetivos com "faltam", pontos e a barra das estrelas) e o fim de
    fase, com as jogadas conferidas pelo servidor (estrelas, recorde, moedas).

- **Ranking e perfil** (Fase 17):
  - o ranking da semana (desde segunda) e o geral, com ouro, prata e bronze para os três
    primeiros e a linha do jogador à parte quando ele não está na lista;
  - o perfil: trocar o nome no jogo, os números (pontos, partidas, vitórias, perguntas,
    acertos), criar conta com e-mail e senha (o convidado vira conta sem perder pontos nem
    partidas), idioma, sons ligados ou desligados (guardado no aparelho) e sair da conta,
    com o aviso para quem ainda é convidado;
  - entrar com e-mail e senha. As regras do nome e da senha são as da API, que responde
    no idioma do jogador.

- **Economia** (Fase 18), em `scripts/autoload/economy.gd`:
  - anúncios com prêmio, sempre por escolha e com o prêmio antes: +1 vida no sevivon (sem
    vidas e na loja), o Prêmio da rodada (a face do sevivon entra no sorteio quando há
    anúncio), continuar a fase do Golem World com 1 coração, dobrar as moedas da fase, uma
    ajuda para a mochila e +5 jogadas nas Pedras do Choshen;
  - a pausa no fim de partida ou de fase: na hora do anúncio obrigatório, o presente antes
    (começa sozinho em 5 s e tem "Não, obrigado");
  - a loja ganhou as abas Ajudas (a mochila, vidas cheias e pacotes com shekels) e Shekels
    (os pacotes e o "Sem anúncios");
  - o anúncio é o de demonstração, desenhado pelo jogo, e a compra também (nada é cobrado):
    o servidor só aceita isso fora de produção (`ADS_MODE=demo`, `STORE_MODE=demo`), como na
    versão web do app.
- **Conta e segurança** (Fase 18): trocar a senha, sair de todos os aparelhos, excluir a
  conta; contas conectadas (ligar e desligar o Google e o Facebook).
- **Login social** (Fase 18): "Continuar com o Google / o Facebook" nas boas-vindas, no
  entrar e no perfil. O navegador vai para a página de login e volta com o token no
  fragmento da URL; o jogo confere o `state` guardado antes de sair e manda o token para a
  API, que o verifica com o provedor. Os ids públicos vêm da página, que a API preenche
  com `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` e `FACEBOOK_APP_ID`. Como no app, os provedores só
  aceitam voltar para https, localhost ou 127.0.0.1: pelo IP da rede de casa, os botões não
  aparecem.

O desenho do mapa, os cenários e os obstáculos saem dos mesmos dados do app:
`data/journey.json` é gerado por `pnpm --filter @trivia/mobile godot-journey-data`.

O tabuleiro roda aqui com `scripts/lib/puzzle_engine.gd`, um porte linha a linha do motor
TypeScript (incluindo o sorteio mulberry32 com aritmética de 32 bits), porque o servidor
refaz cada partida com o motor dele e só aceita as jogadas se tudo bater. As fases vêm de
`data/puzzle.json` (`pnpm --filter @trivia/mobile godot-puzzle-data`), que também grava em
`tests/puzzle_vectors.json` 31 partidas gravadas pelo motor TypeScript (775 jogadas, 36
embaralhamentos); `tests/run_tests.gd` confere o porte contra elas, jogada por jogada.

## Android (Fase 19)

No Windows, com o Android Studio instalado:

```
pnpm lan:godot          # a API no ar, na rede de casa (deixe rodando)
pnpm android:godot      # gera build/android/trivia-tora.apk e instala no celular no USB
```

O script (`scripts/build-android.ps1`):
- baixa o Godot 4.7.2 e os modelos de exportação uma vez só, conferindo o SHA-512 com a lista
  oficial; o Godot roda em modo portátil, em `%LOCALAPPDATA%\trivia-tora\godot`;
- usa o SDK e o Java do Android Studio;
- grava `server.cfg` com o IP do computador na rede (porta 3000);
- assina o APK com a chave de depuração do Android.

Opções: `-NoInstall`, `-ApiUrl http://<ip>:3000`, `-AndroidSdk <pasta>`, `-JavaHome <pasta>`
(chamando `powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 ...`).

No jogo instalado:
- a tela de boas-vindas e a de "sem conexão" mostram o servidor e deixam trocar o endereço
  (trocar de servidor esquece a sessão, que é de outro servidor);
- o Voltar do Android navega: fecha a folha aberta; nas fases, pede para sair; no início,
  fecha o jogo;
- a interface respeita a barra de status e o recorte da câmera;
- o id do pacote é `app.triviatora.godot`, para não se misturar com o app React Native
  (`app.triviatora.mobile`) no mesmo celular;
- anúncios e compras são os de demonstração, e o login social não aparece (ele depende do
  retorno pelo navegador).

O APK de depuração serve para instalar e testar. Para publicar na Play Store faltam coisas
que dependem das suas contas:
- uma chave de envio própria;
- o app no Play Console;
- os ids do AdMob e a conta de serviço do Google Play;
- os plugins do AdMob e do Google Play Billing para Godot, que pedem a exportação com Gradle.

`tests/test_native.tscn` confere o endereço do servidor do jogo instalado.

## Fora da web

Três coisas dependem do jogo instalado pela loja e ficam para a exportação Android/iOS:
os anúncios do Google (AdMob, com a confirmação do servidor por SSV), as compras da App Store
e do Google Play, e o login com a Apple (só no iPhone). Na web, como no app, valem o anúncio e
a compra de demonstração; com `ADS_MODE=admob` ou `STORE_MODE=live` no servidor, as ofertas
somem deste cliente em vez de prometer o que ele não entrega.

## Visual

As cenas de barro do Golem World usam a luz do app convertida para o Godot: o three.js divide
a intensidade por π, o Godot não; e o ACES do Godot satura em vez de dessaturar, então o tom
é linear com a saturação um pouco abaixo. O brilho (glow) fica desligado nelas: no
renderizador da web ele clareia a cena inteira.

O mesmo sistema "tekhelet e klaf" da Fase 13 (`scripts/autoload/ui.gd`). O que muda é o 3D:

- materiais físicos (PBR): madeira envernizada com veios e anéis (shader `shaders/wood.gdshader`),
  ouro metálico, faces esmaltadas, feltro com fibras;
- os reflexos vêm de um panorama de estúdio gerado no código (duas caixas de luz quentes e um
  contraluz de tekhelet), com sombras suaves, brilho (glow) e tom ACES;
- o sevivon é facetado com chanfros (as quinas pegam a luz) e as palavras em relevo
  saem da fonte Frank Ruhl Libre.

Na web o Godot usa o renderizador de compatibilidade (WebGL 2), que não tem oclusão de
ambiente nem reflexos de tela; o resto vale igual no celular.

## Rodar

Precisa do Godot 4.7 (editor) e dos modelos de exportação web, da página oficial
(https://godotengine.org/download). Com o banco e o `.env` prontos (veja o README da raiz):

```sh
GODOT_BIN=/caminho/do/Godot_v4.7.2-stable pnpm lan:godot
```

Isso exporta este projeto para `build/web` e sobe a API servindo-o: abra o endereço que
aparecer, no computador ou no celular da mesma rede. Também dá para abrir a pasta
`apps/godot` no editor e rodar direto (a API em `trivia/api_url`, `http://127.0.0.1:3000`,
ou em `TRIVIA_API_URL`).

Na web, `?preview=stage` (com `&spin=3` ou `&face=6`), `?preview=welcome` e
`?preview=question` abrem peças isoladas para conferir o visual.

## Testes

```sh
godot --headless --path apps/godot --import
godot --headless --path apps/godot --script res://tests/run_tests.gd
```

O primeiro confere que as contas do sevivon portadas para GDScript dão os mesmos números
do TypeScript e as funções de data e texto. O segundo (com o jogo carregado:
`godot --headless --path apps/godot res://tests/test_journey.tscn`) confere o sorteio com
semente e o hash de texto (o lugar de cada árvore), o obstáculo e o cenário de cada
pergunta, e monta todas as peças 3D. Os valores de referência ficam em
`tests/sevivon_vectors.json`, gerados por `pnpm --filter @trivia/mobile godot-sevivon-vectors`.

## Traduções

`i18n/ui.json` é gerado a partir das tabelas do app (`pnpm --filter @trivia/mobile godot-i18n`);
frases só deste cliente ficam em `i18n/extra.json`.

## Estrutura

- `scripts/autoload/`: idioma (`i18n.gd`), API (`api.gd`, com a renovação de sessão de voo único),
  sons (`sfx.gd`) e visual (`ui.gd`).
- `scripts/screens/`: telas (boas-vindas, início, partida, pergunta, Golem World, loja, Pedras do Choshen).
- `scripts/ui/`: peças de interface; das Pedras do Choshen, `stone.gd` (as pedras), `stone_icon.gd` e `puzzle_board.gd` (o tabuleiro animado).
- `scripts/three/`: o sevivon, a mesa e a cena (`sevivon_stage.gd`); as peças do Golem World,
  portadas do app peça por peça (`kit.gd`, `geo.gd`, `nature.gd`, `story.gd`, `golem.gd`,
  `costumes.gd`, `world_map.gd`) e as cenas do mapa e da fase (`map_stage.gd`, `level_stage.gd`).
- `scripts/lib/`: o porte de `apps/mobile/src/lib/sevivon.ts` (`sevivon_math.gd`) e as regras do
  Golem World (`journey_data.gd`); o motor e as fases das Pedras do Choshen (`puzzle_engine.gd`,
  `puzzle_data.gd`).
- `assets/fonts/`: Rubik, Frank Ruhl Libre e Noto Serif Hebrew (licença OFL) e um recorte de
  símbolos da DejaVu Sans (setas e estrelas; licença Bitstream Vera), arquivos de licença ao lado.
