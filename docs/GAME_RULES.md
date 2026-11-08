# Regras do jogo

Os números abaixo vêm de `GAME_RULES` em `packages/shared/src/game-rules.ts`. O servidor aplica, o app exibe; mudar lá muda nos dois.

## Objetivo

Conquistar **6 selos**, um por categoria. Vence quem completar os 6 primeiro.

| Categoria | Fontes no Sefaria |
|---|---|
| Torá | Tanakh › Torah |
| Profetas e Escritos | Tanakh › Prophets, Tanakh › Writings |
| Mishná | Mishnah › Seder … (os 63 tratados) |
| Talmud | Talmud › Bavli › Seder … (os 37 tratados) |
| Halachá | Mishnê Torá (Halakhah › Mishneh Torah) e Shulchan Aruch |
| Midrash e Agadá | Midrash › Aggadah e Midrash › Halakhah |

Comentários (Rashi, Tosafot, Bartenura…), notas editoriais e introduções ficam de fora: as perguntas cobram o texto-base. O mapeamento está em `packages/shared/src/categories.ts`.

## A vez do jogador

1. O jogador gira o **sevivon** (Fase 12; até a Fase 11 era uma roleta). **O servidor sorteia** a face entre 8, de mesmo peso: as 6 categorias, a **Coroa** e o **Prêmio**. O app só anima o sevivon até cair com essa face para cima. Categorias ainda sem perguntas aprovadas ficam fora do sorteio e da escolha da Coroa; o Prêmio só entra quando o aparelho consegue mostrar anúncio com prêmio, uma vez por turno e abaixo do limite diário (assim nenhuma face é beco sem saída).
2. Caiu numa categoria: o jogador responde uma pergunta dela em até **30 segundos**.
   - Acertou: ganha os pontos da dificuldade, avança 1 na Coroa e **gira de novo**.
   - Errou ou o tempo acabou: a Coroa zera e **a vez passa** para o adversário.
3. **3 acertos seguidos** enchem a Coroa. O jogador escolhe uma categoria cujo selo ainda não tem e responde uma pergunta de disputa:
   - Acertou: conquista o selo (+25 pontos) e gira de novo.
   - Errou: não ganha o selo e a vez passa.
4. Cair na face Coroa equivale a ter a Coroa cheia: o jogador escolhe a categoria e disputa o selo na hora.
5. Cair na face **Prêmio** mostra o prêmio da rodada (moedas, vida, ajuda ou shekels). Assistir a um anúncio curto é opcional e o prêmio vale fora da partida; com ou sem anúncio, **o jogador gira de novo** sem perder a vez. Ninguém ganha selo, ponto ou vantagem na partida por anúncio.

O sevivon é o mesmo nos três idiomas; nas 8 noites de Chanucá, uma chanukiá com as velas da noite aparece atrás dele.

## Pontuação

| Dificuldade | Pontos por acerto |
|---|---|
| Fácil | 10 |
| Médio | 20 |
| Difícil | 35 |
| Especialista | 50 |
| Selo conquistado | +25 |

Os pontos alimentam o ranking semanal e o geral.

## Fim de partida

- Alguém completa os 6 selos: vitória imediata.
- Atingido o limite de **25 rodadas** (cada passagem de vez conta uma rodada): vence quem tiver mais selos; empate em selos é decidido pela pontuação; empate total é empate.
- Partida assíncrona: quem não jogar a sua vez em **48 horas** perde por W.O.

## Modos

| Modo | Como funciona |
|---|---|
| Solo | Treino contra o próprio placar. Mesmas regras; a partida termina com os 6 selos ou em 25 rodadas. |
| Aleatório | O servidor pareia com outro jogador esperando partida. Se ninguém aparecer em 8 segundos, entra um **bot** (ver abaixo). |
| Amigo | Quem cria recebe um código de 6 caracteres para compartilhar. |

## Vidas

Cada jogador tem **5 vidas** na roleta. Cada erro (ou tempo esgotado) gasta uma; uma vida volta a cada **10 minutos**, até encher. Sem vidas, não dá para girar até voltar uma: a partida espera (a vez só cai por W.O. depois de 48 horas), e o app sugere treinar no Golem World enquanto isso. As vidas são as mesmas em todas as partidas; o erro também passa a vez ao adversário, como antes.

## Bots

Quando não há ninguém na fila do modo aleatório, um **bot** assume o lugar do adversário. Os bots são outros Golems (Golem Trigo, Golem Cevada, Golem Uva…, as sete espécies de Dt 8:8) e aparecem com o selo **BOT**, sem fingir ser gente. A chance de o bot acertar acompanha a taxa de acerto recente do jogador humano, com um pequeno desconto (5%) e ajuste pela dificuldade da pergunta, entre 20% e 88%: um adversário do mesmo nível, nunca imbatível. Ele "pensa" de 3 a 8 segundos antes de jogar. Bots não entram no ranking e não gastam vidas. `BOTS_ENABLED=false` desliga.

## Ranking

O ranking (semana e geral) conta só os pontos da roleta. O Golem World não pontua para o ranking: suas moedas só compram itens para o Golem. Bots nunca aparecem no ranking.

## Seleção de perguntas

Para cada pergunta servida, o servidor:

1. filtra perguntas `approved` da categoria sorteada (se não houver nenhuma inédita para o jogador, a fábrica de perguntas monta uma na hora a partir dos textos do Sefaria; ver [Golem World](GOLEM_WORLD.md#de-onde-vêm-as-perguntas));
2. exclui as que esse jogador já viu;
3. sorteia a dificuldade com pesos que acompanham o desempenho do jogador (começa com mais Fácil/Médio);
4. embaralha as alternativas só para aquele jogador e guarda a permutação;
5. envia a pergunta **sem gabarito e sem a referência da fonte** (que poderia entregar a resposta).

A correção acontece no servidor, que confere o prazo com uma tolerância de rede de 3 segundos. Depois da resposta, o app recebe o gabarito, a explicação e a fonte com link para o Sefaria.

## Recalibração da dificuldade

Cada pergunta começa com o nível dado pela IA. Depois de **30 respostas**, a taxa de acerto real (suavizada) é comparada com a faixa esperada do nível:

| Nível | Taxa de acerto esperada |
|---|---|
| Fácil | 75% a 100% |
| Médio | 50% a 75% |
| Difícil | 30% a 50% |
| Especialista | 0% a 30% |

Fora da faixa, o nível anda **um passo** na direção certa por recalibração. O rótulo original da IA continua guardado para auditoria.
