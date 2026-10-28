# Replanejamento do Fretless

Plano para transformar o Fretless de "jogo de ritmo para violino" em **plataforma de estudo de violino**: rotina
diária, método Suzuki, escalas, afinação, músicas, tudo em telas separadas e fáceis de entender. Nada aqui foi
implementado; é o plano para aprovar antes do código.

| Documento | O que tem |
|---|---|
| [`arquitetura-da-informacao.md`](arquitetura-da-informacao.md) | Navegação, onboarding, cada tela, os cinco fluxos ponta a ponta |
| [`pedagogia-e-rotina.md`](pedagogia-e-rotina.md) | O que os métodos dizem; níveis N1–N7; modelo de rotina; métricas; Suzuki; afinação; caderno da aula |
| [`stack.md`](stack.md) | Opções A/B/C, recomendação, mapa de módulos, modelo de dados, testes |
| [`../plano-de-acao.md`](../plano-de-acao.md) | Plano de ação de 28/10: mecânicas do Tocar, elementos do app, decisões, roadmap |
| [`../PROJETO.md`](../PROJETO.md) | Estado atual de cada fase e decisões tomadas |
| [`../../DESIGN.md`](../../DESIGN.md) | Design system: tokens, componentes, layout, movimento, voz |

## 1. O pedido, reescrito

1. Plataforma de **estudo**, não jogo: a pessoa abre e sabe o que praticar hoje.
2. Baseada em **como se ensina violino de verdade**: Suzuki (ela tem aulas particulares e estuda por ele), escalas,
   estudos, afinação, revisão.
3. **Rotina repetitiva com propósito**: repetir um trecho até fechar uma meta, subir o andamento, voltar depois.
4. **Músicas**: trilha Suzuki, biblioteca, importar partitura, praticar por trecho.
5. **Bem estruturada**: página inicial, telas separadas, cada coisa no lugar, dois níveis de navegação no máximo.
6. **Design system amigável e moderno**, documentado e seguido.
7. Tempo não é restrição; estruturar a aplicação **por completo**.

## 2. Princípios que decidem empates

- **A próxima ação sem rolar.** Toda tela mostra o que fazer agora sem a pessoa procurar.
- **O método manda na ordem.** Aquecimento → afinação → escalas → técnica → peça → revisão. O app não inventa.
- **Feedback por nota é o produto.** Estrelas e sequência são discretas; o que ensina é "1º dedo alto na corda Mi".
- **O que já funciona fica.** Engine de áudio, detector de altura, parser MusicXML, 161 exercícios, 100 testes e o
  jogador sintético são a parte difícil e estão prontos. O que muda é a casca.
- **A professora é parte do sistema.** Caderno da aula alimenta a rotina da semana.

## 3. O que fica, o que muda, o que sai

| Fica (reaproveitado) | Muda | Sai |
|---|---|---|
| `score/` (parser, trim, beaming, compassos) | Pauta portada para canvas web (feita); highway como modo alternativo | `src/view/*`, `src/render/*` (nativo vira só harness de testes) |
| `curriculum/` (recipes, geradores, 161 exercícios, níveis) | Plano diário vira **rotina em blocos** com espaçamento e intercalação | `Application.cpp` como máquina de telas |
| `game/` (julgamento, estrelas, SyntheticPlayer) | Resultado ganha mapa de compassos e "repetir os difíceis" | SDL2, OpenGL, FreeType, toolkit próprio |
| `audio/PitchDetector` (YIN) | Captura via AudioWorklet (ou addon, ver stack) | PortAudio (se C passar) |
| 100 testes nativos | Rodam também em WASM | — |
| `progress.txt` | Migra para SQLite (`Attempt`, `ReviewState`) | — |
| Steam | Mesma integração, via Electron/Tauri | — |

## 4. Fases

Estimativas em dias de trabalho focado, para dar ordem de grandeza, não compromisso.

| Fase | Entrega | Critério de pronto | Dias |
|---|---|---|---|
| **0. Spike de latência** | Página mínima: AudioWorklet + YIN em WASM; mede atraso e jitter no PC dele | ≤ 30 ms estável (jitter < 5 ms), ≤ 1 cent nas 4 cordas. Reprovou → stack B | 1–2 |
| **1. Fundação** | Monorepo (`packages/core`, `apps/web`); core compila nativo e WASM; os 100 testes passam nos dois; design system em código (tokens do DESIGN.md) + componentes base (botão, cartão, chip, anel, estrelas, toast); navegação com as 5 áreas; PWA instalável; dados local-first (Dexie) | `pnpm test` verde; página de componentes com todos os tokens do DESIGN.md; app abre offline | 6–8 |
| **2. Tocar** | Tela Tocar completa: pauta rolando em canvas próprio (feita 28/10), afinador compacto, metrônomo com subdivisão e drone em Web Audio, controle de andamento, loop A-B, auto-slowdown, Resultado com mapa de compassos e "repetir os difíceis", highway como modo alternativo | Fluxo "exercício → Tocar → Resultado" com o jogador sintético nos testes e2e; paridade com o jogo atual | 8–10 |
| **3. Praticar** | Módulos e exercícios (lista, filtros, detalhe, histórico); rotinas (lista, editor arrastável, metas, variações); sessão em execução com contador de repetições; gerador de rotina (intercalação + espaçamento) com testes de data fixa | Fluxo 2 da IA ("Começar → 25 min → resumo") sem decisão além de Começar | 8–10 |
| **4. Hoje, onboarding, Progresso** | Hoje (sessão, revisão pendente, caderno, atalhos); onboarding em 6 passos com calibração; Progresso (resumo, calendário, por módulo, histórico, exportar); Configurações; migração do `progress.txt` | Fluxos 1 e 5; migração testada com um `progress.txt` real | 5–7 |
| **5. Músicas** | Trilha Suzuki (10 livros como cartões, estado por peça, "aprendi na aula"); biblioteca CC0 + importar MusicXML/MXL; detalhe da peça com trechos, loop e andamento; gravador com comparação | Fluxo 4 (peça nova → trecho → andamento → inteira → revisão) | 6–8 |
| **6. Caderno da aula e Ferramentas** | Caderno (anotações, tarefas → rotina "Da aula", resumo da semana); Afinador tela cheia com modo ressonância; Metrônomo progressivo; Drone com aviso de fone | Fluxo 3 (voltar da aula → tarefas → praticar na semana) | 4–5 |
| **7. Publicação** | Deploy (GitHub Pages ou Render); CI (testes nativos, WASM, Vitest, Playwright); README e skills do repo revisadas. Conta e sincronização (Supabase) e acesso da professora ficam pausados até a base offline estar impecável; Electron/Steam saem do plano | URL pública instalável como PWA, abrindo offline no Chrome Android | 3–4 |

Total: ~45–55 dias focados. Ordem fixa 0 → 1 → 2; de 3 em diante as fases podem trocar de ordem conforme o que a
pessoa quiser usar primeiro (a Hoje só faz sentido depois de Praticar).

## 5. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Latência web não serve para avaliar ritmo | Alta | Fase 0 mede antes de qualquer UI; critério numérico; fallback B pronto com a mesma UI |
| Emscripten + pugixml/miniz dá trabalho | Média | Ambos são C puro/C++ sem dependência de SO; o SyntheticPlayer já isola o engine do áudio real |
| Pauta em canvas próprio fica atrás de uma engine pronta em notação complexa (vozes, ornamentos) | Baixa | O repertório é melodia a uma voz; a pauta portada do `StaffView` já cobre armadura, ligaduras e barras; validar com a peça mais complexa da biblioteca |
| Escopo de 7 fases esfria no meio | Média | Cada fase entrega algo usável sozinho; fase 2 já substitui o app atual no uso diário |
| Direitos autorais das peças Suzuki | Alta se ignorado | Só melodias de domínio público tocáveis; livros como referência; "aprendi na aula" cobre o resto |
| Highway em canvas 2D a 60 fps no tablet | Baixa | Pouca geometria; medir na fase 2; WebGL só se precisar |
| Perder os 100 testes na migração | Baixa | Core não muda de linguagem; testes rodam nativos e em WASM desde a fase 1 |

## 6. Decisões

Tomadas em 28/10 (detalhe em `../PROJETO.md` §11): **stack C, web-first** (PWA, local-first; veja `stack.md` §3);
**Chrome no Android** como alvo de estabilidade; **pauta rolando em canvas próprio** no lugar de VexFlow (feita);
**app nativo só como harness de testes** (Steam/Electron saem); **conta, Supabase e professora pausados** até a
base offline estar impecável.

Em aberto:

1. **Nome das áreas e idioma**: PT-BR como proposto (Hoje · Praticar · Músicas · Ferramentas · Progresso)?
2. **O que entra primeiro depois da fase 2**: Praticar (rotinas) ou Músicas (Suzuki/trechos)?

## 7. Fontes

Pedagogia: `.claude/skills/violin-pedagogy/references/sources.md` (Suzuki, Flesch, Galamian, Fischer, Carter &
Grahn 2016, meta-análises de gamificação) mais a pesquisa de 28/10 resumida em `pedagogia-e-rotina.md` (Perlman,
Rosand, Weilerstein, ArtistWorks; apps Trala, Modacity, Tonara). Áudio web: MDN AudioWorklet e `latencyHint`;
medições públicas de 15–25 ms em Chrome com `echoCancellation`/`noiseSuppression`/`autoGainControl` desligados.
