# Banco de perguntas

Desde a Fase 12, o jogo traz um banco com mais de 1.000 perguntas por tema do sevivon, já escritas em português, inglês e hebraico. Elas valem no sevivon e, quando estão presas a uma parashá, também nas fases do Golem World.

| Tema | Perguntas | Fácil | Médio | Difícil | Especialista |
|---|---:|---:|---:|---:|---:|
| Torá | 1.067 | 124 | 516 | 240 | 187 |
| Profetas e Escritos | 1.042 | 10 | 77 | 453 | 502 |
| Mishná | 1.057 | 12 | 578 | 467 | 0 |
| Talmud | 1.116 | 11 | 131 | 486 | 488 |
| Halachá | 1.871 | 10 | 530 | 631 | 700 |
| Midrash e Agadá (com o Zohar) | 1.372 | 9 | 294 | 674 | 395 |

A Cabalá continua só no Golem World, como trilha; as perguntas do Zohar caem no sevivon dentro de Midrash e Agadá. As de comentaristas (Rashi, Ramban, Ibn Ezra, Sforno) caem em Torá e as do Sefer HaChinuch em Halachá.

## De onde vêm

Todas saem do acervo do Sefaria, nunca de memória:

- **Geradores** (`pipeline/src/bank/gen/`) leem a estrutura dos livros (capítulos, parashiot, tratados, ordens, capítulos do Talmud com o nome tradicional, livros e leis do Mishné Torá, seções do Shulchan Aruch) e o texto de cada segmento. Exemplos: em qual parashá está um versículo ou um episódio, qual parashá vem depois, de qual livro dos Profetas é um versículo, qual salmo começa assim, de qual tratado é uma mishná, em qual tratado está o capítulo "Hamafkid", de quais leis do Rambam é uma halachá, em qual parte do Shulchan Aruch está um tema, qual parashá o Midrash Rabá comenta.
- **Perguntas escritas à mão** (`pipeline/bank/curated/*.json`): as mais conhecidas e fáceis (a arca de Nôach, a escada de Yaakov, Hilel "num pé só", os oito níveis de tsedacá…). Cada uma traz a referência e o pedaço do texto hebraico que a prova.

Os nomes em hebraico e em inglês (livros, tratados, leis, seções) vêm dos títulos do próprio Sefaria; os em português ficam em `pipeline/src/bank/names.ts`.

## Como cada pergunta é conferida

`pnpm pipeline bank-build` monta o banco e confere tudo antes de gravar `pipeline/bank/<tema>.jsonl`:

1. **A evidência existe.** Cada pergunta cita um segmento do Sefaria (`sourceRef`). Em cada idioma, o trecho de prova e o trecho mostrado acima da pergunta têm de estar literalmente nesse segmento, na versão citada (comparação sem nikud nem pontuação, a mesma do resto do pipeline). Em português e hebraico, a citação é o original hebraico; em inglês, a tradução aberta do Sefaria quando há (JPS 1917, Sefaria Community Translation, Mishnah Yomit…), senão o hebraico.
2. **Só licenças abertas.** As versões vêm da mesma lista do pipeline (Domínio Público, CC0, CC-BY, CC-BY-SA). As traduções em português do Sefaria com licença desconhecida não entram.
3. **Resposta única.** Quando a pergunta mostra um trecho ("de qual livro é este versículo?"), o trecho é a abertura mais curta que só aquele segmento tem em todo o conjunto (ex.: todo o Tanach).
4. **Nomes Divinos.** Os textos escritos (pergunta, alternativas, explicação) passam pela mesma checagem das perguntas da IA, nos três idiomas: nunca o Tetragrama por extenso. O texto hebraico citado aparece no app com ה׳.
5. **Respeito.** Tratados e leis de tema íntimo (Nidá, Zavim, Sotá, Yevamot, Issurei Biá e afins) ficam fora das perguntas com trecho.
6. **Sem repetição.** Mesmo id, ou mesmo enunciado com o mesmo trecho e a mesma resposta, não entram duas vezes. Para nenhum tipo de pergunta dominar o banco, cada gerador tem um teto de 800 (amostra fixa).

As alternativas são embaralhadas igual nos três idiomas (e, a cada jogada, o servidor embaralha de novo a ordem mostrada). As numéricas aparecem em ordem crescente.

## Como usar

```bash
# Gravar no PostgreSQL o banco que vem no repositório (não precisa de internet nem do Sefaria):
pnpm pipeline bank-import            # as escritas à mão entram aguardando revisão
pnpm pipeline bank-import --approve  # ou já aprovadas

# Remontar o banco (depois de mudar um gerador ou as perguntas escritas à mão):
pnpm pipeline download --journey     # se ainda não tem o espelho do Sefaria-Export
pnpm pipeline download --category neviim_ketuvim --category mishnah --category talmud --category halakhah --category midrash_aggadah
pnpm pipeline bank-build             # mostra quantas ficaram por tema e por que alguma ficou de fora
```

`bank-import` pode rodar de novo a qualquer hora: a chave de cada pergunta é o id dela no banco. O que mudou é atualizado (a dificuldade em uso, que o jogo recalibra pelo desempenho, fica); o que saiu do banco é retirado de circulação, sem apagar o histórico de jogadas.

No banco de dados, cada pergunta é uma linha em `Question` (em português, `origin = bank`) e duas em `QuestionTranslation` (inglês e hebraico, `status = bank`), cada uma com a citação, o idioma e a versão daquele idioma. Denúncias, revisão no `/admin` e calibração de dificuldade funcionam como nas outras perguntas.

## Limites conhecidos

- A maioria das perguntas dos geradores é difícil ou de especialista; as fáceis vêm sobretudo das escritas à mão e dos episódios das parashiot. Ampliar a lista escrita à mão (ou gerar com a IA e revisar) é o caminho para mais perguntas fáceis.
- Os textos em português citados são o original hebraico: o Sefaria quase não tem tradução portuguesa com licença aberta. Uma tradução portuguesa publicada no Sefaria com licença desconhecida pode entrar se o autor a liberar: basta pôr o título exato da versão em `SEFARIA_AUTHORIZED_VERSIONS` e remontar o banco.
