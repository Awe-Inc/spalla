# Stack: o que fica, o que muda

## 1. O que o app precisa que a stack dê

1. Captura de microfone com latência conhecida e estável; detecção de altura a ≤ 1 cent.
2. Uma interface com ~15 telas, listas, formulários, arrastar-e-soltar, temas, acessível e responsiva — a parte
   que hoje é a mais cara de fazer em C++/OpenGL com toolkit próprio.
3. Notação musical legível (pauta) e um highway a 60 fps.
4. Rodar no PC (Steam) **e num tablet na estante**, que é onde se estuda violino.
5. Caber na experiência de quem mantém: front-end/mobile (React, Ionic, Vue, Expo).

## 2. Opções

| | A. Seguir em C++ (UI própria ou Dear ImGui/RmlUi) | B. Electron + addon nativo (engine C++ via N-API) | C. React + TypeScript; core C++ em WebAssembly; áudio via AudioWorklet |
|---|---|---|---|
| Latência de entrada | 7 ms (WASAPI exclusivo) | 7 ms (mesmo engine) | ~15–25 ms com `latencyHint` e processamento desligado; medir na máquina |
| Esforço de UI | muito alto (toolkit do zero, sem acessibilidade) | baixo (React) | baixo (React) |
| Pauta | própria (443 linhas hoje, limitada) | VexFlow | VexFlow |
| Tablet / celular | não | não | sim (Capacitor), mesmo código |
| Steam / desktop | sim | sim (steamworks.js) | sim (Electron ou Tauri por cima da mesma build) |
| Reaproveita o engine C++ | tudo | tudo | parser, currículo, geradores, julgamento, YIN, jogador sintético (tudo sem SDL/PortAudio) |
| Cadeia de build | CMake | CMake + cmake-js/node-gyp no Windows (frágil) | CMake + Emscripten + Vite |
| Testes | os 100 atuais | 100 + Vitest | 100 (rodam nativos **e** em WASM) + Vitest + Playwright |
| Risco principal | ninguém quer manter UI em OpenGL | addon nativo no Windows; sem tablet | perder a vantagem de latência que motivou a reescrita |

## 3. Decisão (28/10): C, web-first

Aprovado pelo dono: opção C como **aplicação web** (PWA), não como app desktop. Consequências:

- O alvo é o navegador: Chrome/Edge no PC, Chrome no Android (tablet na estante). Safari/iPad entra no spike da
  fase 0 se for o tablet dele.
- Dados **local-first** (IndexedDB) desde a fase 1, funcionando offline; conta e sincronização entram na fase 7
  (Supabase), junto com o acesso da professora ao Caderno da aula.
- Steam e Electron saem do caminho crítico: ficam como anexo opcional (embrulhar a mesma build web) se um dia fizer
  sentido. `SteamService` não é portado.
- A saída B (addon nativo) deixa de existir no navegador. Se a fase 0 reprovar, a resposta é um app desktop
  **opcional** só para a avaliação fina de ritmo, com a mesma UI; a plataforma de estudo continua web.

### A porta de saída medida

- **Fase 0 é um spike de um dia**: página React mínima com AudioWorklet + YIN em WASM, mede a latência de ida
  (clique → mic) no PC dele com o microfone dele, e a precisão em cents nas quatro cordas soltas. Critério de
  aceite: latência ≤ 30 ms **estável** (desvio < 5 ms) e ≤ 1 cent. A calibração de latência do onboarding
  desconta o atraso fixo; o que importa é ele não variar.
- Passa → segue em C. Reprova → B (Electron + addon), com a mesma UI React; só a ponte de áudio muda. A UI e o
  design system não dependem da escolha.
- A avaliação é **por nota**, não por bloco de áudio: um atraso constante de 20 ms some na calibração; o que
  destruiu o protótipo em Python foi o jitter de 90 ms do MME, não a latência em si.

## 4. Mapa de módulos no cenário C

```
packages/
  core/          C++20 → WASM (Emscripten + embind). Mesmos fontes de src/score, src/curriculum, src/game e
                 src/audio/PitchDetector.cpp que o build nativo usa; os testes nativos continuam em tests/.
                 bindings/: parseMusicXml, buildCurriculum, buildExerciseScore, LivePitchTracker (YIN por bloco),
                 Session (GameEngine + Score), simulate (SyntheticPlayer). Wrapper TS tipado em src/.
apps/
  web/           React 19 + TypeScript + Vite · Tailwind v4 com os tokens do DESIGN.md em @theme · React Router ·
                 Zustand · VexFlow · highway em <canvas> · Dexie (IndexedDB, local-first) · vite-plugin-pwa
                 src/audio/ (AudioWorklet + calibração) · src/data/ · src/design/ (componentes) · src/areas/ (telas)
```

`audio`, `data` e `ui` começam como pastas de `apps/web` e só viram pacotes se outro app precisar deles.

O que sai: `src/view/*`, `src/render/*`, `src/app/Application.cpp` (1387 linhas), `src/platform/*`, SDL2, OpenGL,
FreeType, PortAudio. O `ToneEngine` (drone/metrônomo) vira Web Audio (osciladores + agendamento por
`AudioContext.currentTime`), que resolve de brinde o "clique e notas em relógios diferentes" dos Known gaps.

## 5. Modelo de dados

```
Profile        nome · nível · nívelFixadoPelaProfessora · minutosPorDia · diasPorSemana · notação · tema
AudioSettings  inputId · outputId · latenciaMs · ganho
Routine        id · nome · origem · duraçãoAlvo · blocos[]
Block          tipo · itemRef (exercício|peça|trecho|auto) · meta · variação · duraçãoAlvo
Session        id · data · routineId · blocos executados[] (início, fim, resultado) · resumo
Attempt        id · data · itemRef · andamento · precisãoAfinação · precisãoRitmo · estrelas · porNota[] 
ReviewState    itemRef · estrelas · últimaVez · intervaloAlvo · próximaRevisão
Piece          id · título · compositor · fonte (cc0|importada|suzuki-ref) · arquivo · trechos[] · nível
Lesson         data · texto · tarefas[] (texto · itemRef · meta · feita)
Recording      id · data · itemRef · arquivo · duração
```

Tudo em IndexedDB (Dexie), local-first. O `progress.txt` do app nativo pode ser importado em Configurações →
Dados (vira `Attempt`/`ReviewState`). Conta e sincronização (fase 7) replicam as mesmas tabelas no Supabase.

## 6. Testes

- Core: os 100 testes atuais continuam nativos; a mesma suíte roda na build WASM via Node para garantir que o
  embind não quebrou nada.
- UI: Vitest + Testing Library para componentes e para o gerador de rotina (lógica de espaçamento tem teste com
  datas fixas).
- Ponta a ponta: Playwright com o jogador sintético injetando áudio (o `SyntheticPlayer` em WASM alimenta o
  worklet), cobrindo os cinco fluxos da arquitetura da informação.
- Latência: a página de calibração registra atraso e jitter medidos; o critério da fase 0 (jitter < 5 ms) é
  conferido à mão na máquina do dono, porque CI não tem microfone.
