# Pedagogia e modelo de rotina

O que a pesquisa diz e como vira regra no app. A base detalhada e as fontes estão na skill
`.claude/skills/violin-pedagogy` (SKILL.md e references/sources.md); aqui está só o que muda o produto.

## 1. O que os métodos concordam

| Fonte | O que vale para o app |
|---|---|
| Suzuki | Escuta diária; tonalização antes de tudo; **revisão permanente** (peça nunca se aposenta); uma coisa por vez; leitura vem depois. |
| Perlman, Rosand, Flesch, Galamian | Sessão = **escalas → estudos → repertório**; escala diferente a cada dia, com arcadas e ritmos variados; aceleração de Galamian (1, 2, 3, 4, 6, 8 notas por arco). |
| Fischer, Weilerstein | Afinação pelo instrumento: **notas que ressoam** com a corda solta, drone, cordas dobradas com corda solta; ouvir o batimento parar. |
| Carter & Grahn 2016 e a literatura de prática | **Intercalar** (alternar tarefas) retém mais que blocar, mesmo parecendo pior na hora; **espaçar** ao longo dos dias; variar (andamento, ritmo, arcada). |
| Meta-análises de gamificação | Estrelas e sequência movem motivação, não competência. Ficam discretas; o feedback por nota é o produto. |

## 2. Trilha de níveis (N1–N7)

Alinha os módulos existentes aos livros Suzuki e à escada de escalas, para o app saber o que vem depois.

| Nível | Suzuki | Escalas | Técnica | Leitura |
|---|---|---|---|---|
| N1 | Livro 1 (variações, Twinkle) | 1 oitava, Lá e Ré maior, cordas soltas | détaché, legato, staccato; notas longas; mudança de corda | nomes das notas; ritmos de semínima e colcheia |
| N2 | Livro 1 (fim) – 2 | 1 oitava, Sol e Dó maior; arpejos | ligaduras de 2 e 4; padrões de dedo 1–4 | 1ª posição, pontuado |
| N3 | Livro 2 – 3 | 2 oitavas com uma mudança; menores | **3ª posição**; vibrato inicial; cordas dobradas com solta | 3ª posição; síncope |
| N4 | Livro 4 | 2 oitavas todas as tonalidades; terças quebradas | 2ª e 4ª posição; martelé; mudança de corda ligada | tercinas; tonalidades até 3 acidentes |
| N5 | Livro 5 | 3 oitavas maiores | **5ª posição**; spiccato via collé | semicolcheias; mudanças de compasso |
| N6 | Livro 6 – 7 | 3 oitavas menores; cromática; aceleração completa | 6ª–7ª posição; cordas dobradas | leitura de peça inteira a 1ª vista |
| N7 | Livro 8 – 10 | sistema Flesch/Galamian por tonalidade do dia | sautillé, ricochet, trinados | — |

Regra: a pessoa sobe de nível quando tem 2 estrelas na maior parte dos exercícios do nível e a professora não
disse o contrário (campo "nível fixado pela professora" nas Configurações). O app nunca bloqueia conteúdo de
nível acima — só não o coloca na rotina gerada.

## 3. Modelo de rotina

```
Rotina  = nome · duração alvo · lista de Blocos · origem (gerada | minha | da aula)
Bloco   = tipo · item · meta · variação · duração alvo
tipo    = aquecimento | afinação | escalas | técnica | estudo | peça-nova | revisão | leitura | livre
item    = exercício | peça | trecho de peça | "o app escolhe dentro do tipo"
meta    = tempo (min) | repetições limpas seguidas (n) | chegar a k estrelas | só tocar uma vez
variação= andamento (% do escrito) | ritmo (pontuado, invertido, tercina) | arcada | com drone | com metrônomo
```

**Rotinas padrão por tempo** (proporções da literatura: ~1/5 escalas, ~1/5 estudos, o resto repertório e
revisão; aquecimento curto sempre):

| Bloco | 15 min | 25 min | 45 min |
|---|---|---|---|
| Aquecimento (notas longas + mudança de corda) | 2 | 3 | 5 |
| Afinação (tonalização / ressonância / drone) | 2 | 3 | 5 |
| Escalas e arpejos (tonalidade do dia, arcada do dia) | 3 | 5 | 9 |
| Técnica ou estudo (arcada, posição, ritmo) | 2 | 4 | 8 |
| Peça nova (trecho em loop, andamento baixo) | 4 | 6 | 10 |
| Revisão (peça antiga, inteira) | 2 | 3 | 6 |
| Leitura à primeira vista | — | 1 | 2 |

**Como o app gera a rotina de hoje:**

1. Pega a rotina padrão da duração escolhida.
2. **Intercala**: nunca dois blocos do mesmo tipo em sequência; escala e estudo mudam de tonalidade/arcada por dia
   (semente do dia, como hoje no `PracticePlan`).
3. **Espaça**: o item de cada bloco é escolhido por prioridade = (dias desde a última vez ÷ intervalo-alvo) ×
   (1 + falta de estrelas). Intervalo-alvo por estrelas: 0★ 1 dia · 1★ 3 dias · 2★ 7 dias · 3★ 21 dias. Peça
   de revisão Suzuki: 30 dias no máximo, nunca sai da fila.
4. **Caderno da aula** manda: tarefas da professora entram antes de qualquer escolha automática, no bloco do seu
   tipo.
5. **Uma coisa por vez**: a variação de um bloco muda só um eixo (andamento *ou* ritmo *ou* arcada).
6. A pessoa pode trocar qualquer bloco; a troca fica para o dia, não altera a rotina salva.

**Repetição com propósito.** Meta "n repetições limpas seguidas" é o coração da "rotina repetitiva": o contador
só avança com uma execução ≥ 90% de afinação e ritmo; um erro zera a série; os últimos resultados aparecem como
pontos. Depois de 3 séries fechadas em dias diferentes, o app propõe subir o andamento (+4 a +8 BPM, metrônomo
progressivo) ou trocar a variação.

## 4. O que cada tipo de bloco mede

| Tipo | Métrica principal | Como aparece |
|---|---|---|
| Notas longas | estabilidade de altura (desvio em cents ao longo da nota) e de volume | linha da nota no tempo; "oscilou 6 cents" |
| Afinação / ressonância | distância em cents da corda solta de referência; tempo até estabilizar | círculo de ressonância; "achou em 1,2 s" |
| Escalas | % de notas dentro de ±10 cents; notas que tendem alto/baixo por dedo | mapa por dedo (1º dedo sempre alto na corda Mi) |
| Técnica / arcada | ritmo (desvio em ms) e uniformidade entre notas de um arco | pontos cedo/tarde por nota |
| Peça / trecho | afinação + ritmo por compasso; estrelas no andamento escrito | mapa de compassos colorido |
| Leitura | % de notas certas ao primeiro contato, sem parar | só uma vez, nunca repete a mesma página |

Estrelas continuam como hoje: 1 por tocar, 2 por 80%, 3 por 95% **no andamento escrito**.

## 5. Suzuki no app, com os limites certos

- As **edições** são protegidas; as **melodias** antigas não. Trilha dos dez livros como cartões (foco, peças,
  o que prepara). Peças de domínio público (Twinkle, Lightly Row, Aunt Rhody, Allegro de Suzuki não — é dele)
  entram tocáveis conforme forem transcritas de fontes livres e verificadas.
- "Aprendi na aula" marca a peça como **em revisão** mesmo sem partitura no app: ela entra na fila de revisão e a
  pessoa toca com o gravador e o afinador, sem avaliação por nota.
- **Escuta diária** não cabe num app sem gravações licenciadas; a Hoje lembra ("ouça a peça da semana") e deixa
  marcar feito. Não fingir que a referência sintetizada substitui a gravação.

## 6. Afinação: três ferramentas, uma regra

1. **Ressonância** (tonalização): notas que compartilham classe com uma corda solta — a nota entra em `in-tune`
   quando o detector vê a corda solta vibrando por simpatia.
2. **Drone**: tônica sustentada; o app mede o batimento e mostra "parou" quando a diferença fica < 3 cents.
   Fone obrigatório, com aviso próprio.
3. **Corda dobrada com corda solta**: a avaliação olha só a nota dedilhada; a solta é referência.

Regra: afinador é ferramenta de checagem, não de estudo. Nos blocos de afinação o mostrador de cents fica
escondido por padrão e aparece ao pedir.

## 7. Caderno da aula

A pessoa tem aulas particulares. O app não substitui a professora; ele carrega a aula para a semana.

- Depois de cada aula: data, texto livre, lista de tarefas; cada tarefa pode apontar para um exercício, uma peça ou
  um trecho e ter uma meta.
- As tarefas viram a rotina "Da aula" e entram na Hoje até a próxima aula.
- No dia da aula seguinte, o app monta um resumo da semana (minutos, o que foi feito, onde errou mais) que a pessoa
  pode mostrar à professora.
