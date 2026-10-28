# Fretless: Plano de Ação e Expansão de Funcionalidades

Plano trazido pelo dono em 28/10/2026 e incorporado ao repo com três correções: a pauta rolando é canvas próprio
(VexFlow foi descartado e a pauta já está pronta); as fases 6 (caderno da aula e ferramentas) e 7 (deploy e CI)
voltaram ao roadmap; as decisões novas (nativo só como harness de testes, conta e Supabase pausados, Chrome no
Android como alvo) foram registradas em `docs/PROJETO.md` §11. O estado de cada item fica em `docs/PROJETO.md` §9.

Este documento consolida o planejamento estratégico para transformar o motor Fretless em um método de estudo de
violino completo e um aplicativo web (PWA) robusto. O plano une pedagogia musical baseada em evidências a
requisitos modernos de engenharia de software.

## 1. Princípios pedagógicos (o "cérebro" do método)

A aplicação não deve apenas "julgar" notas, mas guiar o aprendizado através de métodos comprovados:

- **Prática deliberada e espaçada (interleaving):** o algoritmo do plano de prática mescla exercícios variados
  (escalas, arpejos, aquecimento) e força a revisão de conteúdos falhos de dias anteriores.
- **Isolamento e lentidão:** a regra de ouro do estudo de cordas. A aplicação permite fatiar trechos e reduzir o
  BPM drasticamente, exigindo precisão antes de permitir o avanço.
- **Audiação vs. visão:** a interface oferece feedback visual (desvio em cents), mas integra ferramentas auditivas
  (drone) para que o aluno não fique dependente da tela para afinar.

## 2. Funcionalidades core (mecânicas de violino)

Mecânicas focadas na execução musical, operando em tempo real através do WebAssembly e do AudioWorklet.

- **Motor de detecção (YIN):** detecção contínua e offline (microfone local) de afinação e tempo, comparando em
  tempo real com a partitura gerada ou importada.
- **Player de partitura (engine visual):**
  - Canvas próprio portado do `StaffView` nativo (`apps/web/src/areas/tocar/ScrollingStaff.tsx`), pronto em 28/10.
  - Pauta rolando da direita para a esquerda, com linha de agora fixa, mantendo a visão periférica dos compassos
    futuros (essencial para leitura à primeira vista e preparo de arco).
  - Modo "highway" (estilo jogo) mantido apenas como visualização secundária/opcional.
- **Controle de execução (o "Tocar"):**
  - **Metrônomo integrado:** sincronizado com a partitura, com subdivisão (colcheias, semicolcheias) e volume.
  - **Ajuste dinâmico de velocidade (BPM):** controle deslizante ou botões para subir ou descer o andamento sem
    alterar a afinação.
  - **Loop de trechos (A-B):** seleção de compassos específicos para repetição contínua.
  - **Auto-slowdown:** se o aluno errar muito um compasso, o app sugere ou força a redução do BPM na próxima
    tentativa.
- **Ferramentas de apoio:**
  - **Drone (nota pedal):** som contínuo (ex.: Lá 440 Hz) para treino de afinação por ressonância.
  - **Afinador de alta precisão:** modo tela cheia para antes da prática.

## 3. Elementos de aplicação e UX (o "app")

- **Biblioteca de partituras (gestão de acervo):**
  - **Catálogo base:** biblioteca embutida (Creative Commons / domínio público) incluindo as melodias Suzuki de
    domínio público, Ševčík e escalas.
  - **Importação:** `.musicxml` e `.mxl` até 8 MB, com parse local.
  - **Filtros e busca:** por nível de dificuldade, compositor, gênero (estudo, peça, escala) e status (não iniciada,
    em estudo, dominada).
  - **Persistência:** partituras importadas salvas no IndexedDB (Dexie) para acesso offline.
- **Configurações do sistema:**
  - **Áudio e hardware:** seleção e teste de microfone (permissões, lista de entradas), calibração de latência,
    sensibilidade de captação (noise gate para ignorar ruído de fundo).
  - **Interface e acessibilidade:** claro/escuro (escuro obrigatório para ambiente de meia-luz), nomenclatura das
    notas (Dó Ré Mi vs. C D E), tamanho da fonte da partitura.
  - **Gestão de dados:** exportar backup do IndexedDB (`.json`), apagar cache, resetar progresso.
- **Progresso e gamificação saudável:**
  - **Dashboard:** minutos de estudo por dia e sequências (streaks) pelo dia local (`localDayKey`).
  - **Histórico de precisão:** evolução da afinação (redução do desvio em cents) e do ritmo numa música ao longo
    das semanas.
- **Onboarding (primeiro uso):** 5 a 6 telas que explicam a proposta, pedem o microfone, testam a captação e
  afinam o violino junto com o aluno pela primeira vez.
- **Caderno da aula:** anotações e tarefas da professora que viram a rotina "Da aula" da semana (detalhe em
  `docs/replanejamento/pedagogia-e-rotina.md`).

## 4. Decisões arquiteturais consolidadas

1. **Plataforma alvo:** PWA web-first. O foco de estabilidade inicial é o **Chrome no Android** (tablet na estante).
2. **Offline-first:** nenhuma dependência de servidor além do download inicial dos assets. Autenticação, Supabase e
   acesso da professora ficam pausados até a fundação offline estar impecável.
3. **UI limpa:** React + Tailwind CSS v4, Zustand para estado (persistido no localStorage), tudo síncrono com o
   worklet de áudio.
4. **App nativo vira harness:** o app nativo (SDL2/OpenGL) perde a prioridade de UI e serve só para rodar a suíte de
   testes C++ (`test.bat`), garantindo que o motor continue testável fora da web.

## 5. Roadmap de execução

- **Fase 0 (spike de latência):** medir latência e jitter no Chrome Android. YIN ≤ 30 ms valida a stack.
- **Fase 1 (fundação):** concluída (Dexie, Zustand, PWA base).
- **Fase 2 (player e partitura):** pauta rolando (feita), controle de BPM, loop de compassos, metrônomo, drone e
  auto-slowdown na tela de tocar.
- **Fase 3 (rotinas de prática):** prática espaçada com sessões dinâmicas a partir do histórico no Dexie.
- **Fase 4 (onboarding e progresso):** calibração inicial, dashboard de estatísticas e configurações.
- **Fase 5 (biblioteca):** músicas, persistência de `.mxl` no banco local, filtros e categorização (Suzuki/CC0).
- **Fase 6 (caderno da aula e ferramentas):** caderno, afinador tela cheia, metrônomo progressivo, drone.
- **Fase 7 (publicação):** deploy (GitHub Pages ou Render) e CI. Conta, sync e professora ficam pausados.
