// ═══════════════════════════════════════════════════════════════════════════
//  Curriculum.cpp — what actually ships.
//
//  The order of the modules is the order a violinist warms up in, which is not
//  an accident of taste: sound before notes, notes before speed, speed before
//  repertoire. Inside each module, exercises are ordered by level and a level
//  changes one variable at a time. That constraint is what makes the list a
//  syllabus rather than a pile.
//
//  Sources the content is drawn from are named on each exercise, because a
//  practice tool that cannot say where a drill comes from is asking to be
//  trusted on nothing.
//
//  The prose is in Brazilian Portuguese because the player reads it. The code
//  and the comments stay in English because whoever maintains this reads
//  those. Ids stay ASCII: they are the key progress is filed under.
// ═══════════════════════════════════════════════════════════════════════════
#include "fretless/curriculum/Exercise.h"

#include <algorithm>
#include <cstdio>
#include <string>

#include "fretless/curriculum/Generators.h"
#include "fretless/curriculum/Repertoire.h"

namespace fretless::curriculum {
namespace {

/// For ids only. The names the player sees come from score::kStringName, and
/// keeping the two apart is what stops "Ré" ending up inside a progress key.
const char* kStringId[4] = {"G", "D", "A", "E"};

/// Small helper so a table entry reads as prose rather than as struct syntax.
Exercise make(std::string id, std::string title, std::string subtitle,
              std::string focus, std::string howTo, int level, int bpm,
              ExerciseKind kind, Recipe recipe) {
    Exercise exercise;
    exercise.id         = std::move(id);
    exercise.title      = std::move(title);
    exercise.subtitle   = std::move(subtitle);
    exercise.focus      = std::move(focus);
    exercise.howTo      = std::move(howTo);
    exercise.level      = level;
    exercise.defaultBpm = bpm;
    exercise.kind       = kind;
    exercise.recipe     = recipe;
    return exercise;
}

/// The pitch class alone: "Lá". A key is not in an octave, and "Lá4 maior" is
/// not a thing anybody has ever said.
std::string keyLabel(int midi, int fifths) {
    char buffer[16] = {};
    score::writeLatinPitchClass(buffer, sizeof(buffer), midi, fifths);
    return buffer;
}

/// The string as the player names it: Sol, Ré, Lá, Mi.
std::string stringName(int index) {
    return score::kStringName[std::clamp(index, 0, 3)];
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Aquecimento
// ═══════════════════════════════════════════════════════════════════════════
Module buildWarmUp() {
    Module module;
    module.id      = "warmup";
    module.title   = "Aquecimento";
    module.tagline = "Som primeiro, por dez minutos.";
    module.description =
        "Aquecimento não é escala tocada devagar. É a parte do estudo em que o "
        "arco recupera o peso e a mão esquerda reencontra o espelho, e "
        "funciona justamente porque nada aqui é difícil o bastante para você "
        "se esconder atrás. Toque na ordem; o conjunto leva uns dez minutos, "
        "que é o que a maioria dos músicos de orquestra dedica a isso.";
    module.accent    = 0;
    module.levelFrom = 1;
    module.levelTo   = 4;

    // ── Long tones ────────────────────────────────────────────────────────
    for (int string = 0; string < 4; ++string) {
        Recipe recipe;
        recipe.string       = string;
        recipe.noteQuarters = 4.0;
        recipe.repeats      = 2;
        recipe.beats        = 4;
        recipe.fifths       = 0;

        auto exercise = make(
            std::string("warmup.longtone.") + kStringId[string],
            "Notas longas - corda " + stringName(string),
            "Quatro arcadas inteiras, corda solta, nada mais",
            "Velocidade do arco, ponto de contato, arco reto",
            "Olhe o arco, não a tela. Ele deve ficar paralelo ao cavalete e "
            "andar numa velocidade só, do talão à ponta. Se a altura oscila, o "
            "arco está fugindo para cima do espelho - o afinador aqui está "
            "falando do seu braço direito, não da mão esquerda.",
            1, 50, ExerciseKind::LongTone, recipe);
        exercise.source =
            "Son filé, o primeiro item padrão de um aquecimento de orquestra.";
        module.exercises.push_back(std::move(exercise));
    }

    {
        Recipe recipe;
        recipe.noteQuarters = 4.0;
        recipe.repeats      = 1;
        recipe.fifths       = 0;
        auto exercise = make(
            "warmup.longtone.all", "Notas longas - as quatro cordas",
            "Do Sol ao Mi, duas arcadas inteiras em cada",
            "Som parelho entre as cordas",
            "A corda Mi vai querer soar mais forte e a Sol vai querer soar "
            "áspera. Mude a distância do arco até o cavalete, não a pressão, "
            "até que as quatro soem como o mesmo instrumento.",
            1, 50, ExerciseKind::LongTone, recipe);
        exercise.source = "Son filé passando por todas as cordas.";
        module.exercises.push_back(std::move(exercise));
    }

    // ── Open-string crossings ─────────────────────────────────────────────
    static constexpr const char* kCrossingNames[4] = {
        "alternado", "duas e duas", "bariolage", "invertido"};
    static constexpr const char* kCrossingHow[4] = {
        "Uma nota por corda, vai e volta. O braço tem que chegar no nível novo "
        "antes do arco; se você ouve as duas cordas juntas, ele chegou tarde.",
        "Duas em cada corda. O par dá ao braço um tempo para se preparar, e é "
        "por isso que este é o mais fácil para começar.",
        "Ida e volta sem repetir: o braço muda de direção duas vezes por "
        "grupo. É a forma que Bach escreve o tempo inteiro.",
        "O espelho do bariolage. Estude os dois, ou o braço aprende só uma "
        "direção.",
    };

    for (int pattern = 0; pattern < 4; ++pattern) {
        for (int lower = 0; lower < 3; ++lower) {
            Recipe recipe;
            recipe.string       = lower;
            recipe.otherString  = lower + 1;
            recipe.pattern      = pattern;
            recipe.noteQuarters = 1.0;
            recipe.repeats      = 8;
            recipe.fifths       = 0;

            auto exercise = make(
                std::string("warmup.cross.") + std::to_string(pattern) + "." +
                    kStringId[lower],
                "Mudança de corda " + stringName(lower) + "-" +
                    stringName(lower + 1) + " - " + kCrossingNames[pattern],
                std::string(kCrossingNames[pattern]) + ", cordas soltas",
                "Nível do braço direito, mudanças silenciosas",
                kCrossingHow[pattern],
                (pattern < 2) ? 1 : 2, 60, ExerciseKind::StringCrossing, recipe);
            exercise.source =
                "Estudos de arco em cordas soltas; a forma por trás do Sevcik Op. 3.";
            exercise.metronome = true;
            module.exercises.push_back(std::move(exercise));
        }
    }

    // ── Finger patterns ───────────────────────────────────────────────────
    for (int pattern = 0; pattern < 4; ++pattern) {
        Recipe recipe;
        recipe.pattern      = pattern;
        recipe.noteQuarters = 1.0;
        recipe.repeats      = 1;
        recipe.fifths       = 0;

        auto exercise = make(
            std::string("warmup.pattern.") + std::to_string(pattern),
            std::string("Padrão de dedos ") + std::to_string(pattern + 1),
            fingerPatternName(pattern),
            "Moldura da mão esquerda, lugar do semitom",
            "Ponha os quatro dedos e deixe todos lá. O semitom é a única "
            "medida que importa na primeira posição, e os dois dedos que o "
            "formam têm que estar encostados - se dá para ver luz entre eles, "
            "a nota está alta.",
            2, 66, ExerciseKind::FingerPattern, recipe);
        exercise.source =
            "Os quatro padrões de dedos de primeira posição da pedagogia de cordas.";
        module.exercises.push_back(std::move(exercise));
    }

    // ── Suzuki tonalization ───────────────────────────────────────────────
    for (int string = 0; string < 4; ++string) {
        Recipe recipe;
        recipe.string       = string;
        recipe.noteQuarters = 4.0;
        recipe.repeats      = 2;
        recipe.fifths       = 0;

        auto exercise = make(
            std::string("warmup.tonalize.") + kStringId[string],
            "Tonalização - corda " + stringName(string),
            "Corda solta, depois as notas que ressoam com ela",
            "Ressonância, som bonito",
            "Suzuki chamava isto de tonalização e colocava antes de toda aula. "
            "Toque a corda solta, escute, e depois iguale aquele som na nota "
            "com dedo. Você não está procurando a altura certa; está "
            "procurando o momento em que o instrumento inteiro responde.",
            2, 48, ExerciseKind::RingTone, recipe);
        exercise.source =
            "Tonalização, Shinichi Suzuki - o estudo diário de som do método.";
        exercise.droneMidi = score::kOpenStringMidi[string];
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Golpes de arco
// ═══════════════════════════════════════════════════════════════════════════
Module buildBowing() {
    Module module;
    module.id      = "bowing";
    module.title   = "Golpes de arco";
    module.tagline = "Detaché, legato e ligaduras.";
    module.description =
        "Os golpes de arco se dividem em três famílias: na corda com a nota "
        "inteira (detaché, legato), na corda com ar entre as notas (martelé, "
        "staccato) e fora da corda (spiccato, sautillé). Iniciante vive na "
        "primeira família, e todo golpe das outras duas nasce dela - por isso "
        "a ordem aqui não é negociável.";
    module.accent    = 3;
    module.levelFrom = 1;
    module.levelTo   = 7;

    struct BowStudy {
        const char* id;
        const char* title;
        const char* subtitle;
        const char* focus;
        const char* howTo;
        BowPattern  bow;
        double      quarters;
        int         level;
        int         bpm;
    };

    static const BowStudy kStudies[] = {
        {"detache", "Detaché", "Uma arcada por nota, meio do arco",
         "Arcadas separadas, iguais e sem acento",
         "Cada nota ganha a própria arcada e nenhuma ganha acento. Use só o "
         "terço do meio. Se o arco para baixo soa mais forte que o para cima, "
         "o braço está ajudando a gravidade em vez de resistir a ela.",
         BowPattern::Separate, 1.0, 1, 72},

        {"slur2", "Duas por arcada", "Pares ligados, arco inteiro",
         "Distribuição do arco em duas notas",
         "Metade do arco por nota. A maioria gasta três quartos na primeira "
         "nota e depois fica sem arco, o que se ouve como um crescendo em cada "
         "segunda nota.",
         BowPattern::Slur2, 1.0, 2, 66},

        {"slur4", "Quatro por arcada", "Grupos de quatro ligados",
         "Distribuição do arco em quatro notas",
         "Um quarto do arco em cada. Conte as notas em voz alta olhando o "
         "arco: elas têm que chegar juntas na ponta.",
         BowPattern::Slur4, 0.5, 3, 66},

        {"slur8", "Oito por arcada", "Colcheias ligadas, a escala em duas arcadas",
         "Legato sustentado, mudanças de corda silenciosas",
         "Agora as mudanças de corda acontecem dentro de uma arcada, então "
         "nada as disfarça. O braço tem que subir de nível enquanto a nota "
         "anterior ainda está soando.",
         BowPattern::Slur8, 0.5, 5, 60},

        {"slur12", "Doze por arcada", "Uma arcada por oitava",
         "Economia de arco no limite",
         "Não tem arco suficiente, e essa é a lição. Diminua a velocidade do "
         "arco e leve-o para perto do cavalete para o som não morrer no fim.",
         BowPattern::Slur12, 0.25, 6, 54},

        {"accel", "Aceleração", "1, 2, 3, 4, 6, 8 notas por arcada",
         "Velocidade, sem a mão esquerda perceber",
         "O exercício de Galamian. As notas nunca mudam; só quantas cabem numa "
         "arcada. Quando você chega em oito, a mão esquerda está andando "
         "quatro vezes mais rápido do que começou, e nunca foi avisada disso.",
         BowPattern::Acceleration, 0.5, 7, 60},
    };

    for (const auto& study : kStudies) {
        Recipe recipe;
        recipe.tonicMidi    = 69;          // Lá maior, uma oitava
        recipe.scale        = ScaleType::Major;
        recipe.octaves      = 1;
        recipe.fifths       = 3;
        recipe.bow          = study.bow;
        recipe.noteQuarters = study.quarters;
        recipe.repeats      = 2;

        auto exercise = make(
            std::string("bowing.") + study.id, study.title, study.subtitle,
            study.focus, study.howTo, study.level, study.bpm,
            ExerciseKind::Scale, recipe);
        exercise.source = "Galamian, Contemporary Violin Technique, Livro I.";
        exercise.metronome = true;
        module.exercises.push_back(std::move(exercise));
    }

    // Repeated-note studies on one pitch, so only the bow can be wrong.
    static constexpr int kRhythmStudies[] = {0, 1, 7, 4};
    static constexpr const char* kRhythmHow[] = {
        "Arcadas inteiras, uma por nota. A coisa mais simples do instrumento e "
        "a que mais vale a pena ser chato.",
        "Colcheias no meio do arco. Mantenha o golpe curto o bastante para o "
        "braço nunca ter que correr.",
        "Semicolcheias. Vá para a metade superior e deixe o pulso trabalhar; "
        "se o braço inteiro se mexe, as notas não ficam iguais.",
        "Ritmo pontuado. A nota curta é um piparote, não uma arcada - ela toma "
        "tempo emprestado da longa e não devolve nada.",
    };

    for (std::size_t i = 0; i < std::size(kRhythmStudies); ++i) {
        Recipe recipe;
        recipe.tonicMidi = 69;
        recipe.pattern   = kRhythmStudies[i];
        recipe.repeats   = 4;
        recipe.fifths    = 0;

        auto exercise = make(
            std::string("bowing.stroke.") + std::to_string(kRhythmStudies[i]),
            std::string("Estudo de golpe - ") + rhythmName(kRhythmStudies[i]),
            "Lá solto, para nada além do arco poder estar errado",
            "Divisão do arco, regularidade",
            kRhythmHow[i], static_cast<int>(i) + 1, 72,
            ExerciseKind::Rhythm, recipe);
        exercise.source = "Estudos de arco em cordas soltas.";
        exercise.metronome = true;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Uma corda por vez
// ═══════════════════════════════════════════════════════════════════════════
Module buildStrings() {
    Module module;
    module.id      = "strings";
    module.title   = "Uma corda por vez";
    module.tagline = "Uma corda, as quatro posições.";
    module.description =
        "No instante em que a mudança de corda é permitida, a mão esquerda a "
        "usa, e a mudança de posição nunca é estudada. Prender o exercício a "
        "uma corda só é o único jeito de obrigar a mão a viajar - e é por isso "
        "que todo método desde o Sevcik tem um capítulo disso. Cada corda "
        "recebe os mesmos quatro estudos, então dá para ouvir qual está atrás.";
    module.accent    = 1;
    module.levelFrom = 2;
    module.levelTo   = 8;

    struct StringStudy {
        const char* id;
        const char* suffix;
        int         maxPosition;
        int         level;
        const char* focus;
        const char* howTo;
    };

    static const StringStudy kStudies[] = {
        {"first", "primeira posição", 1, 2,
         "Colocação sem mexer a mão",
         "Nada muda de posição. A mão fica onde começou e os dedos fazem todo "
         "o trabalho, que é como você descobre se a moldura existe mesmo ou se "
         "o braço vinha compensando em silêncio."},

        {"third", "até a terceira posição", 3, 4,
         "A primeira mudança de posição",
         "Uma mudança só, e ela acontece num dedo que já está na corda. "
         "Deslize o dedo antigo até a nota nova em vez de levantar e chutar - "
         "o ouvido corrige um deslize, não corrige um salto."},

        {"fifth", "até a quinta posição", 5, 6,
         "Duas mudanças, e o polegar",
         "Da quinta posição em diante o polegar tem que ir junto com a mão. Se "
         "ele fica para trás, os dedos esticam para alcançar e a afinação sobe "
         "exatamente no ponto em que ela está mais exposta."},

        {"seventh", "até a sétima posição", 7, 8,
         "O alto do espelho",
         "Os semitons aqui em cima são fisicamente minúsculos e o ouvido é a "
         "única medida que sobra. Devagar, e com o bordão ligado."},
    };

    static constexpr int kScaleTonic[4] = {55, 62, 69, 76};   // the open strings

    for (int string = 0; string < 4; ++string) {
        for (const auto& study : kStudies) {
            Recipe recipe;
            recipe.string       = string;
            recipe.tonicMidi    = kScaleTonic[string];
            recipe.scale        = ScaleType::Major;
            recipe.maxPosition  = study.maxPosition;
            recipe.noteQuarters = 1.0;
            recipe.fifths       = fifthsFor(kScaleTonic[string], ScaleType::Major);

            auto exercise = make(
                std::string("strings.") + kStringId[string] + "." + study.id,
                "Corda " + stringName(string) + " - " + study.suffix,
                keyLabel(kScaleTonic[string], recipe.fifths) +
                    " maior, numa corda só",
                study.focus, study.howTo, study.level, 60,
                ExerciseKind::SingleString, recipe);
            exercise.source =
                "Escalas numa corda só, a partir do Sevcik Op. 8 (mudanças de posição).";
            exercise.droneMidi = kScaleTonic[string] - 12;
            module.exercises.push_back(std::move(exercise));
        }
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Escalas
// ═══════════════════════════════════════════════════════════════════════════
Module buildScales() {
    Module module;
    module.id      = "scales";
    module.title   = "Escalas e arpejos";
    module.tagline = "De uma oitava a três, e arpejos.";
    module.description =
        "Dois sistemas de escalas dominam o ensino de violino: o de Flesch, "
        "carregado de cordas duplas, e o de Galamian, carregado de ritmo e "
        "arcadas. Os dois concordam na escada - uma oitava na primeira "
        "posição, depois duas, depois três com as mudanças de posição, e então "
        "os arpejos que moram dentro de cada tonalidade. Essa escada é este "
        "módulo. Pegue uma arcada do módulo Golpes de arco e rode a mesma "
        "escala de seis jeitos.";
    module.accent    = 2;
    module.levelFrom = 1;
    module.levelTo   = 9;

    struct KeyEntry { int midi; int level; };

    // ── One octave, first position, starting on an open string ────────────
    static constexpr KeyEntry kOneOctave[] = {
        {69, 1},   // Lá — a primeira escala de todo iniciante
        {62, 1},   // Ré
        {55, 2},   // Sol
        {60, 2},   // Dó, terceiro dedo na corda Sol
        {64, 3},   // Mi
        {58, 3},   // Sib, primeiro dedo baixo
        {65, 4},   // Fá
    };

    for (const auto& entry : kOneOctave) {
        Recipe recipe;
        recipe.tonicMidi = entry.midi;
        recipe.scale     = ScaleType::Major;
        recipe.octaves   = 1;
        recipe.fifths    = fifthsFor(entry.midi, ScaleType::Major);
        recipe.repeats   = 2;

        auto exercise = make(
            std::string("scales.1oct.") + std::to_string(entry.midi),
            keyLabel(entry.midi, recipe.fifths) + " maior - uma oitava",
            "Primeira posição, sem mudanças",
            "Afinação, moldura da mão",
            "Toque uma vez bem devagar com o bordão ligado e pare em cada nota "
            "que não assentar. Depois toque no tempo. Fazer as duas coisas na "
            "mesma passada é como uma escala vira um aquecimento que não "
            "conserta nada.",
            entry.level, 66, ExerciseKind::Scale, recipe);
        exercise.source = "Escalas padrão de uma oitava em primeira posição.";
        exercise.droneMidi = entry.midi - 12;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Two octaves ───────────────────────────────────────────────────────
    static constexpr KeyEntry kTwoOctave[] = {
        {55, 3}, {57, 4}, {58, 4}, {60, 4}, {62, 5}, {63, 5}, {64, 5}, {65, 6},
    };

    for (const auto& entry : kTwoOctave) {
        Recipe recipe;
        recipe.tonicMidi    = entry.midi;
        recipe.scale        = ScaleType::Major;
        recipe.octaves      = 2;
        recipe.fifths       = fifthsFor(entry.midi, ScaleType::Major);
        recipe.noteQuarters = 0.5;
        recipe.bow          = BowPattern::Slur4;

        auto exercise = make(
            std::string("scales.2oct.") + std::to_string(entry.midi),
            keyLabel(entry.midi, recipe.fifths) + " maior - duas oitavas",
            "Quatro por arcada, uma mudança de posição em cada sentido",
            "Mudar de posição dentro de uma ligadura",
            "A mudança acontece embaixo de uma ligadura, então ela não pode "
            "ser encoberta por uma troca de arco. Estude a mudança sozinha "
            "primeiro: dedo antigo até a nota nova, mesma corda, sem arco, até "
            "cair sem escorregão.",
            entry.level, 60, ExerciseKind::Scale, recipe);
        exercise.source = "Escalas de duas oitavas, a partir do Flesch, Scale System.";
        exercise.droneMidi = entry.midi - 12;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Three octaves ─────────────────────────────────────────────────────
    static constexpr KeyEntry kThreeOctave[] = {
        {55, 7}, {57, 7}, {58, 8}, {60, 8}, {62, 8}, {63, 9}, {64, 9},
    };

    for (const auto& entry : kThreeOctave) {
        Recipe recipe;
        recipe.tonicMidi    = entry.midi;
        recipe.scale        = ScaleType::Major;
        recipe.octaves      = 3;
        recipe.fifths       = fifthsFor(entry.midi, ScaleType::Major);
        recipe.noteQuarters = 0.5;
        recipe.bow          = BowPattern::Acceleration;

        auto exercise = make(
            std::string("scales.3oct.") + std::to_string(entry.midi),
            keyLabel(entry.midi, recipe.fifths) + " maior - três oitavas",
            "Aceleração de Galamian, de 1 a 8 notas por arcada",
            "O espelho inteiro, em seis velocidades",
            "Três oitavas é a escala padrão de audição. Toque com a arcada de "
            "aceleração: as notas são idênticas em toda velocidade, então "
            "qualquer coisa que desmorona em oito-por-arcada já estava errada "
            "em uma, e você estava passando o arco por cima.",
            entry.level, 60, ExerciseKind::Scale, recipe);
        exercise.source =
            "Flesch, Scale System; Galamian, Contemporary Violin Technique.";
        module.exercises.push_back(std::move(exercise));
    }

    // ── Minors ────────────────────────────────────────────────────────────
    struct MinorEntry { int midi; ScaleType type; const char* label; int level; };
    static constexpr MinorEntry kMinors[] = {
        {69, ScaleType::NaturalMinor,  "menor natural",   4},
        {69, ScaleType::HarmonicMinor, "menor harmônica", 5},
        {69, ScaleType::MelodicMinor,  "menor melódica",  5},
        {62, ScaleType::HarmonicMinor, "menor harmônica", 5},
        {62, ScaleType::MelodicMinor,  "menor melódica",  6},
        {55, ScaleType::HarmonicMinor, "menor harmônica", 6},
        {64, ScaleType::HarmonicMinor, "menor harmônica", 6},
    };

    for (const auto& entry : kMinors) {
        Recipe recipe;
        recipe.tonicMidi = entry.midi;
        recipe.scale     = entry.type;
        recipe.octaves   = 2;
        recipe.fifths    = fifthsFor(entry.midi, entry.type);
        recipe.noteQuarters = 0.5;
        recipe.bow       = BowPattern::Slur4;

        const bool melodic = (entry.type == ScaleType::MelodicMinor);
        auto exercise = make(
            std::string("scales.min.") + std::to_string(entry.midi) + "." +
                std::to_string(static_cast<int>(entry.type)),
            keyLabel(entry.midi, recipe.fifths) + " " + entry.label +
                " - duas oitavas",
            melodic ? "Sexto e sétimo graus elevados só na subida"
                    : "Duas oitavas, quatro por arcada",
            "Afinação em modo menor",
            melodic
                ? "A menor melódica é a única escala que não é igual de trás "
                  "para frente. Subindo, o sexto e o sétimo graus sobem; "
                  "descendo, não. Quase toda nota errada nesta escala é a "
                  "descida tocada como se fosse subida."
                : "A menor harmônica tem uma segunda aumentada entre o sexto e "
                  "o sétimo graus. É um tom e meio, soa errado nas primeiras "
                  "vezes, e está certo.",
            entry.level, 60, ExerciseKind::Scale, recipe);
        exercise.source = "Flesch, Scale System.";
        exercise.droneMidi = entry.midi - 12;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Arpeggios and interval studies ────────────────────────────────────
    struct ShapeEntry { ScaleType type; const char* label; int octaves; int level;
                        const char* howTo; };
    static const ShapeEntry kShapes[] = {
        {ScaleType::ArpeggioMajor, "arpejo maior", 2, 4,
         "Três notas e nenhum lugar para se esconder. A terça é a nota que dá "
         "cor ao acorde e a que todo mundo põe alta demais."},
        {ScaleType::ArpeggioMinor, "arpejo menor", 2, 5,
         "Mesma forma, terça abaixada. Toque os dois em seguida e escute o "
         "quanto a terça realmente anda."},
        {ScaleType::ArpeggioDominant7, "arpejo de sétima da dominante", 2, 6,
         "Quatro notas, e a sétima quer ficar mais baixa do que o temperamento "
         "igual manda. Afine contra o bordão, não contra o afinador."},
        {ScaleType::ArpeggioDiminished7, "arpejo de sétima diminuta", 2, 7,
         "Terças menores até em cima, o que significa que a forma da mão se "
         "repete a cada três semitons. Útil, e um bom teste de se as mudanças "
         "de posição são medidas ou chutadas."},
        {ScaleType::BrokenThirds, "terças quebradas", 1, 6,
         "1-3, 2-4, 3-5. O intervalo que expõe uma moldura de mão irregular, "
         "porque as duas notas são tocadas por dedos que precisam já saber "
         "onde o outro está."},
        {ScaleType::Chromatic, "escala cromática", 1, 5,
         "Doze semitons, um dedo deslizando a cada par. O deslize é a técnica; "
         "uma cromática tocada com quatro dedos separados é outro exercício, "
         "mais fácil."},
    };

    for (const auto& shape : kShapes) {
        Recipe recipe;
        recipe.tonicMidi    = 69;
        recipe.scale        = shape.type;
        recipe.octaves      = shape.octaves;
        recipe.fifths       = fifthsFor(69, shape.type);
        recipe.noteQuarters = 0.5;

        auto exercise = make(
            std::string("scales.shape.") + std::to_string(static_cast<int>(shape.type)),
            std::string("Lá - ") + shape.label,
            std::to_string(shape.octaves) +
                (shape.octaves == 1 ? " oitava" : " oitavas"),
            "Precisão de intervalo",
            shape.howTo, shape.level, 63, ExerciseKind::Scale, recipe);
        exercise.source =
            "Flesch, Scale System - a sequência de arpejos de cada tonalidade.";
        exercise.droneMidi = 57;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. Afinação
// ═══════════════════════════════════════════════════════════════════════════
Module buildIntonation() {
    Module module;
    module.id      = "intonation";
    module.title   = "Afinação";
    module.tagline = "Bordões e notas que ressoam.";
    module.description =
        "O afinador diz que a nota está 12 cents alta. Ele não diz que ela "
        "está alta porque é uma terça e terça quer ser baixa, nem que a mão "
        "inteira subiu. Estes exercícios usam o próprio instrumento como "
        "referência: um bordão embaixo, ou uma corda solta que ressoa quando a "
        "nota com dedo concorda com ela. Os dois são mais antigos, mais "
        "rápidos e mais transferíveis do que ler um ponteiro.";
    module.accent    = 0;
    module.levelFrom = 1;
    module.levelTo   = 8;

    // ── Ring tones, per string ────────────────────────────────────────────
    for (int string = 0; string < 4; ++string) {
        Recipe recipe;
        recipe.string       = string;
        recipe.noteQuarters = 4.0;
        recipe.repeats      = 2;
        recipe.fifths       = 0;

        auto exercise = make(
            std::string("intonation.ring.") + kStringId[string],
            "Notas que ressoam - corda " + stringName(string),
            "As notas que as outras cordas respondem",
            "Ressonância simpática",
            "Só um punhado de notas na primeira posição divide a mesma classe "
            "de altura com uma corda solta, e são justamente elas que fazem o "
            "instrumento inteiro ressoar. Toque a corda solta, depois a nota "
            "com dedo, e mova o dedo até o corpo do violino entrar junto. "
            "Quando ele entra, a nota está afinada - e nenhum afinador "
            "participou disso.",
            1, 48, ExerciseKind::RingTone, recipe);
        exercise.source = "A checagem por ressonância da pedagogia de cordas.";
        exercise.droneMidi = score::kOpenStringMidi[string];
        module.exercises.push_back(std::move(exercise));
    }

    // ── Drone scales ──────────────────────────────────────────────────────
    struct DroneEntry { int midi; ScaleType type; const char* label; int level; };
    static constexpr DroneEntry kDrones[] = {
        {69, ScaleType::Major,         "Lá maior",           2},
        {62, ScaleType::Major,         "Ré maior",           2},
        {55, ScaleType::Major,         "Sol maior",          3},
        {60, ScaleType::Major,         "Dó maior",           3},
        {69, ScaleType::HarmonicMinor, "Lá menor harmônica", 5},
        {62, ScaleType::Dorian,        "Ré dórico",          6},
        {55, ScaleType::Mixolydian,    "Sol mixolídio",      6},
    };

    for (const auto& entry : kDrones) {
        Recipe recipe;
        recipe.tonicMidi    = entry.midi;
        recipe.scale        = entry.type;
        recipe.noteQuarters = 4.0;
        recipe.fifths       = fifthsFor(entry.midi, entry.type);
        recipe.repeats      = 1;

        auto exercise = make(
            std::string("intonation.drone.") + std::to_string(entry.midi) + "." +
                std::to_string(static_cast<int>(entry.type)),
            std::string(entry.label) + " contra o bordão",
            "Um grau por vez, sustentado um compasso inteiro",
            "Afinar intervalos de ouvido",
            "O bordão é a tônica. Segure cada grau até o batimento entre as "
            "duas alturas desacelerar e parar - esse silêncio é a nota afinada "
            "com a tonalidade, o que nem sempre é o mesmo que estar afinada "
            "com um afinador. As terças vão acabar mais baixas do que o "
            "ponteiro quer, e as quintas mais largas. Confie no batimento.",
            entry.level, 40, ExerciseKind::DroneInterval, recipe);
        exercise.source =
            "Estudo com bordão - o treino padrão de ouvido em entoação justa.";
        exercise.droneMidi = entry.midi - 12;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Finger patterns against a drone ───────────────────────────────────
    for (int pattern = 0; pattern < 4; ++pattern) {
        for (int string = 1; string < 4; ++string) {
            Recipe recipe;
            recipe.pattern      = pattern;
            recipe.string       = string;
            recipe.noteQuarters = 2.0;
            recipe.repeats      = 2;
            recipe.fifths       = 0;

            auto exercise = make(
                std::string("intonation.pattern.") + std::to_string(pattern) + "." +
                    kStringId[string],
                std::string("Padrão ") + std::to_string(pattern + 1) +
                    " na corda " + stringName(string),
                fingerPatternName(pattern),
                "Lugar do semitom, com bordão",
                "As mesmas quatro formas do aquecimento, mais devagar e com "
                "uma referência. Mínimas, bordão embaixo: há tempo suficiente "
                "em cada nota para ouvir se ela concorda.",
                3, 50, ExerciseKind::FingerPattern, recipe);
            exercise.source =
                "Padrões de dedos de primeira posição, com bordão na tônica.";
            exercise.droneMidi = score::kOpenStringMidi[string] - 12;
            module.exercises.push_back(std::move(exercise));
        }
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. Leitura
// ═══════════════════════════════════════════════════════════════════════════
Module buildReading() {
    Module module;
    module.id      = "reading";
    module.title   = "Leitura";
    module.tagline = "Notas novas toda vez.";
    module.description =
        "Leitura à primeira vista é a única habilidade que não se estuda por "
        "repetição, porque a segunda passada já não é primeira vista. Todo "
        "exercício aqui é gerado no instante em que você aperta play, então a "
        "página é sempre nova. Duas regras vindas da pesquisa: mantenha o "
        "andamento firme mesmo às custas das notas, e olhe o ritmo antes das "
        "alturas. Quem para para consertar uma nota errada está treinando a si "
        "mesmo para parar.";
    module.accent    = 3;
    module.levelFrom = 1;
    module.levelTo   = 9;

    struct ReadingEntry {
        const char* id;
        const char* title;
        int fifths;
        int low;
        int high;
        int grade;
        int bars;
        int level;
        int bpm;
        const char* focus;
    };

    static const ReadingEntry kReading[] = {
        {"a.1", "Corda Lá, por graus conjuntos",   3, 69, 76, 0, 8,  1, 60,
         "Nome das notas numa corda só"},
        {"d.1", "Corda Ré, por graus conjuntos",   2, 62, 69, 0, 8,  1, 60,
         "Nome das notas numa corda só"},
        {"da.1", "Cordas Ré e Lá",                 2, 62, 78, 0, 8,  2, 63,
         "Ler atravessando uma mudança de corda"},
        {"da.2", "Ré e Lá, com colcheias",         2, 62, 78, 1, 8,  3, 66,
         "Vocabulário rítmico"},
        {"g.1", "As cordas graves",                1, 55, 67, 1, 8,  3, 63,
         "Linhas suplementares abaixo da pauta"},
        {"full.1", "Primeira posição, Ré maior",   2, 55, 81, 1, 12, 4, 66,
         "A primeira posição inteira"},
        {"full.2", "Primeira posição, Sol maior",  1, 55, 81, 2, 12, 5, 69,
         "Ritmos pontuados e saltos"},
        {"full.3", "Primeira posição, Sib maior", -2, 55, 81, 2, 12, 6, 69,
         "Tonalidades com bemol, primeiro dedo baixo"},
        {"full.4", "Dois sustenidos, semicolcheias", 2, 62, 86, 3, 12, 7, 72,
         "Velocidade com precisão"},
        {"full.5", "Três bemóis, saltos largos",   -3, 55, 86, 3, 16, 8, 72,
         "Tonalidades com bemol em velocidade"},
        {"full.6", "Quatro sustenidos, terceira posição", 4, 62, 91, 3, 16, 9, 76,
         "Ler acima da primeira posição"},
    };

    for (const auto& entry : kReading) {
        Recipe recipe;
        recipe.fifths       = entry.fifths;
        recipe.lowMidi      = entry.low;
        recipe.highMidi     = entry.high;
        recipe.pattern      = entry.grade;
        recipe.bars         = entry.bars;
        recipe.stepwiseOnly = (entry.grade == 0);

        auto exercise = make(
            std::string("reading.") + entry.id,
            entry.title,
            std::to_string(entry.bars) + " compassos, gerados novos a cada vez",
            entry.focus,
            "Uma passada só. Olhe a linha inteira antes de começar - a "
            "tonalidade, a nota mais aguda e qualquer ritmo que você não "
            "reconheça - e então toque num andamento que dê para segurar até o "
            "fim. Desacelerar no compasso difícil é o hábito que faz um mau "
            "leitor.",
            entry.level, entry.bpm, ExerciseKind::SightReading, recipe);
        exercise.source =
            "Gerado. Graduado pelo princípio de uma variável por vez, como nos "
            "programas padrão de leitura à primeira vista.";
        exercise.freshEveryTime = true;
        exercise.metronome      = true;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Note naming ───────────────────────────────────────────────────────
    struct NamingEntry { const char* id; const char* title; int fifths;
                         int low; int high; int level; };
    static constexpr NamingEntry kNaming[] = {
        {"name.a", "Nomeie a nota - corda Lá",  3, 69, 78, 1},
        {"name.d", "Nomeie a nota - corda Ré",  2, 62, 71, 1},
        {"name.g", "Nomeie a nota - corda Sol", 1, 55, 64, 2},
        {"name.e", "Nomeie a nota - corda Mi",  4, 76, 88, 2},
        {"name.all", "Nomeie a nota - em qualquer lugar", 0, 55, 88, 3},
    };

    for (const auto& entry : kNaming) {
        Recipe recipe;
        recipe.fifths       = entry.fifths;
        recipe.lowMidi      = entry.low;
        recipe.highMidi     = entry.high;
        recipe.noteQuarters = 2.0;
        recipe.bars         = 4;

        auto exercise = make(
            std::string("reading.") + entry.id, entry.title,
            "Notas soltas, meio compasso cada",
            "Nomear uma nota de imediato",
            "Não é melodia: as notas não se conectam, então o olho não pode "
            "surfar o contorno e tem que ler cada uma. Fale o nome em voz alta "
            "antes de tocar. Ler por padrão é um bom hábito que disfarça em "
            "silêncio o fato de você não saber como a nota se chama.",
            entry.level, 50, ExerciseKind::IntervalReading, recipe);
        exercise.source = "Gerado. Treino de notas de referência.";
        exercise.freshEveryTime = true;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. Ritmo
// ═══════════════════════════════════════════════════════════════════════════
Module buildRhythm() {
    Module module;
    module.id      = "rhythm";
    module.title   = "Ritmo";
    module.tagline = "Uma altura só. Só o tempo para errar.";
    module.description =
        "Todo exercício aqui é numa corda solta. Isso é de propósito: sem mão "
        "esquerda e sem mudança de corda, um ritmo que sai torto não tem em "
        "quem botar a culpa. Ligue o metrônomo e olhe o erro de ataque no "
        "painel - ele tem sinal, então diz se você está adiantado ou atrasado, "
        "não só que está errado.";
    module.accent    = 1;
    module.levelFrom = 1;
    module.levelTo   = 6;

    struct RhythmEntry { int pattern; int level; int bpm; const char* focus;
                         const char* howTo; };
    static const RhythmEntry kEntries[] = {
        {0, 1, 72, "O tempo em si",
         "Semínimas contra o clique. Se você não consegue fazer o clique sumir "
         "debaixo da nota, nada depois disto vai funcionar."},
        {1, 1, 72, "Subdividir",
         "Duas notas por tempo. Conte a segunda; a maioria toca ela adiantada "
         "porque já está esperando o próximo tempo."},
        {2, 2, 66, "Segurar uma nota longa",
         "Uma mínima são dois tempos, não 'um pouquinho mais'. Mantenha o arco "
         "andando durante o segundo tempo ou a nota acaba antes."},
        {3, 3, 66, "Semínima pontuada e colcheia",
         "A colcheia pertence ao tempo da semínima pontuada, não ao próximo. "
         "Fale 'um-e-a dois' em voz alta e a colocação se resolve sozinha."},
        {4, 4, 60, "Colcheia pontuada e semicolcheia",
         "O ritmo mais afiado do repertório comum, e o mais tocado como se "
         "fosse tercina. Subdivida em semicolcheias e a diferença fica óbvia."},
        {5, 4, 66, "Síncope",
         "A nota longa cai entre os tempos. Mantenha o pé andando - no "
         "instante em que você para de contar, a síncope vira uma tercina "
         "lenta."},
        {6, 5, 60, "Tercinas",
         "Três notas iguais por tempo. Alterne com o exercício de colcheias "
         "para sentir o quanto são diferentes; sozinhas, elas derivam para um "
         "ritmo pontuado."},
        {7, 5, 60, "Semicolcheias",
         "Quatro por tempo, metade superior do arco. Regularidade primeiro, "
         "velocidade depois."},
        {8, 2, 72, "O primeiro ritmo de Suzuki",
         "Quatro semicolcheias e duas colcheias - o padrão que Suzuki põe na "
         "frente de todo iniciante antes de qualquer melodia. Semicolcheias "
         "destacadas, colcheias em staccato."},
        {9, 3, 72, "Longa, curta-curta",
         "A terceira variação do Twinkle. A longa vale meio tempo inteiro e as "
         "duas curtas dividem a outra metade; quase todo mundo dá pouco tempo "
         "para a longa."},
        {10, 4, 60, "Compasso composto",
         "Seis colcheias por compasso em dois grupos de três. O pulso é a "
         "semínima pontuada, não a colcheia - reger em seis é como isso acaba "
         "soando como uma valsa lenta."},
    };

    for (const auto& entry : kEntries) {
        Recipe recipe;
        recipe.tonicMidi = 69;                  // Lá solto
        recipe.pattern   = entry.pattern;
        recipe.repeats   = 4;
        recipe.fifths    = 0;
        if (entry.pattern == 10) {
            recipe.beats    = 6;
            recipe.beatUnit = 8;
        }

        auto exercise = make(
            std::string("rhythm.") + std::to_string(entry.pattern),
            rhythmName(entry.pattern),
            "Lá solto, metrônomo ligado",
            entry.focus, entry.howTo, entry.level, entry.bpm,
            ExerciseKind::Rhythm, recipe);
        exercise.source =
            "Vocabulário rítmico; os padrões de Suzuki onde indicado.";
        exercise.metronome = true;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. Suzuki
// ═══════════════════════════════════════════════════════════════════════════
Module buildSuzuki() {
    Module module;
    module.id      = "suzuki";
    module.title   = "Método Suzuki";
    module.tagline = "As variações do Twinkle, e dez livros.";
    module.description =
        "O método Suzuki é uma filosofia antes de ser um repertório: escute "
        "primeiro, toque de ouvido, revise tudo que já aprendeu, e deixe a "
        "leitura para depois. O Livro 1 abre com cinco variações rítmicas "
        "sobre uma melodia só, para que o iniciante conheça cinco padrões de "
        "arco tendo que pensar em apenas quatro notas. Essas variações estão "
        "aqui, completas. Os livros seguintes aparecem com o que cada um "
        "trabalha e com a técnica dos outros módulos que o prepara - as "
        "edições impressas têm direitos autorais e não são reproduzidas aqui.";
    module.accent    = 2;
    module.levelFrom = 1;
    module.levelTo   = 10;

    // ── The Twinkle variations ────────────────────────────────────────────
    for (int variation = 0; variation < kVariationCount; ++variation) {
        Recipe recipe;
        recipe.pieceIndex = 0;              // Twinkle
        recipe.pattern    = variation;
        recipe.fifths     = 3;

        const bool isTheme = (variation == 0);
        auto exercise = make(
            std::string("suzuki.twinkle.") + std::to_string(variation),
            std::string("Twinkle - ") + variationName(variation),
            isTheme ? "A melodia, uma arcada por nota"
                    : "As mesmas quatro notas, um ritmo de arco novo",
            isTheme ? "Legato, arcadas iguais" : "Ritmo de arco",
            std::string(variationFocus(variation)) +
                (isTheme
                     ? " Suzuki põe o tema por último, depois das variações, "
                       "porque quem consegue tocar as variações já consegue "
                       "tocar o tema."
                     : " As notas são as que você já conhece, então toda a "
                       "atenção fica livre para o arco."),
            isTheme ? 2 : 1, isTheme ? 84 : 76, ExerciseKind::Piece, recipe);
        exercise.source =
            "Ritmo conforme as variações do Livro 1 de Suzuki; a melodia é "
            "'Ah! vous dirai-je, maman', francesa, 1761, domínio público.";
        exercise.metronome = true;
        module.exercises.push_back(std::move(exercise));
    }

    // ── Book roadmap ──────────────────────────────────────────────────────
    // A book entry is not playable; it is a card that says what the volume is
    // for and points at the technique that prepares it. Presenting the ten
    // books as a ladder is the single most useful thing the method offers a
    // player working alone.
    struct BookEntry {
        int         number;
        int         level;
        const char* pieces;
        const char* focus;
        const char* howTo;
    };

    static const BookEntry kBooks[] = {
        {1, 1,
         "Variações do Twinkle, Lightly Row, Song of the Wind, Go Tell Aunt "
         "Rhody, O Come Little Children, May Song, Long Long Ago, Allegro, "
         "Perpetual Motion, Allegretto, Andantino, Etude, Minuetos 1-3 (Bach), "
         "The Happy Farmer (Schumann), Gavotte (Gossec)",
         "Detaché, staccato, arcada ligada; primeira posição, Lá e Ré maior",
         "Quase todo o Livro 1 mora em Lá e Ré maior, na primeira posição. A "
         "preparação é o módulo Aquecimento e as escalas de uma oitava; a "
         "leitura vem depois, que é justamente o ponto do método."},

        {2, 3,
         "Coro de Judas Macabeu (Handel), Musette (Bach), Coro dos Caçadores "
         "(Weber), variação de Long Long Ago, Valsa (Brahms), Bourrée "
         "(Handel), Os Dois Granadeiros (Schumann), Dança das Bruxas "
         "(Paganini), Gavotte de Mignon (Thomas), Gavotte (Lully), Minueto em "
         "Sol (Beethoven), Minueto (Boccherini)",
         "Padrões de dedos estendidos, mudanças de corda ligadas, Sol e Dó maior",
         "O Livro 2 deixa as duas tonalidades confortáveis e passa a pedir "
         "primeiro dedo baixo e terceiro alto. Rode os quatro padrões de dedos "
         "do módulo Aquecimento até as formas ficarem automáticas antes de "
         "começar."},

        {3, 4,
         "Gavotte (Martini), Minueto (Bach/Petzold), Gavotte em Sol menor "
         "(Bach), Humoresque (Dvorák), Gavotte (Becker), Gavotte em Ré (Bach), "
         "Bourrée (Bach)",
         "Terceira posição, o primeiro vibrato, primeiras cordas duplas",
         "Este é o livro em que a mão sai da primeira posição de vez. Os "
         "estudos 'até a terceira posição' em Uma corda por vez são a "
         "preparação direta, e devem estar confortáveis antes da Humoresque."},

        {4, 5,
         "Canções de ninar (Schubert, Brahms), Concertos 2 e 5 de Seitz, "
         "Concerto em Lá menor de Vivaldi, Perpetual Motion de Bohm, Concerto "
         "para dois violinos de Bach (2º violino)",
         "Forma de concerto, segunda e quarta posição, som sustentado",
         "Os primeiros concertos. Escalas de duas oitavas com a mudança de "
         "posição dentro da ligadura são a técnica que eles pedem; a parte de "
         "segundo violino do Concerto Duplo é a primeira vez em que o ouvido "
         "tem que segurar uma linha contra outra."},

        {5, 6,
         "Gavotte (Bach), 2º movimento do Vivaldi em Lá menor, Vivaldi em Sol "
         "menor, Country Dance (Weber), Dança Alemã (Dittersdorf), Giga "
         "(Veracini), Concerto Duplo de Bach (1º violino)",
         "Quinta posição, spiccato e collé",
         "A arcada fora da corda começa aqui. Ela nasce de um detaché muito "
         "curto no ponto de equilíbrio, então o módulo Golpes de arco vem "
         "antes e o salto sai daí, em vez de ser perseguido."},

        {6, 7,
         "La Folia (Corelli), Sonatas 3 e 4 de Handel, Allegro (Fiocco), "
         "Gavotte (Rameau)",
         "Sexta e sétima posição, fraseado barroco",
         "La Folia é um conjunto de variações que percorre quase toda a "
         "técnica dos cinco primeiros livros em dez minutos. Escalas de três "
         "oitavas nas mesmas tonalidades são a preparação."},

        {7, 8,
         "Minueto (Mozart), Courante (Corelli), Sonata em Lá de Handel, "
         "Concerto em Lá menor de Bach, Giga e Courante (Bach)",
         "O concerto em Lá menor de Bach; três oitavas com cordas duplas",
         "O primeiro concerto solo completo do repertório padrão. Daqui em "
         "diante o trabalho de escalas deixa de ser preparação para as peças e "
         "passa a ter a mesma dificuldade que elas."},

        {8, 9,
         "Sonata em Sol menor de Eccles, Tambourin (Grétry), Largo da BWV "
         "1005, Preludio da BWV 1023, Largo espressivo (Pugnani), Sonata em Mi "
         "menor de Veracini",
         "Bach solo, trinados, três oitavas em Ré e Mi maior",
         "Bach solo é o ponto em que a afinação tem que se sustentar sozinha: "
         "não há acompanhamento contra o qual afinar. Gaste os exercícios de "
         "bordão do módulo Afinação nas tonalidades das próprias peças."},

        {9, 10,
         "Concerto para violino nº 5 em Lá maior, K. 219, de Mozart",
         "Estilo clássico, o instrumento inteiro",
         "Um concerto, três movimentos, e um livro inteiro só para ele. Tudo "
         "dos oito livros anteriores é dado como sabido."},

        {10, 10,
         "Concerto para violino nº 4 em Ré maior, K. 218, de Mozart",
         "Estilo clássico, o instrumento inteiro",
         "O último volume. A esta altura o método já cumpriu seu papel e o "
         "repertório é simplesmente o repertório."},
    };

    for (const auto& book : kBooks) {
        Recipe recipe;
        recipe.pieceIndex = -1;

        Exercise exercise;
        exercise.id       = "suzuki.book." + std::to_string(book.number);
        exercise.title    = "Livro " + std::to_string(book.number);
        exercise.subtitle = book.focus;
        exercise.focus    = book.focus;
        exercise.howTo    = book.howTo;
        exercise.source   = book.pieces;
        exercise.level    = book.level;
        exercise.kind     = ExerciseKind::Reference;
        exercise.recipe   = recipe;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. Melodias
// ═══════════════════════════════════════════════════════════════════════════
Module buildRepertoire() {
    Module module;
    module.id      = "repertoire";
    module.title   = "Melodias";
    module.tagline = "Peças que cabem na mão do primeiro ano.";
    module.description =
        "Técnica sem música junto deixa de ser estudo e vira ginástica. Estas "
        "são melodias de domínio público, transpostas para tonalidades que "
        "caem na primeira posição, e curtas o bastante para serem tocadas duas "
        "vezes numa sentada. Para repertório de verdade - Schubert, Brahms, "
        "Fauré e companhia - rode tools/fetch_library.py, que baixa edições "
        "CC0 para assets/songs, e abra pela Biblioteca.";
    module.accent    = 2;
    module.levelFrom = 1;
    module.levelTo   = 5;

    static constexpr int kLevels[] = {2, 3, 3, 2, 1, 1, 2, 3, 5};
    static const char* kHowTo[] = {
        "A melodia inteira fica nas cordas Lá e Mi. Toque uma vez escutando "
        "apenas as mudanças de corda.",
        "A primeira melodia que sobe até a corda Mi e volta. Mantenha o nível "
        "do braço andando à frente do arco.",
        "Quase tudo por graus conjuntos, então qualquer nota errada é um dedo "
        "que não se moveu, não um salto que errou.",
        "Quatro frases, cada uma tocada duas vezes. Faça a repetição soar "
        "diferente - mais baixa, ou com mais arco - senão não é repetição, é "
        "engano.",
        "Três notas na maior parte do tempo. Use para trabalhar em fazer notas "
        "repetidas soarem idênticas.",
        "A primeira melodia que qualquer um toca. A troca de semínimas para "
        "colcheias no terceiro compasso é o exercício inteiro.",
        "Quatro notas repetidas logo no começo. Se alguma soar mais forte que "
        "as outras, o arco está trocando de direção com acento.",
        "Notas repetidas rápidas na ponta do arco. Mantenha o golpe curto.",
        "Três tempos por compasso, o que obriga o arco a planejar. Bach "
        "escreve a frase por cima da barra de compasso, então não respire em "
        "toda barra.",
    };

    for (int index = 0; index < pieceCount(); ++index) {
        const PieceData* piece = pieceAt(index);
        if (piece == nullptr) {
            continue;
        }
        Recipe recipe;
        recipe.pieceIndex = index;
        recipe.pattern    = 0;
        recipe.fifths     = piece->fifths;
        recipe.beats      = piece->beats;
        recipe.beatUnit   = piece->beatUnit;

        auto exercise = make(
            std::string("repertoire.") + std::to_string(index),
            piece->title, piece->composer, "Tocar uma melodia",
            kHowTo[std::min<std::size_t>(static_cast<std::size_t>(index),
                                         std::size(kHowTo) - 1)],
            kLevels[std::min<std::size_t>(static_cast<std::size_t>(index),
                                          std::size(kLevels) - 1)],
            piece->bpm, ExerciseKind::Piece, recipe);
        exercise.source = piece->source;
        module.exercises.push_back(std::move(exercise));
    }

    return module;
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Assembly and lookup
// ═══════════════════════════════════════════════════════════════════════════

const Module* Curriculum::findModule(const std::string& id) const noexcept {
    const auto it = std::find_if(modules.begin(), modules.end(),
                                 [&](const Module& m) { return m.id == id; });
    return (it == modules.end()) ? nullptr : &*it;
}

const Exercise* Curriculum::findExercise(const std::string& id) const noexcept {
    for (const auto& module : modules) {
        const auto it = std::find_if(module.exercises.begin(), module.exercises.end(),
                                     [&](const Exercise& e) { return e.id == id; });
        if (it != module.exercises.end()) {
            return &*it;
        }
    }
    return nullptr;
}

std::size_t Curriculum::exerciseCount() const noexcept {
    std::size_t total = 0;
    for (const auto& module : modules) {
        total += module.exercises.size();
    }
    return total;
}

Curriculum buildCurriculum() {
    Curriculum curriculum;
    curriculum.modules.push_back(buildWarmUp());
    curriculum.modules.push_back(buildIntonation());
    curriculum.modules.push_back(buildScales());
    curriculum.modules.push_back(buildBowing());
    curriculum.modules.push_back(buildStrings());
    curriculum.modules.push_back(buildRhythm());
    curriculum.modules.push_back(buildReading());
    curriculum.modules.push_back(buildSuzuki());
    curriculum.modules.push_back(buildRepertoire());

    // Inside a module, easy first. Stable, so the hand-written order survives
    // within a level band and the tables above stay meaningful.
    for (auto& module : curriculum.modules) {
        std::stable_sort(module.exercises.begin(), module.exercises.end(),
                         [](const Exercise& a, const Exercise& b) {
                             return a.level < b.level;
                         });
    }
    return curriculum;
}

}  // namespace fretless::curriculum
