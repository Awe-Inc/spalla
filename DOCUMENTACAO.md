# Violin Hero — Documentação do Projeto

> Jogo de treino de violino no estilo "Guitar Hero": captura o som do instrumento em tempo real pelo microfone, compara com uma partitura MusicXML e dá feedback de afinação, timing e pontuação, com notação musical real na tela.

---

## 1. Visão geral

**Violin Hero** é uma aplicação desktop (Windows) em Python que transforma a prática de violino em um jogo. O usuário abre uma partitura em MusicXML, escolhe o BPM desejado, toca o violino junto do microfone, e o sistema:

- Detecta a nota e a frequência tocadas em tempo real (pitch detection).
- Compara com a nota esperada da partitura naquele instante.
- Classifica cada nota como **Perfeito**, **Ok** ou **Errou**, com base em afinação (cents) e timing (ms).
- Acumula pontuação, combo e precisão (%).
- Exibe uma "highway" (pista) horizontal ao estilo Guitar Hero com as notas se aproximando, e a notação musical real (pauta) rolando sincronizada.
- Inclui um afinador (tuner) analógico sempre disponível, mesmo fora do modo jogo.

---

## 2. Linguagens e tecnologias

| Camada | Tecnologia |
|---|---|
| Linguagem principal | **Python 3.12** |
| Interface gráfica (GUI) | **PyQt6** (widgets, QPainter para desenho customizado) |
| Notação musical renderizada | **PyQt6-WebEngine** (Chromium embutido) + **Verovio** (engine de gravura musical que gera SVG a partir do MusicXML) |
| Parsing de partituras | **music21** (leitura de MusicXML, extração de notas, compasso, andamento/BPM) |
| Captura de áudio | **sounddevice** (bindings Python para PortAudio) |
| Detecção de pitch (afinação) | **aubio** (algoritmo YIN), com **fallback em NumPy puro** implementando o algoritmo YIN manualmente caso aubio não esteja instalado |
| Scripts de instalação/execução | **Batch (.bat)** para Windows, usando `winget` para provisionar Python e Visual C++ Build Tools |

Não há dependência de banco de dados, backend web ou frameworks externos de terceiros além dos listados — é uma aplicação desktop standalone.

---

## 3. Estrutura de pastas

```
violin_hero/
├── main.py                     # Ponto de entrada (CLI + lançador da UI)
├── requirements.txt             # Dependências Python
├── iniciar.bat                  # Inicia o app (usa Python do winget)
├── instalar_dependencias.bat    # Instala Python 3.12 + todas as libs
├── instalar_aubio.bat           # Instala Visual C++ Build Tools + aubio
├── install_log.txt              # Log da última instalação
├── core/                        # Lógica de domínio (sem UI)
│   ├── audio_engine.py          # Captura de mic + detecção de pitch
│   ├── score_engine.py          # Parse de MusicXML (music21)
│   ├── game_engine.py           # Motor do jogo: pontuação, timing, estado
│   └── tuner.py                 # Afinador standalone (usa AudioEngine)
├── ui/                          # Interface gráfica (PyQt6)
│   ├── main_window.py           # Janela principal, toolbar, orquestração
│   ├── game_view.py             # Highway horizontal (notas vindo da direita)
│   ├── score_view.py            # Partitura real (Verovio/WebEngine) + fallback piano-roll
│   └── tuner_widget.py          # Ponteiro analógico de afinação
├── assets/fonts/                # (pasta reservada, vazia no momento)
└── songs/                       # (pasta reservada para partituras, vazia no momento)
```

---

## 4. Arquitetura

O projeto segue uma separação clara entre **lógica de domínio** (`core/`) e **interface** (`ui/`), sem acoplamento direto ao Qt dentro do `core/`. A comunicação entre threads de áudio (que rodam fora da main thread do Qt) e a UI é feita via um `QObject` ponte (`GameBridge`, em `main_window.py`) que expõe sinais Qt (`pyqtSignal`) — garantindo thread-safety ao atualizar widgets.

### Fluxo de dados

```
Microfone → AudioEngine (thread PortAudio)
             │  PitchResult (freq, nota, cents, confiança)
             ▼
        GameEngine  ──────────────►  Tuner (quando fora do jogo)
   (compara com ScoreEngine)
             │  HitResult / GameSnapshot (30 Hz)
             ▼
       GameBridge (sinais Qt)
             │
             ▼
   MainWindow → GameView / ScoreView / TunerWidget (repaint)
```

---

## 5. Módulos de domínio (`core/`)

### 5.1 `audio_engine.py` — Captura de áudio e detecção de pitch

- Usa **sounddevice** para abrir um `InputStream` de baixa latência (blocos de 512 samples, ~11.6 ms a 44100 Hz).
- Detecção de pitch via **aubio** (algoritmo YIN) quando disponível.
- **Fallback próprio**: implementação do algoritmo YIN em NumPy puro (`_NumpyYIN`), caso `aubio` não esteja instalado — inclui função de diferença, diferença normalizada cumulativa, busca de mínimo local e interpolação parabólica, seguindo a referência de de Cheveigné & Kawahara (2002).
- Auto-detecção da sample rate suportada pelo dispositivo de entrada (tenta a taxa preferida, a nativa do dispositivo, e fallbacks como 48000/44100/16000/22050 Hz).
- Conversão de frequência (Hz) para nome de nota + desvio em cents (`hz_to_note`).
- Filtro de silêncio por RMS e limiar de confiança (`CONFIDENCE_THRESHOLD = 0.7`).
- Lista dispositivos de entrada disponíveis (`list_input_devices`).
- Suporta execução via CLI standalone para teste (`python main.py --test-audio`).

### 5.2 `score_engine.py` — Leitura de partituras MusicXML

- Usa **music21** para carregar arquivos `.musicxml` / `.xml` / `.mxl`.
- Extrai, por nota/pausa: horário de início absoluto (segundos), frequência (Hz), nome da nota (`nameWithOctave`, ex. "A4"), número MIDI, duração, número do compasso e posição no compasso (beat).
- Detecta BPM (via `MetronomeMark`) e fórmula de compasso (`TimeSignature`) automaticamente.
- Trata acordes (extrai a nota mais aguda, assumindo que é a melodia principal do violino).
- Suporta múltiplas partes (`instrument_part`), selecionando por padrão a primeira.
- **Escala de tempo (`tempo_scale`)**: permite acelerar/desacelerar a música (0.25× a 2.0×) recalculando os tempos sem reler o arquivo do disco — usado para a funcionalidade de ajuste de BPM na UI.
- Métodos utilitários: `note_at(tempo)` (nota ativa em um instante) e `notes_in_window(start, end)` (notas numa janela de tempo, usado para renderizar a highway).
- Executável via CLI para debug (`python main.py --test-score arquivo.musicxml`).

### 5.3 `game_engine.py` — Motor do jogo

- Orquestra `ScoreEngine` + `AudioEngine`, avaliando cada leitura de pitch contra a nota esperada da partitura no instante correspondente.
- **Estados do jogo**: `IDLE`, `PLAYING`, `PAUSED`, `FINISHED` (com pausa/retomada preservando o tempo decorrido corretamente).
- **Critérios de avaliação**:
  - Afinação: `±10 cents` → Perfeito, `±25 cents` → Ok, além disso → Errou.
  - Timing: tolerâncias configuráveis (`MS_PERFECT = 50ms`, `MS_OK = 150ms`).
- **Pontuação**: 100 pts (Perfeito) ou 50 pts (Ok) por nota, multiplicados por um fator de combo (`combo // 5`, mínimo 1×). Erros zeram o combo.
- Rastreia: pontuação total, combo atual, maior combo, contagem de perfeitos/ok/erros, precisão (%).
- **Loop de tick a 30 Hz** (thread separada) que emite `GameSnapshot` para a UI atualizar a todo momento, mesmo sem novos eventos de áudio.
- Callbacks expostos: `on_hit`, `on_tick`, `on_state_change`, `on_finished`, `on_pitch_raw` (este último permite que o afinador continue recebendo dados de pitch mesmo durante o jogo).

### 5.4 `tuner.py` — Afinador standalone

- Encapsula um `AudioEngine` compartilhado para funcionar tanto fora do jogo (afinação livre) quanto durante o jogo (via repasse de `on_pitch_raw`).
- Produz `TunerReading` com direção (`flat` / `sharp` / `in_tune`, tolerância de 5 cents) e um offset normalizado (-1 a +1) usado para posicionar o ponteiro do medidor visual.

---

## 6. Interface gráfica (`ui/`)

### 6.1 `main_window.py` — Janela principal

- Layout: toolbar superior (abrir partitura, play/pause/stop, ajuste de BPM tipo metrônomo com botões −/+, seletor de microfone) → splitter vertical com **highway + afinador** em cima e **partitura real** embaixo → barra de status com nota atual, tempo decorrido/total, precisão e combo.
- Tema escuro customizado via QSS (stylesheet) em tons de roxo/azul escuro.
- Gerencia o ciclo de vida dos engines (`AudioEngine`, `ScoreEngine`, `GameEngine`, `Tuner`), incluindo troca de microfone em tempo real e transição entre modo "afinador livre" e "modo jogo" (o jogo assume o áudio; ao pausar/parar/terminar, o afinador standalone retoma).
- **`GameBridge`**: ponte `QObject` com sinais Qt para repassar eventos gerados em threads de áudio/jogo para a thread principal da UI de forma segura.
- Permite ajustar o BPM da execução independentemente do BPM original da partitura (recalcula `tempo_scale` e, se necessário, recarrega a notação renderizada).
- Ao final da música, exibe um resumo (pontuação, perfeitos, ok, erros, maior combo) em uma caixa de diálogo.

### 6.2 `game_view.py` — Highway (pista de notas)

- 4 faixas horizontais representando as cordas do violino (**E, A, D, G**, de cima para baixo, como o instrumento é seguro), cada uma com uma faixa aproximada de notas MIDI.
- Notas entram pela direita, cruzam a **linha de hit** (fixa a 20% da largura) e saem pela esquerda, com velocidade de rolagem constante (220 px/s).
- Renderização 100% via `QPainter` (gradientes, cantos arredondados, texto).
- **Flashes de acerto/erro** na linha de hit (verde=Perfeito, amarelo=Ok, vermelho=Errou), com animação de fade.
- HUD com pontuação, combo, contagem de perfeito/ok/erro e precisão percentual (cor muda conforme o desempenho).
- Barra de progresso da música na parte inferior.

### 6.3 `score_view.py` — Partitura real

- **Modo principal**: usa `verovio` para converter o MusicXML em SVG de notação musical real (pauta, claves, cabeças de nota) e o renderiza dentro de um `QWebEngineView` (Chromium embutido via PyQt6-WebEngine). Um cursor vertical desliza sobre a partitura via JavaScript injetado (`seek(progress)`), sincronizado com o tempo decorrido do jogo.
- Contém tratamento cuidadoso de detalhes de renderização SVG (ex.: fixar o `id` do SVG gerado pelo Verovio antes de injetar no HTML, para não quebrar as regras de estilo `stroke` já vinculadas a esse id).
- **Modo fallback ("piano roll")**: caso `PyQt6-WebEngine` não esteja instalado, desenha uma visualização alternativa via `QPainter`, com as mesmas 4 faixas de corda, linhas de compasso calculadas a partir do BPM, notas coloridas por proximidade temporal (passadas/atual/futuras) e cursor de posição.

### 6.4 `tuner_widget.py` — Afinador visual (ponteiro analógico)

- Desenho customizado (`QPainter`) de um medidor tipo "voltímetro": arco de 270° dividido em 5 segmentos coloridos (vermelho → amarelo → verde → amarelo → vermelho), marcadores de escala e agulha animada (interpolação suave a cada frame, ~60 fps).
- Nome da nota detectada no centro do arco e valor exato em cents num display digital abaixo (fonte monoespaçada), com cor que reflete a qualidade da afinação.

---

## 7. Scripts de instalação e execução (Windows)

| Script | Função |
|---|---|
| `instalar_dependencias.bat` | Instala Python 3.12 via `winget`, depois instala via pip: `music21`, `aubio`, `sounddevice`, `PyQt6`, `swig` e `verovio` (compilação, pode levar minutos). Gera log em `install_log.txt`. |
| `instalar_aubio.bat` | Instala o **Visual C++ Build Tools** via `winget` (necessário para compilar `aubio` a partir do código-fonte em alguns ambientes) e reinstala `aubio`. |
| `iniciar.bat` | Localiza o Python 3.12 instalado via winget e executa `main.py`, mantendo o terminal aberto em caso de erro para diagnóstico. |

### `main.py` — Modos de execução via CLI

```bash
python main.py                     # abre a janela principal (jogo completo)
python main.py --test-audio        # testa captura de microfone por 5s (imprime notas detectadas)
python main.py --test-score FILE   # testa o parser de MusicXML (imprime notas extraídas)
```

Antes de lançar a UI, `main.py` configura variáveis de ambiente do Qt WebEngine (`--no-sandbox`) e registra os diretórios de DLL do Qt no Windows, além de pré-importar `QWebEngineView` antes da criação do `QApplication` (exigência do Qt) e ativar `AA_ShareOpenGLContexts`.

---

## 8. Estado atual / pendências observadas

- As pastas `songs/` e `assets/fonts/` existem na estrutura do projeto mas estão **vazias** — ainda não há partituras de exemplo nem assets (fontes) versionados.
- Não há testes automatizados (pasta `tests/`) nem integração contínua configurada.
- O projeto não está inicializado como repositório Git nesta máquina (sem histórico de commits para referência).
- `PyQt6-WebEngine` e `verovio` são tratados como opcionais em tempo de execução: se ausentes, a aplicação cai graciosamente para o modo de notação simplificada ("piano roll").

---

## 9. Resumo das funcionalidades

- ✅ Abertura de partituras MusicXML (`.xml`, `.musicxml`, `.mxl`)
- ✅ Detecção de pitch em tempo real via microfone (YIN, com fallback numpy)
- ✅ Afinador visual sempre disponível (ponteiro analógico animado)
- ✅ Modo jogo com pontuação, combo, precisão e feedback de Perfeito/Ok/Errou
- ✅ Highway horizontal estilo Guitar Hero com notas por corda (E/A/D/G)
- ✅ Notação musical real renderizada (Verovio + WebEngine) com cursor sincronizado
- ✅ Fallback de notação em piano-roll quando WebEngine/Verovio indisponíveis
- ✅ Ajuste de BPM/velocidade da música (0.25×–2.0× do tempo original)
- ✅ Seleção de dispositivo de microfone em tempo real
- ✅ Play / Pause / Resume / Stop com preservação correta do tempo decorrido
- ✅ Resumo final de desempenho ao concluir a música
- ✅ Scripts de instalação automatizada para Windows (Python + dependências + build tools)
