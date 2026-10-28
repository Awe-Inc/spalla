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

## 3. Recomendação: C, com uma porta de saída medida

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
  core/          C++20 → WASM (Emscripten) e nativo (CMake, para os testes de hoje)
                 score/ (parser, trim, beaming, measures) · curriculum/ (recipes, generators, plan)
                 game/ (julgamento, SyntheticPlayer) · audio/PitchDetector (YIN puro)
                 bindings/ embind: parseMusicXml, buildExercise, Judge, PitchDetector
  audio/         TS: AudioWorklet que chama o YIN em WASM por bloco; calibração; seleção de dispositivo
                 (fallback B: addon N-API que expõe o mesmo contrato)
  ui/            React + TypeScript + Vite · design system (tokens do DESIGN.md em CSS vars) · telas
                 notação com VexFlow · highway em <canvas> (2D) · estado com Zustand · rotas por área
  data/          SQLite (desktop e tablet) via sql.js/Capacitor SQLite; modelo abaixo; export JSON/CSV
apps/
  desktop/       Electron (ou Tauri) + Steam; empacota ui + core.wasm + áudio
  tablet/        Capacitor (Android/iOS); mesma ui; áudio via AudioWorklet (Chrome/WebView) 
```

O que sai: `src/view/*`, `src/render/*`, `src/app/Application.cpp` (1387 linhas), SDL2, OpenGL, FreeType. O
`ToneEngine` (drone/metrônomo) vira Web Audio (osciladores + agendamento por `AudioContext.currentTime`), que
resolve de brinde o "clique e notas em relógios diferentes" dos Known gaps.

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

Migra o `progress.txt` atual (uma linha por exercício + dias) para `Attempt`/`ReviewState` no primeiro arranque.

## 6. Testes

- Core: os 100 testes atuais continuam nativos; a mesma suíte roda na build WASM via Node para garantir que o
  embind não quebrou nada.
- UI: Vitest + Testing Library para componentes e para o gerador de rotina (lógica de espaçamento tem teste com
  datas fixas).
- Ponta a ponta: Playwright com o jogador sintético injetando áudio (o `SyntheticPlayer` em WASM alimenta o
  worklet), cobrindo os cinco fluxos da arquitetura da informação.
- Latência: script de calibração automatizado roda no CI de desktop e falha se o jitter passar de 5 ms.
