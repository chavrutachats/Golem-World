# Política de conteúdo

Este documento define como o jogo trata os textos sagrados e os comentários do acervo do Sefaria. Ele é a referência humana das regras; o prompt do gerador (`pipeline/prompts/generator.system.md`, Fase 2) e as checagens automáticas (`packages/shared/src/question.schema.ts` e `text.ts`) implementam estas mesmas regras em código.

Em caso de dúvida entre "gerar uma pergunta" e "não gerar", **não gerar** é sempre a resposta certa.

## 1. Fidelidade à fonte

1. Toda pergunta nasce de **um trecho específico** do Sefaria e só pode cobrar o que está escrito nesse trecho (ou no comentário clássico entregue junto com ele).
2. O modelo não usa conhecimento externo, midrashim não fornecidos, tradições orais, nem "o que todo mundo sabe".
3. Toda pergunta carrega:
   - `sourceRef`: a referência exata (ex.: `Genesis 22:2`);
   - `evidenceQuote`: um pedaço **copiado literalmente** do trecho que prova a resposta.
4. O pipeline confere por código que o `evidenceQuote` existe no texto-fonte (ignorando nikud, te'amim e pontuação). Se não existir, a pergunta é descartada sem exceção.
5. Um segundo modelo responde a pergunta **às cegas**, vendo só o trecho. Se ele não chegar ao mesmo gabarito, se achar mais de uma alternativa defensável ou se apontar qualquer problema, a pergunta é descartada.
6. **Perguntas de molde** (montadas pelo jogo na hora, no Golem World e na roleta) não passam por IA: são construídas por código a partir de um trecho do Sefaria, e a resposta certa é sempre um pedaço literal desse trecho (a palavra que falta, o versículo seguinte, o versículo citado, o autor do comentário). A explicação mostra a fonte e o link. Os Nomes Divinos nunca viram lacuna nem alternativa, e os textos usados seguem as mesmas regras de versão e licença do pipeline. Uma pergunta de molde montada de novo reaproveita o mesmo registro, para valer estatística e denúncia.

7. **Banco de perguntas** (Fase 12, [`QUESTION_BANK.md`](QUESTION_BANK.md)): perguntas prontas nos três idiomas, montadas por código a partir da estrutura e do texto do Sefaria (de qual livro é o versículo, em qual parashá está, quantos capítulos tem…) ou escritas à mão. Cada uma cita um segmento do Sefaria, e o build confere por código que a evidência e o trecho mostrado estão literalmente nele, na versão citada, em cada idioma. Tratados e leis de tema íntimo ficam de fora. As escritas à mão entram aguardando revisão humana.

## 2. Respeito aos textos e às tradições

O gerador **nunca**:

- atribui a um sábio ou comentarista uma opinião que não esteja no texto dele;
- transforma halachá em orientação pessoal ("você deve…", "é permitido você…"). Perguntas de Halachá perguntam *o que o texto diz*, não *o que o jogador deve fazer*;
- formula perguntas que ironizem, ridicularizem ou façam humor com os textos, com personagens bíblicos ou com sábios;
- compara, ranqueia ou contrapõe correntes do judaísmo (ortodoxa, conservadora, reformista etc.) ou outras religiões;
- usa distratores caricatos, ofensivos ou absurdos. Alternativas erradas devem ser plausíveis e respeitosas;
- toca em temas sensíveis sem que o próprio trecho os traga, e mesmo quando os traz (ex.: castigos, guerras, impureza), pergunta sobre o fato textual com sobriedade, sem sensacionalismo;
- usa "todas as anteriores", "nenhuma das anteriores" ou alternativas parecidas.

Trechos que não sustentam uma pergunta justa (genealogias, listas, versículos fora de contexto) devem ser **pulados** pelo modelo com uma justificativa (`skipReason`).

## 3. Nomes Divinos

| Onde | Regra |
|---|---|
| Texto gerado em português (pergunta, alternativas, explicação) | Escrever **D'us** para "Deus" e **Hashem** para o Tetragrama. Nunca transliterar o Tetragrama (Javé, Jeová, Yahweh, YHWH…). |
| Texto gerado em qualquer idioma | O Tetragrama em hebraico nunca aparece por extenso. |
| Citação literal da fonte exibida no app | O app exibe o Tetragrama como **ה׳** (função `renderDivineNamesForDisplay`). O modo `strict` também grafa Elohim e Adonai como א-להים e א-דני. |

A checagem automática (`findDivineNameIssues`) reprova o Tetragrama por extenso e transliterações, e emite aviso para "Deus" (convenção de estilo, não erro). A convenção "D'us" / "Hashem" é configurável em `DIVINE_NAME_STYLE_PT`.

## 4. Licenças e atribuição

- Cada texto do Sefaria tem sua própria licença. O pipeline só ingere versões cujas licenças estão em `ALLOWED_LICENSES` (padrão: Public Domain, CC0, CC-BY, CC-BY-SA) e, entre elas, prefere a menos restritiva.
- Versões com licença `unknown` (comum em traduções comunitárias, inclusive em português) ficam fora, a menos que o detentor dos direitos autorize; nesse caso, o título exato da versão vai em `SEFARIA_AUTHORIZED_VERSIONS`.
- Textos CC-BY-SA exigem atribuição e compartilhamento pela mesma licença: a citação exibida no app sempre traz a fonte, a versão e a licença.
- Cada pergunta guarda a referência, a versão (`versionTitle`) e a licença do trecho de origem. Depois de responder, o jogador vê a fonte com link para o Sefaria.
- Textos com licença não comercial (CC-BY-NC) ficam fora por padrão. Só inclua se o app nunca for monetizado, e documente a decisão.
- O app atribui o Sefaria como fonte, mas **não usa o nome nem o logo do Sefaria** de forma que sugira produto oficial ou parceria, seguindo as diretrizes de uso de marca do Sefaria.
- A coleta usa o Sefaria-Export (índice `books.json` + bucket público), baixando só os livros necessários, e nunca a API pública em massa.
- Os arquivos `merged` do export não são usados, porque misturam versões sem licença própria.

## 5. Revisão humana e denúncias

- Com `REQUIRE_HUMAN_REVIEW=true` (padrão no início), nenhuma pergunta entra no jogo sem aprovação de um revisor.
- Cada revisor entra no `/admin` com a própria conta (criada com `pnpm reviewers create`), e toda decisão fica registrada com o nome de quem decidiu.
- O revisor vê o trecho completo, a evidência destacada, os avisos automáticos e o relatório do verificador; pode aprovar, editar e aprovar, ou reprovar.
- Após responder, o jogador pode denunciar a pergunta (incorreta, ambígua, desrespeitosa, erro de digitação). O que acontece depende de quem denuncia:
  - **Jogador confiável** (cadastrado com e-mail há pelo menos 3 dias, contados do cadastro e não de quando jogava como convidado, e com 30 perguntas respondidas; revisores sempre): uma denúncia de desrespeito tira a pergunta de circulação na hora; três denúncias confiáveis de outro tipo também tiram.
  - **Convidado ou conta nova**: a denúncia vai para a fila de revisão (as de desrespeito no topo, destacadas) e não tira a pergunta sozinha. Contas de convidado são grátis e ilimitadas; sem essa regra, um script poderia esvaziar o jogo denunciando todas as perguntas.
  - **Disjuntor**: no máximo 20 retiradas automáticas por dia no jogo todo e 5 por denunciante. Passou disso, as denúncias só vão para a fila e o servidor registra um aviso.
  - Cada jogador faz no máximo 20 denúncias por dia.
- Pergunta retirada (`retired`) volta para a fila de revisão; o revisor decide se ela volta, sai de vez ou se a denúncia foi improcedente.
- Apelidos aparecem no ranking: só letras latinas e hebraicas são aceitas, e nomes que imitam a equipe ("Admin", "Moderador", "Sefaria") e ofensas, inclusive antissemitas, são recusados na hora; um revisor troca qualquer outro apelido inadequado com `pnpm reviewers reset-name`.

## 6. Dificuldade

A IA rotula cada pergunta com a rubrica de `DIFFICULTY_RUBRIC` (Fácil, Médio, Difícil, Especialista). O rótulo original fica guardado (`aiDifficulty`) e o nível em uso (`difficulty`) é recalibrado pelo desempenho real dos jogadores depois de 30 respostas, andando no máximo um nível por vez. Ver `docs/GAME_RULES.md`.
