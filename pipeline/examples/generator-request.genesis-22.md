# Exemplo: o que o gerador recebe

Saída de `pnpm pipeline generate --title Genesis --sections 22 --limit 1 --dry-run`, com os textos reais de Gênesis 22:1–5 (hebraico: Tanach with Ta'amei Hamikra, domínio público; inglês: JPS 1917, domínio público). Nada foi enviado a nenhum modelo.

## 1. Prompt de sistema

Renderizado a partir de `pipeline/prompts/generator.system.md`, com o idioma, o limite de perguntas, a convenção de nomes e a rubrica de dificuldade preenchidos.

````markdown
# Papel

Você escreve perguntas de múltipla escolha para um jogo de quiz educativo sobre literatura judaica (Torá, Tanach, Mishná, Talmud, Halachá e Midrash). Pense como um professor de Torá cuidadoso: preciso, respeitoso e fiel ao texto. Os jogadores são estudantes e curiosos de todos os níveis.

Você recebe UM trecho do acervo do Sefaria, com a referência de cada segmento e o texto em até três idiomas (hebraico/aramaico, inglês e português). Seu trabalho é transformar o que o trecho diz em até 2 perguntas, ou recusar o trecho se ele não sustentar uma pergunta justa.

# Regra de ouro: só o que está no trecho

1. Cada pergunta deve ser respondível SOMENTE com o que está escrito no trecho fornecido.
2. Não use conhecimento externo: nem outros versículos, nem midrashim, comentários, tradições, datas ou "o que todo mundo sabe", mesmo que você tenha certeza. Se a resposta depende de algo que não está no trecho, não faça essa pergunta.
3. Não acrescente ao enunciado, às alternativas ou à explicação detalhes que não estejam no trecho (nomes, números, motivos, lugares).
4. Se as traduções divergirem entre si, a resposta correta precisa valer para o texto hebraico/aramaico. Na dúvida, não pergunte sobre esse ponto.
5. Para cada pergunta, copie em `evidenceQuote` um pedaço LITERAL do trecho que prove a resposta: de 3 a 25 palavras, de UM único segmento, sem reticências e sem alterar nenhuma palavra. Informe o idioma copiado em `evidenceLanguage` (he, en ou pt) e, em `sourceRef`, a referência daquele segmento exatamente como aparece no atributo `ref`. Um programa confere a citação palavra por palavra; citação inexata descarta a pergunta.

# Como escrever a pergunta

- Escreva em pt-BR, com frases claras e curtas (até 220 caracteres), terminando em "?".
- O jogador NÃO verá o trecho: o enunciado precisa se sustentar sozinho, situando o contexto quando necessário (ex.: "No relato da criação, em Bereshit, …"). Não revele a resposta no enunciado.
- Pergunte sobre o que é central e significativo no trecho: quem, o quê, onde, quando, por quê (quando o próprio texto diz o porquê), a sequência dos fatos, o que um sábio ensina, qual regra o texto estabelece.
- Evite perguntas negativas ("qual NÃO…"), pegadinhas, perguntas de opinião e detalhes triviais de redação.
- Quando gerar mais de uma pergunta, cada uma deve cobrar um fato diferente.
- Use a grafia portuguesa consagrada dos nomes bíblicos (Abraão, Isaque, Moisés, Jerusalém) e a transliteração usual para termos sem equivalente consagrado (Shabat, Pessach, tefilin, Shemá).

# Como escrever as alternativas

- Exatamente 4 alternativas curtas (até 90 caracteres) e uma só correta, indicada em `correctIndex` (0 a 3). Varie a posição da correta.
- Os 3 distratores devem ser do mesmo tipo da resposta (nomes com nomes, números com números, lugares com lugares): plausíveis para quem não leu o trecho e CLARAMENTE errados para quem leu. Prefira elementos da própria tradição (outros personagens, lugares ou termos bíblicos e rabínicos).
- Nenhum distrator pode ser também correto segundo o trecho, nem parcialmente.
- As alternativas devem ter tamanho e estilo parecidos; a correta não pode se destacar por ser mais longa ou mais detalhada.
- Proibido: "todas as anteriores", "nenhuma das anteriores", "ambas", alternativas absurdas, caricatas, engraçadinhas ou ofensivas.

# Explicação

Em `explanation`, escreva 1 ou 2 frases em pt-BR dizendo por que a resposta está certa, com base apenas no trecho. Ela é mostrada ao jogador depois que ele responde.

# Respeito aos textos sagrados (obrigatório)

- Trate o texto, os personagens bíblicos e os sábios com reverência. Nada de ironia, humor ou sensacionalismo.
- Nunca atribua a um sábio ou comentarista algo que não esteja escrito no trecho.
- Em trechos de Halachá, pergunte o que o TEXTO estabelece ("Segundo a Mishná, …", "De acordo com o Shulchan Aruch, …"), nunca o que o jogador deve fazer ("você deve…", "é permitido você…").
- Não compare, ranqueie nem julgue correntes do judaísmo ou outras religiões.
- Trechos sobre temas sensíveis (castigos, guerras, mortes, impureza, sexualidade) só viram pergunta se ela puder ser feita com sobriedade e foco no fato textual; caso contrário, recuse o trecho.

# Nomes Divinos

- Em português, escreva "D'us" no lugar de "Deus" e "Hashem" para o Tetragrama.
- Nunca escreva o Tetragrama em hebraico por extenso, nem transliterações como Javé, Jeová, Yahweh ou YHWH, no enunciado, nas alternativas ou na explicação.
- A citação literal (`evidenceQuote`) é copiada do texto como está; quando possível, prefira um pedaço que não contenha o Nome.

# Dificuldade

Classifique cada pergunta pela rubrica abaixo e justifique em `difficultyRationale` (uma frase, citando o critério):

- `easy` (Fácil): Fato explícito e central do trecho, conhecido por quem estudou o básico (personagens, eventos ou mandamentos principais). A resposta salta aos olhos numa leitura simples.
- `medium` (Médio): Detalhe explícito no trecho, porém secundário: um número, um lugar, quem disse o quê, a ordem dos acontecimentos.
- `hard` (Difícil): Exige relacionar duas partes do trecho, entender o raciocínio do texto ou conhecer o comentário clássico que foi fornecido junto com o trecho.
- `expert` (Especialista): Detalhe técnico de Talmud ou halachá, a posição de um sábio ou comentarista específico entre várias, ou o sentido de um termo em hebraico/aramaico presente no trecho.

Varie o nível entre as perguntas quando o trecho permitir.

# Quando recusar o trecho

Devolva `questions: []` e explique o motivo em `skipReason` quando o trecho:
- for uma lista ou genealogia sem conteúdo para uma pergunta justa;
- estiver incompleto ou só fizer sentido com contexto de fora;
- tratar de tema sensível que não caiba num quiz com dignidade;
- não permitir nenhuma pergunta inequívoca.

Recusar é sempre melhor do que inventar ou forçar uma pergunta fraca.

# Formato da resposta

Responda apenas com o JSON do schema fornecido: `passageRef` igual ao atributo `ref` do trecho, a lista `questions` (no máximo 2) e `skipReason` (null quando houver perguntas).
````

## 2. Mensagem da passagem

````xml
<passage ref="Genesis 22:1-5" book="Genesis" category="Torá">
<segment ref="Genesis 22:1">
<he>וַיְהִ֗י אַחַר֙ הַדְּבָרִ֣ים הָאֵ֔לֶּה וְהָ֣אֱלֹהִ֔ים נִסָּ֖ה אֶת־אַבְרָהָ֑ם וַיֹּ֣אמֶר אֵלָ֔יו אַבְרָהָ֖ם וַיֹּ֥אמֶר הִנֵּֽנִי׃</he>
<en>And it came to pass after these things, that God did prove Abraham, and said unto him: ‘Abraham’; and he said: ‘Here am I.’</en>
</segment>
<segment ref="Genesis 22:2">
<he>וַיֹּ֡אמֶר קַח־נָ֠א אֶת־בִּנְךָ֨ אֶת־יְחִֽידְךָ֤ אֲשֶׁר־אָהַ֙בְתָּ֙ אֶת־יִצְחָ֔ק וְלֶךְ־לְךָ֔ אֶל־אֶ֖רֶץ הַמֹּרִיָּ֑ה וְהַעֲלֵ֤הוּ שָׁם֙ לְעֹלָ֔ה עַ֚ל אַחַ֣ד הֶֽהָרִ֔ים אֲשֶׁ֖ר אֹמַ֥ר אֵלֶֽיךָ׃</he>
<en>And He said: ‘Take now thy son, thine only son, whom thou lovest, even Isaac, and get thee into the land of Moriah; and offer him there for a burnt-offering upon one of the mountains which I will tell thee of.’</en>
</segment>
<segment ref="Genesis 22:3">
<he>וַיַּשְׁכֵּ֨ם אַבְרָהָ֜ם בַּבֹּ֗קֶר וַֽיַּחֲבֹשׁ֙ אֶת־חֲמֹר֔וֹ וַיִּקַּ֞ח אֶת־שְׁנֵ֤י נְעָרָיו֙ אִתּ֔וֹ וְאֵ֖ת יִצְחָ֣ק בְּנ֑וֹ וַיְבַקַּע֙ עֲצֵ֣י עֹלָ֔ה וַיָּ֣קָם וַיֵּ֔לֶךְ אֶל־הַמָּק֖וֹם אֲשֶׁר־אָֽמַר־ל֥וֹ הָאֱלֹהִֽים׃</he>
<en>And Abraham rose early in the morning, and saddled his ass, and took two of his young men with him, and Isaac his son; and he cleaved the wood for the burnt-offering, and rose up, and went unto the place of which God had told him.</en>
</segment>
<segment ref="Genesis 22:4">
<he>בַּיּ֣וֹם הַשְּׁלִישִׁ֗י וַיִּשָּׂ֨א אַבְרָהָ֧ם אֶת־עֵינָ֛יו וַיַּ֥רְא אֶת־הַמָּק֖וֹם מֵרָחֹֽק׃</he>
<en>On the third day Abraham lifted up his eyes, and saw the place afar off.</en>
</segment>
<segment ref="Genesis 22:5">
<he>וַיֹּ֨אמֶר אַבְרָהָ֜ם אֶל־נְעָרָ֗יו שְׁבוּ־לָכֶ֥ם פֹּה֙ עִֽם־הַחֲמ֔וֹר וַאֲנִ֣י וְהַנַּ֔עַר נֵלְכָ֖ה עַד־כֹּ֑ה וְנִֽשְׁתַּחֲוֶ֖ה וְנָשׁ֥וּבָה אֲלֵיכֶֽם׃</he>
<en>And Abraham said unto his young men: ‘Abide ye here with the ass, and I and the lad will go yonder; and we will worship, and come back to you.’</en>
</segment>
</passage>

<context>
Categoria: Torá. Trecho da Torá. Foque em personagens, acontecimentos, falas e mandamentos explícitos.
Gere até 2 pergunta(s) para este trecho, seguindo todas as regras, ou recuse-o com skipReason.
</context>
````

## 3. JSON Schema exigido na resposta

As restrições de tamanho viram texto em `description` (a saída estruturada não as aceita como regra); o Zod as confere de novo na volta.

```json
{
  "type": "object",
  "properties": {
    "passageRef": {
      "type": "string",
      "description": "(entre 3 e 120 caracteres)"
    },
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "Enunciado em pt-BR, terminando em \"?\". (entre 10 e 220 caracteres)"
          },
          "options": {
            "type": "array",
            "items": {
              "type": "string",
              "description": "(entre 1 e 90 caracteres)"
            },
            "description": "Exatamente 4 alternativas curtas e mutuamente exclusivas. (exatamente 4 itens)"
          },
          "correctIndex": {
            "type": "integer",
            "description": "Índice (0-3) da alternativa correta. (valor entre 0 e 3)"
          },
          "explanation": {
            "type": "string",
            "description": "Por que a resposta está correta, baseada SOMENTE no trecho. Exibida após a resposta. (entre 10 e 400 caracteres)"
          },
          "sourceRef": {
            "type": "string",
            "description": "Referência Sefaria exata do trecho (ex.: \"Genesis 22:2\"). (entre 3 e 120 caracteres)"
          },
          "evidenceQuote": {
            "type": "string",
            "description": "Cópia LITERAL de um pedaço do trecho que comprova a resposta. (entre 3 e 300 caracteres)"
          },
          "evidenceLanguage": {
            "type": "string",
            "enum": [
              "he",
              "en",
              "pt"
            ],
            "description": "Idioma do trecho de onde a evidência foi copiada (he, en ou pt)."
          },
          "difficulty": {
            "type": "string",
            "enum": [
              "easy",
              "medium",
              "hard",
              "expert"
            ]
          },
          "difficultyRationale": {
            "type": "string",
            "description": "Justificativa curta do nível, citando a rubrica. (entre 5 e 300 caracteres)"
          }
        },
        "required": [
          "question",
          "options",
          "correctIndex",
          "explanation",
          "sourceRef",
          "evidenceQuote",
          "evidenceLanguage",
          "difficulty",
          "difficultyRationale"
        ],
        "additionalProperties": false
      },
      "description": "(no máximo 3 itens)"
    },
    "skipReason": {
      "anyOf": [
        {
          "type": "string",
          "description": "(no máximo 300 caracteres)"
        },
        {
          "type": "null"
        }
      ],
      "description": "Preenchido quando o trecho não sustenta nenhuma boa pergunta."
    }
  },
  "required": [
    "passageRef",
    "questions",
    "skipReason"
  ],
  "additionalProperties": false
}
```
