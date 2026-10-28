#include "fretless/curriculum/Repertoire.h"

#include <algorithm>
#include <array>

namespace fretless::curriculum {
namespace {

// MIDI shorthand. Writing 66 instead of Fs4 in a hundred-note melody is how
// wrong notes get in.
constexpr std::int16_t A3 = 57, B3 = 59;
constexpr std::int16_t D4 = 62, E4 = 64, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71;
constexpr std::int16_t C5 = 72, Cs5 = 73, D5 = 74, E5 = 76, Fs5 = 78, G5 = 79;

constexpr float Q = 1.0f;      // quarter
constexpr float H = 2.0f;      // half
constexpr float DH = 3.0f;     // dotted half
constexpr float W = 4.0f;      // whole
constexpr float E_ = 0.5f;     // eighth
constexpr float DQ = 1.5f;     // dotted quarter

// ── Twinkle, Twinkle, Little Star ─────────────────────────────────────────
// "Ah! vous dirai-je, maman", French, published 1761. Suzuki's Book 1 opener,
// transposed to A major so the whole tune sits on the A and E strings.
constexpr PieceNote kTwinkle[] = {
    {A4, Q}, {A4, Q}, {E5, Q}, {E5, Q},
    {Fs5, Q}, {Fs5, Q}, {E5, H},
    {D5, Q}, {D5, Q}, {Cs5, Q}, {Cs5, Q},
    {B4, Q}, {B4, Q}, {A4, H},
    {E5, Q}, {E5, Q}, {D5, Q}, {D5, Q},
    {Cs5, Q}, {Cs5, Q}, {B4, H},
    {E5, Q}, {E5, Q}, {D5, Q}, {D5, Q},
    {Cs5, Q}, {Cs5, Q}, {B4, H},
    {A4, Q}, {A4, Q}, {E5, Q}, {E5, Q},
    {Fs5, Q}, {Fs5, Q}, {E5, H},
    {D5, Q}, {D5, Q}, {Cs5, Q}, {Cs5, Q},
    {B4, Q}, {B4, Q}, {A4, H},
};

// ── Lightly Row / Hanschen klein ──────────────────────────────────────────
// German children's song, Franz Wiedemann, before 1848. In A major it is the
// first tune that crosses from the A string to the E string and back.
constexpr PieceNote kLightlyRow[] = {
    {E5, Q}, {Cs5, Q}, {Cs5, H},
    {D5, Q}, {B4, Q}, {B4, H},
    {A4, Q}, {B4, Q}, {Cs5, Q}, {D5, Q},
    {E5, Q}, {E5, Q}, {E5, H},
    {E5, Q}, {Cs5, Q}, {Cs5, H},
    {D5, Q}, {B4, Q}, {B4, H},
    {A4, Q}, {Cs5, Q}, {E5, Q}, {E5, Q},
    {Cs5, W},
    {B4, Q}, {B4, Q}, {B4, Q}, {B4, Q},
    {B4, Q}, {Cs5, Q}, {D5, H},
    {Cs5, Q}, {Cs5, Q}, {Cs5, Q}, {Cs5, Q},
    {Cs5, Q}, {D5, Q}, {E5, H},
    {E5, Q}, {Cs5, Q}, {Cs5, H},
    {D5, Q}, {B4, Q}, {B4, H},
    {A4, Q}, {Cs5, Q}, {E5, Q}, {E5, Q},
    {A4, W},
};

// ── Ode to Joy ────────────────────────────────────────────────────────────
// Beethoven, Ninth Symphony, 1824. In D major it never leaves the D and A
// strings, and the whole tune is stepwise apart from one third.
constexpr PieceNote kOdeToJoy[] = {
    {Fs4, Q}, {Fs4, Q}, {G4, Q}, {A4, Q},
    {A4, Q}, {G4, Q}, {Fs4, Q}, {E4, Q},
    {D4, Q}, {D4, Q}, {E4, Q}, {Fs4, Q},
    {Fs4, DQ}, {E4, E_}, {E4, H},
    {Fs4, Q}, {Fs4, Q}, {G4, Q}, {A4, Q},
    {A4, Q}, {G4, Q}, {Fs4, Q}, {E4, Q},
    {D4, Q}, {D4, Q}, {E4, Q}, {Fs4, Q},
    {E4, DQ}, {D4, E_}, {D4, H},
    {E4, Q}, {E4, Q}, {Fs4, Q}, {D4, Q},
    {E4, Q}, {Fs4, E_}, {G4, E_}, {Fs4, Q}, {D4, Q},
    {E4, Q}, {Fs4, E_}, {G4, E_}, {Fs4, Q}, {E4, Q},
    {D4, Q}, {E4, Q}, {A3, H},
    {Fs4, Q}, {Fs4, Q}, {G4, Q}, {A4, Q},
    {A4, Q}, {G4, Q}, {Fs4, Q}, {E4, Q},
    {D4, Q}, {D4, Q}, {E4, Q}, {Fs4, Q},
    {E4, DQ}, {D4, E_}, {D4, H},
};

// ── Frere Jacques ─────────────────────────────────────────────────────────
// French round, printed from 1780. Four two-bar phrases, each repeated: the
// cleanest possible introduction to reading a repeat by ear.
constexpr PieceNote kFrereJacques[] = {
    {D4, Q}, {E4, Q}, {Fs4, Q}, {D4, Q},
    {D4, Q}, {E4, Q}, {Fs4, Q}, {D4, Q},
    {Fs4, Q}, {G4, Q}, {A4, H},
    {Fs4, Q}, {G4, Q}, {A4, H},
    {A4, E_}, {B4, E_}, {A4, E_}, {G4, E_}, {Fs4, Q}, {D4, Q},
    {A4, E_}, {B4, E_}, {A4, E_}, {G4, E_}, {Fs4, Q}, {D4, Q},
    {D4, Q}, {A3, Q}, {D4, H},
    {D4, Q}, {A3, Q}, {D4, H},
};

// ── Mary Had a Little Lamb ────────────────────────────────────────────────
// American, 1830. Three notes for most of its length, which is why it is the
// tune every method book reaches for after the open strings.
constexpr PieceNote kMaryLamb[] = {
    {Fs4, Q}, {E4, Q}, {D4, Q}, {E4, Q},
    {Fs4, Q}, {Fs4, Q}, {Fs4, H},
    {E4, Q}, {E4, Q}, {E4, H},
    {Fs4, Q}, {A4, Q}, {A4, H},
    {Fs4, Q}, {E4, Q}, {D4, Q}, {E4, Q},
    {Fs4, Q}, {Fs4, Q}, {Fs4, Q}, {Fs4, Q},
    {E4, Q}, {E4, Q}, {Fs4, Q}, {E4, Q},
    {D4, W},
};

// ── Hot Cross Buns ────────────────────────────────────────────────────────
// English street cry, printed 1733. Three pitches and one rhythm change.
constexpr PieceNote kHotCrossBuns[] = {
    {Fs4, Q}, {E4, Q}, {D4, H},
    {Fs4, Q}, {E4, Q}, {D4, H},
    {D4, E_}, {D4, E_}, {D4, E_}, {D4, E_},
    {E4, E_}, {E4, E_}, {E4, E_}, {E4, E_},
    {Fs4, Q}, {E4, Q}, {D4, H},
};

// ── Au clair de la lune ───────────────────────────────────────────────────
// French, 18th century. Four repeated notes then a stepwise descent: the
// standard test of whether a bow can repeat a note without accenting it.
constexpr PieceNote kAuClairDeLaLune[] = {
    {D4, Q}, {D4, Q}, {D4, Q}, {E4, Q},
    {Fs4, H}, {E4, H},
    {D4, Q}, {Fs4, Q}, {E4, Q}, {E4, Q},
    {D4, W},
    {D4, Q}, {D4, Q}, {D4, Q}, {E4, Q},
    {Fs4, H}, {E4, H},
    {D4, Q}, {Fs4, Q}, {E4, Q}, {E4, Q},
    {D4, W},
    {E4, Q}, {E4, Q}, {E4, Q}, {E4, Q},
    {B3, H}, {B3, H},
    {E4, Q}, {D4, Q}, {Cs5, Q}, {B4, Q},
    {A4, W},
};

// ── Jingle Bells, chorus ──────────────────────────────────────────────────
// James Lord Pierpont, 1857. Fast repeated notes at the point of the bow.
constexpr PieceNote kJingleBells[] = {
    {Fs4, Q}, {Fs4, Q}, {Fs4, H},
    {Fs4, Q}, {Fs4, Q}, {Fs4, H},
    {Fs4, Q}, {A4, Q}, {D4, Q}, {E4, Q},
    {Fs4, W},
    {G4, Q}, {G4, Q}, {G4, Q}, {G4, Q},
    {G4, Q}, {Fs4, Q}, {Fs4, Q}, {Fs4, E_}, {Fs4, E_},
    {Fs4, Q}, {E4, Q}, {E4, Q}, {Fs4, Q},
    {E4, H}, {A4, H},
};

// ── Minuet in G, BWV Anh. 114 ─────────────────────────────────────────────
// From the 1725 Notebook for Anna Magdalena Bach, now attributed to Christian
// Petzold. Suzuki puts a minuet here for a reason: three beats to a bar force
// the bow to plan its distribution.
constexpr PieceNote kMinuetInG[] = {
    {D5, Q}, {G4, E_}, {A4, E_}, {B4, E_}, {C5, E_},
    {D5, Q}, {G4, Q}, {G4, Q},
    {E5, Q}, {C5, E_}, {D5, E_}, {E5, E_}, {Fs5, E_},
    {G5, Q}, {G4, Q}, {G4, Q},
    {C5, Q}, {D5, E_}, {C5, E_}, {B4, E_}, {A4, E_},
    {B4, Q}, {C5, E_}, {B4, E_}, {A4, E_}, {G4, E_},
    {Fs4, Q}, {G4, E_}, {A4, E_}, {B4, E_}, {G4, E_},
    {A4, DH},
    {D5, Q}, {G4, E_}, {A4, E_}, {B4, E_}, {C5, E_},
    {D5, Q}, {G4, Q}, {G4, Q},
    {E5, Q}, {C5, E_}, {D5, E_}, {E5, E_}, {Fs5, E_},
    {G5, Q}, {G4, Q}, {G4, Q},
    {C5, Q}, {D5, E_}, {C5, E_}, {B4, E_}, {A4, E_},
    {B4, Q}, {C5, E_}, {B4, E_}, {A4, E_}, {G4, E_},
    {A4, Q}, {B4, E_}, {A4, E_}, {G4, E_}, {Fs4, E_},
    {G4, DH},
};

template <std::size_t N>
constexpr std::size_t countOf(const PieceNote (&)[N]) { return N; }

const PieceData kPieces[] = {
    {"Brilha, Brilha, Estrelinha", "Tradicional (francesa, 1761)",
     "Ah! vous dirai-je, maman. A melodia com que Suzuki abre o Livro 1.",
     3, 4, 4, 88, kTwinkle, countOf(kTwinkle)},

    {"Lightly Row", "Tradicional (alemã)",
     "Hänschen klein, Franz Wiedemann. A primeira mudança de Lá para Mi.",
     3, 4, 4, 96, kLightlyRow, countOf(kLightlyRow)},

    {"Hino à Alegria", "Ludwig van Beethoven",
     "Tema do final da Nona Sinfonia, 1824.",
     2, 4, 4, 100, kOdeToJoy, countOf(kOdeToJoy)},

    {"Frère Jacques", "Tradicional (francesa)",
     "Cânone, impresso desde 1780. Quatro frases, cada uma tocada duas vezes.",
     2, 4, 4, 92, kFrereJacques, countOf(kFrereJacques)},

    {"Mary Had a Little Lamb", "Tradicional (americana, 1830)",
     "Melodia de Lowell Mason para o poema de Sarah Josepha Hale.",
     2, 4, 4, 96, kMaryLamb, countOf(kMaryLamb)},

    {"Hot Cross Buns", "Tradicional (inglesa)",
     "Pregão de rua londrino, impresso em 1733.",
     2, 4, 4, 84, kHotCrossBuns, countOf(kHotCrossBuns)},

    {"Au clair de la lune", "Tradicional (francesa)",
     "Ária francesa do século XVIII. Quatro notas repetidas, depois a descida.",
     2, 4, 4, 88, kAuClairDeLaLune, countOf(kAuClairDeLaLune)},

    {"Jingle Bells", "James Lord Pierpont",
     "Só o refrão, 1857. Notas repetidas em velocidade.",
     2, 4, 4, 120, kJingleBells, countOf(kJingleBells)},

    {"Minueto em Sol", "Christian Petzold",
     "BWV Anh. 114, do Caderno de Anna Magdalena Bach, 1725.",
     1, 3, 4, 120, kMinuetInG, countOf(kMinuetInG)},
};

// ── Variations ────────────────────────────────────────────────────────────
// Each entry is a list of beat-length subdivision patterns. The engine walks
// the theme one quarter note at a time and replaces that quarter with the
// next pattern in the cycle, repeating the theme's pitch. A half note is two
// quarters, so it takes two cells — which is exactly how the variations are
// played.
struct Variation {
    const char* name;
    const char* focus;
    int         cycle;                 ///< beats before the pattern repeats
    std::array<std::array<float, 8>, 2> beats;   ///< durations, 0 terminates
};

constexpr Variation kVariations[kVariationCount] = {
    {"Tema", "Ligado. Uma arcada por nota, dividida por igual.", 1,
     {{{{1.0f, 0, 0, 0, 0, 0, 0, 0}}, {{1.0f, 0, 0, 0, 0, 0, 0, 0}}}}},

    {"Variação A", "Semicolcheias destacadas, depois colcheias em staccato.", 2,
     {{{{0.25f, 0.25f, 0.25f, 0.25f, 0, 0, 0, 0}},
       {{0.5f, 0.5f, 0, 0, 0, 0, 0, 0}}}}},

    {"Variação B", "O inverso da A: assente o arco, depois mexa.", 2,
     {{{{0.5f, 0.5f, 0, 0, 0, 0, 0, 0}},
       {{0.25f, 0.25f, 0.25f, 0.25f, 0, 0, 0, 0}}}}},

    {"Variação C", "Longa, curta-curta. Distribuição do arco em ritmo pontuado.", 1,
     {{{{0.5f, 0.25f, 0.25f, 0, 0, 0, 0, 0}},
       {{0.5f, 0.25f, 0.25f, 0, 0, 0, 0, 0}}}}},

    {"Variação D", "Seis notas iguais a cada dois tempos. Tercinas, uma arcada cada.", 1,
     {{{{1.0f / 3.0f, 1.0f / 3.0f, 1.0f / 3.0f, 0, 0, 0, 0, 0}},
       {{1.0f / 3.0f, 1.0f / 3.0f, 1.0f / 3.0f, 0, 0, 0, 0, 0}}}}},

    {"Variação E", "Oito semicolcheias iguais, destacadas, no meio do arco.", 1,
     {{{{0.25f, 0.25f, 0.25f, 0.25f, 0, 0, 0, 0}},
       {{0.25f, 0.25f, 0.25f, 0.25f, 0, 0, 0, 0}}}}},
};

}  // namespace

const PieceData* pieceAt(int index) noexcept {
    if (index < 0 || index >= pieceCount()) {
        return nullptr;
    }
    return &kPieces[index];
}

int pieceCount() noexcept {
    return static_cast<int>(std::size(kPieces));
}

const char* variationName(int index) noexcept {
    return kVariations[std::clamp(index, 0, kVariationCount - 1)].name;
}

const char* variationFocus(int index) noexcept {
    return kVariations[std::clamp(index, 0, kVariationCount - 1)].focus;
}

int variationCycle(int index) noexcept {
    return kVariations[std::clamp(index, 0, kVariationCount - 1)].cycle;
}

std::size_t variationBeat(int index, int beatInCycle,
                          float* out, std::size_t maxOut) noexcept {
    const Variation& variation = kVariations[std::clamp(index, 0, kVariationCount - 1)];
    // Every pattern stores two beat cells; a one-beat cycle simply repeats the
    // first, so a single modulo covers both cases.
    const int slot = (variation.cycle <= 1)
        ? 0 : ((beatInCycle % variation.cycle) + variation.cycle) % variation.cycle;
    const auto& durations = variation.beats[static_cast<std::size_t>(slot & 1)];

    std::size_t written = 0;
    for (const float duration : durations) {
        if (duration <= 0.0f || written >= maxOut) {
            break;
        }
        out[written++] = duration;
    }
    return written;
}

}  // namespace fretless::curriculum
