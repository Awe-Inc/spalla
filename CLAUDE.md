# Fretless (Spalla)

Plataforma de estudo de violino, chamada **Spalla** na tela (o nome interno continua Fretless). Core C++20 (partitura, currículo, julgamento, YIN) compilado nativo e em WebAssembly;
interface web em React (`apps/web`), instalável como PWA, publicada em https://pataxo-inc.github.io/spalla/ (repo `Pataxo-Inc/spalla`). Design em `DESIGN.md`; plano em `docs/replanejamento/`; visão completa e estado em `docs/PROJETO.md`.

Carregar antes de escrever código:

| Área | Skill |
|---|---|
| `apps/web`, `packages/core`, pnpm, WASM | `fretless-web` |
| `src/`, `include/fretless` fora de `curriculum/`, build nativo | `fretless-engine` |
| exercícios, módulos, recipes, plano de estudo | `fretless-curriculum` |
| conteúdo pedagógico, nível de um exercício, técnica | `violin-pedagogy` |

Repo pessoal: commit e push livres. Sem comentário em TypeScript; em C++ só comentário de "porquê" (estilo da casa).
