---
version: 1
name: Fretless Design System
description: Sistema visual do Fretless, a plataforma de estudo de violino. Papel quente e calmo como fundo, tinta escura, um único acento cor de verniz de violino para ação, e as quatro cordas com cor própria. Tipografia amigável (Figtree) com um serif suave (Fraunces) só em títulos. Tudo arredondado, com pouca sombra e muito espaço — a tela deve parecer uma estante de estudo arrumada, não um painel.
colors:
  canvas: "#faf6ef"
  surface: "#ffffff"
  surface-soft: "#f3eee5"
  surface-sunken: "#ece6db"
  hairline: "#e4ddd1"
  hairline-strong: "#cfc6b7"
  ink: "#1f1b17"
  ink-muted: "#5d564e"
  ink-subtle: "#8c847a"
  primary: "#c2571d"
  primary-hover: "#a84912"
  primary-soft: "#fbe9dd"
  on-primary: "#ffffff"
  in-tune: "#2e8b57"
  in-tune-soft: "#dff3e6"
  close: "#d9a21b"
  close-soft: "#fcf1cf"
  off: "#d64545"
  off-soft: "#fbe1e1"
  info: "#3b6fd6"
  info-soft: "#e3ebfb"
  string-g: "#3aa86a"
  string-d: "#3a8fd6"
  string-a: "#7c5cd6"
  string-e: "#e07a2c"
  focus: "#3b6fd6"
  dark-canvas: "#16130f"
  dark-surface: "#201c17"
  dark-surface-soft: "#2a241e"
  dark-hairline: "#3a332b"
  dark-ink: "#f4efe7"
  dark-ink-muted: "#b7aea2"
  dark-primary: "#e07a3a"
  dark-in-tune-soft: "#1e3b2a"
  dark-close-soft: "#3d3012"
  dark-off-soft: "#3f1f1f"
  dark-info-soft: "#1d2b47"
typography:
  display:
    fontFamily: Fraunces
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.5px
  title:
    fontFamily: Fraunces
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.2
  heading:
    fontFamily: Figtree
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Figtree
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-strong:
    fontFamily: Figtree
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  caption:
    fontFamily: Figtree
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.2px
  numeric:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: 500
    lineHeight: 1
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  section: 64px
radius:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 999px
elevation:
  flat: none
  card: 0 1px 2px rgba(31,27,23,.06)
  raised: 0 8px 24px rgba(31,27,23,.10)
  overlay: 0 24px 64px rgba(31,27,23,.18)
motion:
  fast: 120ms
  normal: 200ms
  slow: 320ms
  ease: cubic-bezier(.2,.8,.2,1)
---

# Fretless Design System

Este arquivo diz **como o Fretless deve parecer**. O `CLAUDE.md` diz como ele é construído. Toda decisão visual
que vale para o app inteiro entra aqui na mesma tarefa em que é tomada. Cor, fonte ou espaçamento fora deste
arquivo é desvio.

## 1. Direção

**Estante de estudo, não painel de controle.** A pessoa abre o app com o violino na mão, muitas vezes num tablet
na estante, e quer saber em três segundos o que fazer agora. Então:

- **Papel quente** (`canvas`) em vez de branco frio ou preto. Cansa menos em sessões de 30 minutos e combina com
  madeira e partitura.
- **Um acento só**, cor de verniz (`primary`). Ele marca *a* ação principal de cada tela e mais nada. Se uma tela
  tem dois botões laranja, um deles está errado.
- **As cordas têm cor fixa** (Sol verde, Ré azul, Lá roxo, Mi laranja) em todo lugar: pista do highway, chip de
  corda, afinador, ícones. A pessoa aprende as cores uma vez.
- **Semântica de afinação em três cores**: `in-tune` (dentro de ±10 cents), `close` (±10 a ±25) e `off` (além).
  Nunca usar essas três para outra coisa.
- **Muito espaço, pouca borda.** Agrupar por distância e fundo (`surface` sobre `canvas`), não por linhas. Hairline
  só onde uma lista precisa de divisor.
- **Modo escuro existe** (tokens `dark-*`) e é o padrão da tela **Tocar**, onde o foco é a pauta e o highway. As
  demais telas seguem a preferência do sistema.

Referências de direção (ritmo e densidade, não identidade): o papel quente e o serif calmo da Oura; a clareza e os
cartões com tinta pastel do Notion; a disciplina de um acento só do Linear.

## 2. Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| `display` / `title` | **Fraunces** (serif variável, ótica suave) | Nome da tela, título da peça, saudação. Nunca em botão, chip ou tabela. |
| `heading` / `body` / `caption` | **Figtree** | Toda a interface. |
| `numeric` | **JetBrains Mono** | Cents, BPM, cronômetro, contadores de repetição — tudo que muda em tempo real e não pode "pular" de largura. |

Nomes de nota em **português** por padrão (Dó, Ré, Mi, Fá, Sol, Lá, Si), com opção C/D/E nas configurações.
Acidentes como símbolo (♯ ♭), não como `#`/`b`, exceto no `numeric`.

Escala: 13 · 16 · 20 · 28 · 40. Corpo nunca abaixo de 16px; `caption` só em rótulo e metadado.

## 3. Cor por função

| Função | Token |
|---|---|
| Fundo da tela | `canvas` |
| Cartão, painel, modal | `surface` (com `elevation.card`) |
| Área secundária dentro de cartão, campo de formulário | `surface-soft` |
| Trilho de progresso, fundo de highway | `surface-sunken` |
| Texto | `ink`; secundário `ink-muted`; metadado `ink-subtle` |
| Ação principal, item ativo da navegação, progresso do dia | `primary` |
| Fundo de destaque suave (item atual da rotina, dica) | `primary-soft` |
| Afinação | `in-tune` / `close` / `off` (+ `-soft` para fundo) |
| Informação neutra, link | `info` |
| Cordas | `string-g` `string-d` `string-a` `string-e` |
| Paleta sépia (livre para todos, em Configurações) | os mesmos tokens, redefinidos sob `[data-accent="sepia"]` em `tokens.css`; nenhum componente conhece a paleta |

Proibido: gradientes decorativos, vidro fosco, neon, sombra colorida, cinza puro (`#808080`) — todo cinza é quente.

## 4. Componentes

**Botão.** Altura 44px (toque) / 40px (desktop), raio `pill`, `body-strong`. Variantes: *primário* (`primary`),
*secundário* (`surface-soft` + `ink`), *fantasma* (só texto). Ícone à esquerda quando ajuda a entender, nunca só
ícone sem rótulo em ação principal. Um primário por tela.

**Cartão.** `surface`, raio `lg`, padding `lg`, `elevation.card`. Título em `heading`, corpo em `body`. Cartão
clicável inteiro ganha `elevation.raised` no hover e borda `focus` no teclado.

**Linha de rotina.** Número do passo · título · meta ("5 repetições limpas") · duração em `numeric` pequeno · estado
(a fazer / atual com `primary-soft` / feito com check `in-tune`). Arrastável no editor.

**Chip de corda.** Pílula com a cor da corda e o nome (Sol, Ré, Lá, Mi). Também o indicador de pista.

**Afinador.** Mostrador horizontal de −50 a +50 cents, agulha em `ink`, zona central `in-tune-soft`, nome da nota em
`display`, cents em `numeric`. Modo "ressonância" troca a agulha por um círculo que cresce quando a nota ressoa.

**Highway.** Quatro pistas horizontais com a cor da corda a 12% de opacidade sobre `surface-sunken`; notas como
pílulas com a cor da corda; linha de agora em `ink`; barras de compasso em `hairline-strong`. Acerto pinta a nota de
`in-tune`, erro de `off`, quase de `close`. Mi fica em cima e Sol embaixo, cada pista com o nome da corda à
esquerda; a nota da vez ganha contorno de 2px em `ink`. Usa o mesmo eixo de tempo da pauta (linha de agora a 20%, 6 s à
frente), então na vista "As duas" as notas das pistas e da pauta passam pela linha juntas.

**Pauta.** Canvas próprio em `apps/web/src/areas/tocar/ScrollingStaff.tsx` (portado do `StaffView` nativo; VexFlow foi
descartado em 28/10 porque a pauta precisa rolar a 60 fps e seguir os tokens). Fundo `surface-sunken`, linhas em
`ink-muted` a 60%, barras em `hairline-strong`, cabeças em `ink`, nota atual e linha de agora em `primary`, nota
avaliada em `in-tune` (Perfeita/Ótima), `close` (Boa) ou `off` (Errada), nota passada sem veredito em `ink` a 40%.
A linha de agora fica a 20% da largura e a tela mostra 6 s à frente; as notas vêm da direita.

**Anel de progresso.** Para "minutos de hoje" e "estrelas do módulo". Trilho `surface-sunken`, preenchimento
`primary`, número em `numeric` no centro.

**Estrelas.** Três, em `close` (dourado). Vazias em `hairline-strong`. Sempre com o critério ao lado na primeira vez
("3 estrelas = 95% no andamento escrito").

**Cronômetro e contador de repetições.** `numeric` grande, centralizado, com rótulo em `caption` abaixo. O contador
de repetições mostra também as últimas cinco tentativas como pontos coloridos (`in-tune`/`off`).

**Estado vazio.** Ilustração simples em linha (uma cor, `ink-subtle`), uma frase do que fazer e o botão primário.
Nunca "Nenhum item encontrado".

**Toast.** Canto inferior, `surface`, `elevation.raised`, some em 4 s. Para "sessão salva", "gravação pronta".
Erros de áudio não são toast: são um painel inline que fica até resolver.

**Aviso de fone.** Componente próprio (ícone de fone + frase), mostrado em todo exercício com drone. Não é um
toast; a pessoa confirma uma vez por sessão.

## 5. Layout

- **Desktop (≥1024px):** barra lateral fixa de 240px com as cinco áreas (Hoje, Praticar, Músicas, Ferramentas,
  Progresso) e Configurações no rodapé. Conteúdo com largura máxima 1120px, gutter `xl`.
- **Tablet (768–1023px):** barra inferior com as cinco áreas, conteúdo em largura total, gutter `lg`. É o alvo
  principal: tablet na estante.
- **Celular (<768px):** barra inferior, uma coluna, gutter `md`. A tela Tocar vira paisagem obrigatória.
- **Tocar** é sempre tela cheia, sem navegação; sai com o botão "Terminar" ou Esc.
- Grid de 12 colunas, gap `lg`. Cartões em 1, 2 ou 3 colunas; nunca 4.
- Área de toque mínima 44×44. Teclado: Tab percorre, Enter começa, Esc volta — em todas as telas.

## 6. Movimento

Só `transform` e `opacity`. Entrada de cartão: 200ms `ease`, 8px para cima. Troca de tela: fade 120ms. Highway e
agulha do afinador rodam a 60fps sem transição CSS (é animação por frame). `prefers-reduced-motion` desliga tudo
menos o highway, que é conteúdo.

## 7. Voz

Português do Brasil, "você", frases curtas, sem ponto de exclamação em série. Cada exercício diz **o que ouvir**
("ouça a corda Ré vibrar junto") antes de dizer o que fazer. Erro de áudio diz o que fazer a seguir ("Escolha outra
entrada em Configurações"), não o que deu errado por dentro. Elogio é específico ("afinação estável na corda Lá"),
nunca genérico ("ótimo trabalho!").

## 8. Faça / não faça

- Faça: um primário por tela; cor de corda fixa; cents em mono; título em serif só no topo.
- Faça: a próxima ação da pessoa visível sem rolar, em toda tela.
- Não: gamificação que compete com o feedback (confete, ranking na Hoje). Estrelas e sequência ficam em Progresso e
  numa linha discreta da Hoje.
- Não: modal sobre modal; mais de dois níveis de navegação; ícone sem rótulo na barra.
- Não: texto em inglês para a pessoa (ids e código ficam em inglês).
