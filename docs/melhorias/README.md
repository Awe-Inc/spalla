# Melhorias do que já existe (auditoria de 31/10)

Pedido do dono: "vamos melhorar oq ja existe, me ajude a planejar". Quatro frentes: experiência de estudo, pedagogia e
conteúdo, qualidade e robustez, desempenho e offline. Deploy, hospedagem e coisas manuais do dono ficam de fora.

Auditoria só de leitura (código, configs e `vite build`). Códigos dos achados: **E** experiência, **P** pedagogia,
**Q** qualidade, **A** desempenho. Esforço: P (horas), M (um dia), G (vários dias).

## Números de partida
- Bundle principal `index` 717 kB (229 kB gzip, acima do aviso de 500 kB); `pdf.worker` 1,26 MB; core WASM 320 kB.
- Precache do service worker: 372 entradas, 7,4 MB (pdf.js, 110 `.mxl`, todos os subsets de fonte).
- Currículo: 9 módulos, 161 exercícios (151 jogáveis). Por nível: L1 33, L2 33, L3 28, L4 16, L5 15, L6 15, L7 6,
  L8 9, L9 4, L10 2 (0 jogáveis). Repertório embutido: 9 melodias, só nos níveis 1, 2, 3 e 5.
- E2E: o teste principal do Tocar estava quebrado e o CI não rodava E2E (corrigido na Fase 1).

## Fase 1 — Rede de segurança (dados e erros) — feita em 31/10
Nada de recurso novo até o app parar de falhar calado e de arriscar o progresso do aluno.

| # | O quê | Onde | Esf. |
|---|---|---|---|
| Q1 | E2E do Tocar procura "As duas"; o rótulo é "Pistas e pauta" | `e2e/tocar.spec.ts:48` | P |
| Q2 | Job de E2E no CI (Chromium, as duas suítes) | `.github/workflows/ci.yml` | M |
| Q4 Q5 E8 E9 | Falha do WASM vira "Montando a sessão…"/esqueleto eterno; `useCore` com `retry()` e um aviso único com "Tentar de novo" | `core/useCore.ts`, Hoje, Repertório, Suzuki, Afinador | M |
| A11 Q6 | Backup completo (peças importadas, PDFs, gravações, configurações) **e restauração** validando `version` | `data/backup.ts`, `DadosCard` | G |
| A12 Q11 | `navigator.storage.persist()` depois das boas-vindas e uso/quota em Ajustes › Dados | `DadosCard` | P |
| A10 Q12 | Service worker em modo prompt: aviso "nova versão" fora do Tocar, nunca recarregar no meio da passada | `main.tsx`, `vite.config.ts` | M |
| Q7 E17 | Gravador: erro ao guardar aparece e o take fica na tela; aviso ao sair com take pendente | `GravadorPage.tsx:50` | P |
| Q10 Q16 Q17 | Promessas sem `catch` (importar música, caderno, meta diária, estante, bônus de sessão) mostram o erro certo, cota cheia inclusive | vários | M |
| Q18 | Tempo limite de 15 s nas chamadas à API | `api/client.ts:60` | P |
| Q8 Q9 | Testes de `saveRun`, `grantSessionBonus`, `resetProgress`, backup/restauração e migração do Dexie v4→v10 | `data/` | M |

## Fase 2 — O estudo no Tocar e na Hoje
O que o aluno sente toda vez que pega o violino.

| # | O quê | Esf. |
|---|---|---|
| E1 | Parar e recomeçar a passada; "Sair" confirma antes de descartar | P |
| E2 | Atalhos no Tocar: Espaço começa/para, R toca de novo, L ouve, setas mudam o bpm | M |
| E3 | Link da Hoje leva o andamento da meta (`practicePath(playPath, targetBpm)`) | P |
| E4 | Peça abre no último andamento limpo, com "último: X bpm" | M |
| E5 | Treinar trecho grava resultado com a faixa de compassos e conta minutos | M |
| E7 P11 | Meta "uma vez" exige precisão mínima (60%) para fechar o bloco e dar o bônus | P |
| E6 P9 | Peça nova com rodízio quando trava N dias, e botão "Outra peça" no bloco | M |
| P8 | Bug: peça nova tocada hoje é reatribuída à revisão (`PICK_ORDER`); corrigir com teste | M |
| P10 | Meta de série monotônica: uma passada ruim depois de fechar não reabre o bloco | M |
| E13 | Tarefa da turma sem bloco compatível ganha bloco "Da turma"; tarefa do caderno sem `itemId` aparece | M |
| E14 E15 | Sessão fechada mantém a lista com o bloco mais fraco e "Repetir"; estrelas não piscam 0 até salvar; "Próximo" também vindo de Estudar | P |
| E12 Q13 Q14 | Foco e `aria-live` no Tocar e no resultado; alvos de 44px (bpm, Tabs, ChoiceChips, ConfirmButton) | P |

## Fase 3 — Desempenho e offline

| # | O quê | Esf. |
|---|---|---|
| A1 | Tocar re-renderiza a tela inteira 60×/s: desenhar por refs, `setState` só em mudança | M |
| A2 A15 | Canvas: paleta em cache, layout de feixes memorizado, DPR limitado, `alpha:false`, `setSize` só quando muda | M |
| A3 | Pré-aquecer o core em `main.tsx` para a Hoje não esperar | P |
| A9 | Rotas pesadas em `lazy` (Tocar, ferramentas, Progresso, Ajustes, Boas-vindas, Repertório) + `manualChunks`; meta: `index` < 300 kB | P |
| A4 A16 A19 | Precache só do shell; `.mxl`, pdf.js e amostras em runtime cache; fontes só latin/latin-ext; amostras do violino disponíveis offline | M |
| A5 A6 A8 | `saveRun` sem ler tudo duas vezes; leitura de `results` compartilhada entre telas; bytes das peças importadas em tabela própria | M |
| A13 A20 | Worklet reaproveita o módulo WASM compilado; AudioContext suspenso em vez de recriado | M |
| A17 A18 | Biblioteca distingue erro de rede de "não existe"; estado "sem conexão" nas áreas da API | M |

## Fase 4 — Correções de conteúdo
Correções no currículo e no planner sem conteúdo novo. **Ids de exercício não mudam** (são a chave do progresso).

| # | O quê | Esf. |
|---|---|---|
| P7 | Au clair de la lune: conferir a oitava do salto Ré4→Dó#5 e o howTo; só melodia verificável | P |
| P19 P14 P18 | Títulos, subtítulos e faixas que não batem (slur12, leitura `full.6`, `name.e`, 2 oitavas "uma mudança"), `levelTo` dos módulos igual ao conteúdo real | P |
| P15 | Duplicatas (tonalize × ring tone, `bowing.stroke` × `rhythm`, Twinkle duplicado) diferenciadas | P |
| P3 | Nível do aluno exige parte do nível dominada (não uma passada só) | M |
| P4 | Biblioteca CC0 entra no planner; peças para os níveis 4 e 6 | M |
| P16 | Suzuki: separar peças sem quebrar "K. 219", reset em lapso, teto diário de revisões, revisões no plano do dia | M |
| P20 | "De memória" alcançável (opção no Tocar), limiares 80/90/95 com papel claro, repertório cabe na sessão de 25 min | M |
| P17 (parte) | Clique do 6/8 na semínima pontuada; progressão de bpm das semicolcheias coerente | P |

## Fase 5 — Conteúdo novo (precisa de pesquisa no `violin-pedagogy`)

| # | O quê | Esf. |
|---|---|---|
| P1 | Golpes que o módulo de arcadas promete: martelé, staccato, spiccato, collé, pizzicato (pede pausas em `kRhythms`) | G |
| P2 | Cordas duplas iniciais e vibrato preparatório, pré-requisitos do Suzuki 3 e 7 | G |
| P14 (parte) | 2ª e 4ª posição; 7ª posição antes das escalas de 3 oitavas | M |
| P13 | Arpejos, terças e cromática em todas as tonalidades; menores de uma oitava | M |
| P5 P6 | Aceleração que acelera de verdade; bariolage real e cordas não adjacentes | M |
| P12 P17 | Leitura com um eixo por grau, duração alinhada ao tempo, pausas e compassos além de 4/4; síncopes e anacruse | M |

## Fase 6 — Retorno ao aluno e ferramentas

| # | O quê | Esf. |
|---|---|---|
| E10 E11 | Resultado diz quais notas/cordas erraram e se foi afinação, ritmo ou nota não ouvida; mapa por compasso com texto e foco | M |
| E16 Q15 | Apagar música, rotina e gravação com desfazer; foco volta ao lugar depois de confirmar | M |
| E18 E19 E20 | Metrônomo lembra o bpm, tap tempo, pulso visual, Espaço; fones confirmados uma vez; "Ouvir" só para reprodução | M |
| Q22 Q23 | `role` em barras e anel, `alert` em erro de campo, Menu com Home/End/Tab, estante sem `window.confirm` | P |

## Fase 7 — Higiene

| # | O quê | Esf. |
|---|---|---|
| Q19 Q20 | Testes de `useSession`, gravador, `micErrors`, `useCore`, Hoje, Boas-vindas, DadosCard | G |
| Q21 | Configurações com `version` e validação no `persist` | P |
| Q24 Q25 | Duplicatas (`todayIso`, `looksLikePdf`, `useAction`, clipboard); TocarPage, ContaPage e PlanosPage abaixo de 300 linhas; script `lint` no `apps/web` | M |
| A7 A14 | Compactação de `results` antigos; worklet agrupa frames | M |

## Regras de execução
- Cada fase fecha com `tsc -b`, `vitest`, `vite build` e E2E verdes, `code-review` no diff, commit e push.
- Bug corrigido ganha teste que falha sem o fix e entrada em Armadilhas da skill `fretless-web`.
- Mudança no currículo passa por `--check-curriculum` e pelos testes nativos e WASM.
