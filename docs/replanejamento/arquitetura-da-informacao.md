# Arquitetura da informação

Cinco áreas na navegação, uma tela de execução em tela cheia, e Configurações fora da barra. Dois níveis no
máximo: área → detalhe. Esc/voltar sempre sobe um nível.

```
Hoje ───────────── sessão do dia · revisão pendente · caderno da aula · atalhos
Praticar ───────── Rotinas (lista → editor → sessão)  |  Exercícios (módulos → lista → detalhe)
Músicas ────────── Suzuki (livros → peça)  |  Biblioteca (busca → peça)  |  Importar
Ferramentas ────── Afinador · Metrônomo · Drone · Gravador
Progresso ──────── resumo · calendário · por módulo · histórico · gravações
Configurações ──── áudio e calibração · notação · tema · caderno · dados · Steam
[Tocar] ────────── tela cheia, aberta de qualquer exercício, peça ou passo de rotina
```

## 1. Primeira abertura (onboarding, 2 minutos)

1. **Boas-vindas** — uma frase e "Começar".
2. **Onde você está** — iniciante do zero · Suzuki livro N (1–10) · toca há N anos sem método. Define o nível
   inicial (N1–N7) e a trilha.
3. **Quanto tempo** — minutos por dia (15 · 25 · 45 · personalizado) e dias por semana. Define a rotina padrão.
4. **Microfone** — escolhe a entrada, mostra o afinador ao vivo, pede uma corda solta. Se nada chega, diz o que
   fazer (permissão, outra entrada) e deixa pular.
5. **Calibração** — toca quatro cliques, a pessoa toca junto, o app mede o atraso e guarda. Pode refazer em
   Configurações.
6. **Pronto** — mostra a sessão de hoje já montada e "Começar agora".

## 2. Hoje

A tela que responde "o que eu faço agora". Sem rolar, em ordem:

- **Cabeçalho**: saudação com o nome, data, e uma linha discreta: sequência de dias · minutos esta semana.
- **Sessão de hoje** (cartão principal): nome da rotina, duração total, lista dos blocos com estado. Botão
  primário **Começar** (ou **Continuar** se já começou, com "3 de 7 feitos"). Link "Trocar rotina".
- **Revisão pendente**: peças e exercícios cujo intervalo de revisão venceu, com "há 9 dias". Cada um abre em
  Tocar direto. É o princípio Suzuki de nunca aposentar peça.
- **Caderno da aula**: as tarefas que a professora passou na última aula (texto livre + itens ligados a
  exercícios/peças). Marcar feito. "Próxima aula: quinta".
- **Atalhos**: Afinador · Metrônomo · Drone (abrem como painel lateral, sem sair da Hoje).

## 3. Praticar

### Rotinas

- **Lista**: *Rotina de hoje* (gerada), *Minhas rotinas* (criadas), *Da aula* (gerada do caderno). Cada uma com
  duração, blocos e "última vez". Botões: Começar · Editar · Duplicar.
- **Editor**: blocos ordenados, arrastáveis. Um bloco tem **tipo** (aquecimento, afinação, escalas, técnica,
  estudo, peça nova, revisão, leitura, livre), **item** (um exercício, uma peça, um trecho de peça, ou "o app
  escolhe"), **meta** (tempo: 5 min · repetições: 5 limpas seguidas · estrelas: chegar a 2) e **variação**
  (andamento −20%, ritmo pontuado, arcada alternativa, com drone). "Repetir até" é o que torna a rotina repetitiva
  com propósito: o bloco só fecha quando a meta fecha ou o tempo acaba.
- **Sessão (execução)**: uma tela por bloco. Topo: passo N de M e cronômetro do bloco. Centro: título, objetivo
  ("ouça…"), pauta em miniatura, meta com contador de repetições e os últimos resultados como pontos. Botões:
  **Tocar** (abre Tocar com avaliação), **Só ouvir** (toca a referência sintetizada), **Concluir**, **Pular**.
  Ao fim: resumo da sessão (minutos, blocos, melhor/pior, o que entra em revisão), "Salvar e sair".

### Exercícios

- **Módulos**: os nove, como cartões com cor de tinta pastel própria, descrição de uma linha e anel de estrelas.
- **Lista do módulo**: filtros por nível, tipo e estrelas; busca. Linha: título · nível · estrelas · última vez.
- **Detalhe do exercício**: objetivo e "o que ouvir" em destaque, pauta inteira rolável, parâmetros (tonalidade,
  oitavas, arcada, andamento escrito), histórico (últimas 10 tentativas: precisão e andamento), botões **Tocar**,
  **Só ouvir**, **Adicionar à rotina**.

## 4. Músicas

- **Suzuki**: os dez livros como trilha vertical. Cada livro: foco técnico, peças em ordem, estado (não começada ·
  estudando · revisão). Peça de domínio público abre em Tocar; peça só de referência mostra o cartão (o que
  prepara, exercícios daqui que ajudam) e um campo para a pessoa marcar "aprendi na aula".
- **Biblioteca**: a coleção CC0 + importadas. Busca por título/compositor; filtros por nível (calculado pelo
  âmbito e ritmo), tonalidade, compasso. Linha: título · compositor · nível · duração · estrelas.
- **Importar**: arrastar MusicXML/MXL ou escolher arquivo; escolher a parte; preview; salvar na biblioteca.
- **Detalhe da peça**: título em serif, compositor, tonalidade, compasso, andamento, duração (já sem a introdução
  silenciosa). **Trechos**: o app divide por frases/compassos e a pessoa pode marcar os seus ("compassos 9–16").
  Cada trecho: Tocar · Loop · andamento. Histórico e gravações da peça. Botões **Tocar inteira**, **Praticar
  trecho**, **Adicionar à rotina**.

## 5. Tocar (tela cheia)

Única tela em modo escuro por padrão. Layout fixo:

- Topo: título · andamento (− 114 +) · pontos de compasso · Pausar · Terminar.
- Highway (60% da altura) com as quatro pistas.
- Pauta (25%) com a nota atual em `primary`.
- Rodapé: afinador compacto ao vivo · chip da corda sugerida · nome da nota esperada.
- Painel lateral recolhível: metrônomo (ligar, acento), drone (nota, aviso de fone), loop do trecho, contagem.

Fim da execução: **Resultado** — precisão de afinação e de ritmo, estrelas ganhas (com o critério), mapa de
compassos colorido (`in-tune`/`close`/`off`), lista das notas erradas com "cents" e "cedo/tarde", botões **Repetir
os compassos difíceis** (monta um loop com os piores), **Repetir tudo**, **Voltar**.

## 6. Ferramentas

- **Afinador**: tela inteira, nota em `display`, mostrador de cents, chip da corda detectada, botão por corda para
  tocar a referência. Modo **ressonância** para tonalização (o círculo cresce quando a nota ressoa).
- **Metrônomo**: BPM grande com roda, compasso, subdivisão, acento, **andamento progressivo** (de 60 a 90 em
  passos de 4 a cada 8 compassos — o jeito de subir uma escala de velocidade).
- **Drone**: nota e oitava, timbre (senoidal/corda), volume, aviso de fone. Pode ficar ligado por cima de qualquer
  exercício.
- **Gravador**: gravar, ouvir, nomear, ligar a uma peça. Comparação lado a lado de duas gravações da mesma peça.

## 7. Progresso

- **Resumo**: minutos hoje/semana/total, dias seguidos, nível atual e o que falta para o próximo.
- **Calendário**: mapa de calor dos últimos 90 dias (minutos por dia).
- **Por módulo**: anel de estrelas por módulo; clicar lista os exercícios com estrelas.
- **Histórico de sessões**: data, rotina, minutos, blocos feitos, resumo.
- **Gravações**: por peça, por data.
- **Exportar**: CSV/JSON dos dados (os dados são da pessoa).

## 8. Configurações

Áudio (entrada, saída, calibração de latência com teste, ganho) · Notação (Dó/Ré ou C/D, mão esquerda: mostrar
dedilhado sugerido) · Aparência (sistema/claro/escuro, tamanho da fonte) · Caderno da aula (dia da aula, nome da
professora, lembrete) · Dados (pasta, backup, apagar) · Steam (conquistas, só se estiver conectado).

## 9. Fluxos que precisam funcionar de ponta a ponta

1. Abrir pela primeira vez → calibrar → tocar a primeira sessão → ver o resumo. (≤ 5 min)
2. Abrir num dia comum → Começar → 25 min de blocos → resumo → fechar. Zero decisões além de "Começar".
3. Voltar da aula → anotar as tarefas no caderno → elas viram a rotina "Da aula" → praticar na semana.
4. Começar uma peça nova → importar ou escolher → praticar trecho em loop com andamento baixo → subir o andamento
   com o metrônomo progressivo → tocar inteira → entrar na revisão.
5. Afinar o violino antes de tudo, sem sair da Hoje.
