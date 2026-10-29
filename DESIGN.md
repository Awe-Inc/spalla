---
name: Spalla
direction: Madeira e verniz
colors:
  dark:
    canvas: "#0E1A16"
    surface: "#16241F"
    surface-soft: "#1D2E28"
    surface-sunken: "#09130F"
    hairline: "#263A33"
    hairline-strong: "#36514A"
    ink: "#ECF1EA"
    ink-muted: "#A9B8B0"
    ink-subtle: "#8A9C92"
    primary: "#E3A44A"
    primary-hover: "#F0B866"
    primary-soft: "#3A2E18"
    on-primary: "#1A1206"
    in-tune: "#4CC38A"
    close: "#E6CF4F"
    off: "#E8644F"
    info: "#6FA8E6"
    string-g: "#C9603C"
    string-d: "#4FA3C7"
    string-a: "#8FCB7A"
    string-e: "#F2D98C"
  light:
    canvas: "#F2F4EF"
    surface: "#FFFFFF"
    surface-soft: "#E8ECE5"
    surface-sunken: "#DDE3DA"
    hairline: "#D5DCD2"
    hairline-strong: "#B7C2B5"
    ink: "#13201B"
    ink-muted: "#4A5A52"
    ink-subtle: "#5F6F67"
    primary: "#94560F"
    primary-hover: "#7A460B"
    primary-soft: "#F4E6CF"
    on-primary: "#FFFFFF"
    in-tune: "#1D7F50"
    close: "#8A7300"
    off: "#C23D28"
    info: "#2F68AE"
    string-g: "#7E2F1A"
    string-d: "#1F6688"
    string-a: "#3A8628"
    string-e: "#A8841A"
typography:
  display: { family: "Instrument Serif", size: "40–56px", line-height: 1, tracking: "-1px", weight: 400 }
  title: { family: "Instrument Serif", size: "30–38px", line-height: 1.05, tracking: "-0.5px", weight: 400 }
  work: { family: "Instrument Serif Italic", use: "título de obra: peça, livro Suzuki" }
  heading: { family: "Instrument Sans", size: "19px", line-height: 1.3, weight: 600 }
  body: { family: "Instrument Sans", size: "16px", line-height: 1.55 }
  small: { family: "Instrument Sans", size: "14px", line-height: 1.45 }
  caption: { family: "Instrument Sans", size: "12.5px", line-height: 1.4, weight: 500 }
  numeric: { family: "Geist Mono", size: "32px", features: "tabular-nums" }
  note: { family: "Geist Mono", size: "72px" }
radius: { sm: 6px, md: 10px, lg: 18px, xl: 28px, pill: 999px }
motion:
  ease-spalla: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  ease-spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  duration: { fast: 140ms, normal: 220ms, slow: 360ms }
layout: { page: 1080px, prose: 68ch, sidebar: 248px }
---

# Spalla — design system

**Spalla** é o primeiro violino da orquestra: quem afina o grupo e conduz. O app é o spalla do estudo de quem
toca sozinho — dá o lá, diz o que tocar hoje e escuta. A fonte da verdade dos valores é
`apps/web/src/design/tokens.css`; este arquivo explica o porquê e as regras de uso. Toda decisão visual nova que
vale para o app inteiro entra aqui na mesma tarefa.

## Direção: madeira e verniz

O violino é abeto (o tampo), ébano (o espelho) e verniz cor de mel. A interface empresta isso e mais nada:

- **Escuro por padrão.** Estudo acontece à noite, com a estante perto; tela clara cansa e reflete. O tema claro
  existe e é tratado com o mesmo cuidado.
- **Neutros tingidos.** Nenhum cinza puro: o escuro é verde-abeto, a variante Ébano é marrom. Sombras usam a tinta
  do fundo (`--shadow-ink`), nunca preto genérico.
- **Um acento só, mel.** Ação principal, item ativo, progresso do dia, foco do teclado. Nada mais compete com ele.
- **Grão.** Um ruído fixo a 4–5% sobre o fundo (`body::before`) tira a cara de vetor chapado. Sem gradiente
  decorativo, sem vidro, sem neon.
- **A ousadia mora num lugar:** a tipografia serifada grande (Instrument Serif) na saudação e nos títulos. O resto
  é quieto.

## Temas

| Tema | `data-theme` | `data-accent` | Uso |
|---|---|---|---|
| Abeto escuro | `dark` | `padrao` | padrão de instalação nova |
| Abeto claro | `light` | `padrao` | |
| Ébano escuro | `dark` | `sepia` | neutros marrons, mesmo mel |
| Ébano claro | `light` | `sepia` | |

O valor salvo `"sepia"` do accent é legado da paleta antiga e foi mantido para não migrar preferências; na tela ele
se chama Ébano. A tela Tocar força `data-theme="dark"`.

## Cor — regras

- Contraste verificado em teste (`tokenCatalog.test.ts`) nos quatro temas: `ink` ≥ 7:1, `ink-muted` ≥ 4.5:1 e
  `primary` ≥ 4.5:1 sobre canvas, surface e surface-soft; afinação, informação e cordas ≥ 3:1 sobre o card.
- **Cordas** (Sol, Ré, Lá, Mi) diferem em **luminosidade** além do matiz — no escuro ficam mais claras conforme a
  corda fica mais aguda — para continuarem distinguíveis com daltonismo. O teste exige razão ≥ 1.2 entre vizinhas.
- **Afinação**: verde afinado, limão quase, vermelho fora. O limão é deliberadamente mais frio que o mel para não
  confundir com a ação principal. O veredito nunca depende só da cor: sempre vem também em texto.
- `*-soft` é fundo de aviso/destaque; o texto sobre ele usa `ink`, nunca a cor cheia.

## Tipografia — regras

- Instrument Serif tem um peso só (400). Hierarquia vem de **tamanho e contraste**, nunca de negrito falso
  (`font-synthesis-weight: none`). Títulos de card e seção usam a sans 600 (`text-heading font-semibold`).
- Serifa só em: saudação/título de tela (`font-display text-display|text-title`) e título de obra em itálico
  (`font-work`), como se escreve título de peça em programa de concerto. Nunca para destacar uma palavra solta.
- Números que mudam (cents, bpm, cronômetro, XP, contadores) em `font-mono tabular`.
- Títulos com `text-wrap: balance`, parágrafos com `pretty`; texto corrido até `max-w-prose` (68ch).
- Frase normal em tudo; **sem caixa-alta** em rótulo ou eyebrow.

## Forma, profundidade e movimento

- **Raio** cresce com o tamanho: chip e campo `sm`, botão e linha `md`, card `lg`, painel hero `xl`. Elemento
  interno sempre com raio menor que o que o contém.
- **Card só quando a elevação diz hierarquia.** Lista é `ListRow` com divisória, não pilha de cards.
- **Sombra** tingida com realce interno de 1 px no topo (`shadow-card`, `shadow-raised`, `shadow-overlay`).
- **Movimento**: `ease-spalla` em toda transição; `ease-spring` só em confirmação (estrela, anel fechando,
  toque no botão principal). Durações 140/220/360. Animar só `transform` e `opacity`; nunca `transition: all`.
- **Um momento orquestrado só**: a entrada da Hoje (`animate-rise` em cascata) e a revelação das estrelas no
  resultado (`animate-pop`). O resto é movimento que responde a uma ação.
- `prefers-reduced-motion` reduz toda animação a 1 ms.

## Arquitetura de informação

| Área | Rota | Conteúdo |
|---|---|---|
| Hoje | `/` | a sessão do dia e só ela |
| Estudar | `/estudar` | Rotina · Método · Caderno |
| Repertório | `/repertorio` | Catálogo · Suzuki · Estante |
| Ferramentas | `/ferramentas` | Afinador, Metrônomo, Nota pedal, Gravador |
| Você | `/voce` | Progresso · Ajustes · Conta |

Desktop (≥ lg): sidebar de 248 px. Celular: barra inferior de 5 itens com `safe-area-inset-bottom`. Tela cheia
(Tocar, Leitor, Boas-vindas) é declarada na rota (`handle.fullscreen`).

### Rolagem

- **A sidebar nunca rola.** Ela é `sticky` com a altura da janela (`h-dvh`): marca no topo, áreas no meio e
  rodapé (cartão do aluno, Entrar, Ajustes) sempre visíveis, inclusive numa janela de 700 px de altura.
- **Página sem rolagem comprida.** Uma tela mostra uma coisa; o que é outro assunto vira aba (`Tabs`, ligada à
  URL) ou outra rota, não mais um card empilhado embaixo. A primeira dobra traz a ação principal.
- Lista longa rola dentro da própria área quando ao lado de um painel fixo (duas colunas), com
  `overscroll-behavior: contain`.
- Barra de rolagem fina, tingida (`hairline-strong`, `ink-subtle` no hover), com `scrollbar-gutter: stable` para
  o layout não pular; rolagem suave por âncora, desligada com movimento reduzido.

## Vocabulário

Uma ação tem um nome só no app inteiro.

| Use | Não use |
|---|---|
| Apagar | Remover, Tirar, Excluir |
| Nota pedal | drone, pedal sozinho |
| Atraso do som / Medir atraso | latência |
| Tocar (a partir de uma lista) | Praticar, Jogar |
| Começar (dentro do Tocar) | Iniciar |
| Treinar trecho | Praticar em loop |
| Rotina (o modelo) · Sessão de hoje (a instância) | plano, treino |
| Tarefas da aula | caderno da turma |

Botão diz o que acontece ("Guardar trecho", não "Salvar"). Erro diz o que houve e como resolver, sem pedir
desculpa. Estado vazio convida a agir. Reticências com `…`.

## Acessibilidade e interação

- Foco visível em mel (`:focus-visible`), alvo mínimo 44×44, `aria-label` em todo botão só de ícone.
- `touch-action: manipulation` em botão e link; `color-scheme` e `theme-color` acompanham o tema.
- Ação destrutiva pede confirmação inline (`ConfirmButton`), não modal.
- Estado da tela que vale compartilhar (aba, filtro, trecho) mora na URL.

## Nome interno legado

A plataforma se chama Spalla, mas estes nomes continuam `fretless` porque mudá-los apagaria dados ou quebraria o
deploy: o banco Dexie `fretless`, as chaves `fretless-settings`, `fretless-conta`, `fretless-dispositivo` e
`fretless-sync-*`, o worklet `fretless-pitch`, a pasta `%APPDATA%\Fretless` do app nativo, os pacotes
`@fretless/*`, o `BASE_PATH=/fretless/` do GitHub Pages e o `render.yaml`.
