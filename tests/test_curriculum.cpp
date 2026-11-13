// ═══════════════════════════════════════════════════════════════════════════
//  test_curriculum.cpp — the generated syllabus.
//
//  A curriculum built from tables has a failure mode that hand-written content
//  does not: one wrong field in one row produces an exercise that is silently
//  empty, silently unplayable, or silently a duplicate of another. None of
//  those crash, and none of them are visible until a player runs into them.
//  These cases are the tripwire.
// ═══════════════════════════════════════════════════════════════════════════
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <set>
#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/Generators.h"
#include "fretless/curriculum/PracticePlan.h"
#include "fretless/curriculum/Progress.h"
#include "fretless/curriculum/Repertoire.h"
#include "fretless/curriculum/ScoreBuilder.h"

using namespace fretless;
using namespace fretless::curriculum;

namespace {

const Curriculum& shipped() {
    static const Curriculum curriculum = buildCurriculum();
    return curriculum;
}

std::vector<int> pitchesOf(const score::Score& built) {
    std::vector<int> out;
    for (const auto& event : built.events) {
        if (!event.isRest) {
            out.push_back(event.midi);
        }
    }
    return out;
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  The shipped tables
// ═══════════════════════════════════════════════════════════════════════════

TEST(every_playable_exercise_produces_notes_the_violin_can_reach) {
    // The violin's lowest note is the open G, MIDI 55. The top is set by the
    // pitch detector's search range, which stops just above E7 — a note above
    // it would be graded a miss however well it was played.
    for (const auto& module : shipped().modules) {
        for (const auto& exercise : module.exercises) {
            if (!isPlayable(exercise.kind)) {
                continue;
            }
            const auto built = buildScore(exercise, 4242u);
            if (built.events.empty()) {
                ::testing::reportFailure(__FILE__, __LINE__,
                                         "empty exercise: " + exercise.id);
                continue;
            }
            for (const auto& event : built.events) {
                if (event.isRest) {
                    continue;
                }
                if (event.midi < 55 || event.midi > 100) {
                    ::testing::reportFailure(
                        __FILE__, __LINE__,
                        exercise.id + " reaches midi " + std::to_string(event.midi));
                    break;
                }
                if (event.durationSeconds <= 0.0) {
                    ::testing::reportFailure(__FILE__, __LINE__,
                                             exercise.id + " has a zero-length note");
                    break;
                }
            }
        }
    }
}

TEST(exercise_ids_are_unique_because_progress_is_filed_under_them) {
    // Two exercises sharing an id would share a record: practising one would
    // award stars on the other, and neither would ever look finished.
    std::set<std::string> seen;
    for (const auto& module : shipped().modules) {
        for (const auto& exercise : module.exercises) {
            if (!seen.insert(exercise.id).second) {
                ::testing::reportFailure(__FILE__, __LINE__,
                                         "duplicate id: " + exercise.id);
            }
        }
    }
}

TEST(exercise_titles_are_unique_within_a_module) {
    // The list and the practice plan both show titles, not ids. Two rows
    // reading the same thing look like a bug in the plan.
    for (const auto& module : shipped().modules) {
        std::set<std::string> seen;
        for (const auto& exercise : module.exercises) {
            if (!seen.insert(exercise.title).second) {
                ::testing::reportFailure(__FILE__, __LINE__,
                                         module.id + " repeats the title \"" +
                                             exercise.title + "\"");
            }
        }
    }
}

TEST(every_exercise_says_what_it_is_for) {
    for (const auto& module : shipped().modules) {
        for (const auto& exercise : module.exercises) {
            if (exercise.howTo.empty() || exercise.focus.empty()) {
                ::testing::reportFailure(__FILE__, __LINE__,
                                         exercise.id + " has no stated goal");
            }
        }
    }
}

TEST(modules_are_ordered_easiest_first) {
    for (const auto& module : shipped().modules) {
        int previous = 0;
        for (const auto& exercise : module.exercises) {
            if (exercise.level < previous) {
                ::testing::reportFailure(__FILE__, __LINE__,
                                         module.id + " goes backwards at " + exercise.id);
                break;
            }
            previous = exercise.level;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Generators
// ═══════════════════════════════════════════════════════════════════════════

TEST(a_one_octave_scale_goes_up_and_comes_back_to_where_it_started) {
    Exercise exercise;
    exercise.kind = ExerciseKind::Scale;
    exercise.recipe.tonicMidi = 69;          // A4
    exercise.recipe.octaves   = 1;
    exercise.recipe.fifths    = 3;

    const auto pitches = pitchesOf(buildScore(exercise));
    CHECK_EQ(pitches.size(), std::size_t{15});
    CHECK_EQ(pitches.front(), 69);
    CHECK_EQ(pitches.back(), 69);
    CHECK_EQ(pitches[7], 81);                // the octave, at the turn
    // A major: A B C# D E F# G# A
    CHECK_EQ(pitches[1], 71);
    CHECK_EQ(pitches[2], 73);
    CHECK_EQ(pitches[3], 74);
}

TEST(melodic_minor_descends_differently_from_how_it_ascends) {
    // The one scale that is not its own reverse. Getting this wrong is the
    // commonest mistake in a hand-written scale table, and it is silent.
    Exercise exercise;
    exercise.kind = ExerciseKind::Scale;
    exercise.recipe.tonicMidi = 69;
    exercise.recipe.scale     = ScaleType::MelodicMinor;
    exercise.recipe.octaves   = 1;

    const auto pitches = pitchesOf(buildScore(exercise));
    CHECK_EQ(pitches[5], 78);   // F# going up
    CHECK_EQ(pitches[6], 80);   // G# going up
    CHECK_EQ(pitches[8], 79);   // G natural coming down
    CHECK_EQ(pitches[9], 77);   // F natural coming down
}

TEST(a_ringing_tone_shares_its_pitch_class_with_an_open_string) {
    // The whole exercise rests on this: the note only rings because another
    // string is tuned to the same pitch class.
    static constexpr int kOpenClasses[4] = {7, 2, 9, 4};   // G D A E
    for (int string = 0; string < 4; ++string) {
        const auto tones = ringingTones(string);
        CHECK(tones.size() >= 2);
        CHECK_EQ(tones.front(), score::kOpenStringMidi[string]);
        for (const int midi : tones) {
            const int pitchClass = ((midi % 12) + 12) % 12;
            CHECK(std::find(std::begin(kOpenClasses), std::end(kOpenClasses),
                            pitchClass) != std::end(kOpenClasses));
            // Everything must stay inside first position, or it is a shifting
            // exercise wearing an intonation exercise's name.
            CHECK(midi >= score::kOpenStringMidi[string]);
            CHECK(midi <= score::kOpenStringMidi[string] + 7);
        }
    }
}

TEST(finger_patterns_each_put_the_half_step_somewhere_different) {
    for (int pattern = 0; pattern < 4; ++pattern) {
        const auto offsets = fingerPattern(pattern);
        CHECK_EQ(offsets.size(), std::size_t{5});
        CHECK_EQ(offsets.front(), 0);

        int halfSteps = 0;
        for (std::size_t i = 1; i < offsets.size(); ++i) {
            CHECK(offsets[i] > offsets[i - 1]);
            if (offsets[i] - offsets[i - 1] == 1) {
                ++halfSteps;
            }
        }
        // Exactly one pair of fingers touches in each of the four shapes.
        CHECK_EQ(halfSteps, 1);
    }
}

TEST(a_single_string_exercise_never_leaves_its_string) {
    for (int string = 0; string < 4; ++string) {
        Exercise exercise;
        exercise.kind = ExerciseKind::SingleString;
        exercise.recipe.string      = string;
        exercise.recipe.tonicMidi   = score::kOpenStringMidi[string];
        exercise.recipe.maxPosition = 5;

        const auto built = buildScore(exercise);
        CHECK(!built.events.empty());
        for (const auto& event : built.events) {
            if (event.isRest) {
                continue;
            }
            // Playable on that string means at or above its open pitch, and
            // below the next string's fourth finger would reach anyway.
            CHECK(event.midi >= score::kOpenStringMidi[string]);
        }
    }
}

TEST(sight_reading_deals_a_new_page_for_a_new_seed_and_the_same_one_twice) {
    Exercise exercise;
    exercise.kind = ExerciseKind::SightReading;
    exercise.recipe.fifths   = 2;
    exercise.recipe.lowMidi  = 62;
    exercise.recipe.highMidi = 81;
    exercise.recipe.bars     = 8;
    exercise.recipe.pattern  = 1;

    const auto first  = pitchesOf(buildScore(exercise, 1u));
    const auto again  = pitchesOf(buildScore(exercise, 1u));
    const auto second = pitchesOf(buildScore(exercise, 2u));

    CHECK(!first.empty());
    CHECK(first == again);      // reproducible, so a bug report can be replayed
    CHECK(first != second);     // and genuinely new, or it is not sight reading
}

TEST(generated_reading_stays_inside_its_key_and_its_range) {
    Exercise exercise;
    exercise.kind = ExerciseKind::SightReading;
    exercise.recipe.fifths   = 2;      // D major
    exercise.recipe.lowMidi  = 62;
    exercise.recipe.highMidi = 81;
    exercise.recipe.bars     = 16;
    exercise.recipe.pattern  = 3;

    // D major degrees, as pitch classes: D E F# G A B C#
    static constexpr int kInKey[7] = {2, 4, 6, 7, 9, 11, 1};

    for (std::uint32_t seed = 1; seed <= 20; ++seed) {
        const auto built = buildScore(exercise, seed);
        for (const auto& event : built.events) {
            if (event.isRest) {
                continue;
            }
            CHECK(event.midi >= 62);
            CHECK(event.midi <= 81);
            const int pitchClass = ((event.midi % 12) + 12) % 12;
            CHECK(std::find(std::begin(kInKey), std::end(kInKey), pitchClass) !=
                  std::end(kInKey));
        }
    }
}

TEST(a_generated_bar_is_never_left_half_full) {
    // A bar that does not add up puts every following barline in the wrong
    // place on the staff, which makes the whole exercise unreadable.
    Exercise exercise;
    exercise.kind = ExerciseKind::SightReading;
    exercise.recipe.fifths   = 0;
    exercise.recipe.lowMidi  = 62;
    exercise.recipe.highMidi = 79;
    exercise.recipe.bars     = 12;
    exercise.recipe.pattern  = 3;

    for (std::uint32_t seed = 1; seed <= 10; ++seed) {
        const auto built = buildScore(exercise, seed);
        double total = 0.0;
        for (const auto& event : built.events) {
            total += event.durationSeconds;
        }
        const double barSeconds = 60.0 / built.beatsPerMinute *
                                  built.beatsPerMeasure * 4.0 / built.beatUnit;
        const double bars = total / barSeconds;
        CHECK_NEAR(bars - std::floor(bars + 0.5), 0.0, 1e-6);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Repertoire and variations
// ═══════════════════════════════════════════════════════════════════════════

TEST(a_twinkle_variation_keeps_the_pitches_and_changes_the_rhythm) {
    Exercise theme;
    theme.kind = ExerciseKind::Piece;
    theme.recipe.pieceIndex = 0;
    theme.recipe.pattern    = 0;

    Exercise variation = theme;
    variation.recipe.pattern = 5;    // eight even sixteenths

    const auto themeScore     = buildScore(theme);
    const auto variationScore = buildScore(variation);

    CHECK(!themeScore.events.empty());
    // Four notes where the theme had one, so the variation is longer.
    CHECK(variationScore.events.size() > themeScore.events.size());

    // Same music: the two must last the same time and start on the same note.
    CHECK_NEAR(variationScore.durationSeconds(), themeScore.durationSeconds(), 1e-6);
    CHECK_EQ(pitchesOf(variationScore).front(), pitchesOf(themeScore).front());

    // And every pitch the variation uses must be one the theme already had.
    std::set<int> themePitches;
    for (const int midi : pitchesOf(themeScore)) {
        themePitches.insert(midi);
    }
    for (const int midi : pitchesOf(variationScore)) {
        CHECK(themePitches.count(midi) == 1);
    }
}

TEST(every_shipped_melody_lies_under_a_first_position_hand) {
    // These tunes exist so a beginner has something to play. One that needed
    // a shift would quietly be the hardest thing in the app.
    for (int index = 0; index < pieceCount(); ++index) {
        const PieceData* piece = pieceAt(index);
        CHECK(piece != nullptr);
        if (piece == nullptr) {
            continue;
        }
        for (std::size_t i = 0; i < piece->count; ++i) {
            const int midi = piece->notes[i].midi;
            if (midi < 0) {
                continue;
            }
            CHECK(midi >= 55);   // open G
            CHECK(midi <= 83);   // fourth finger on the E string
            CHECK(piece->notes[i].quarters > 0.0f);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ScoreBuilder
// ═══════════════════════════════════════════════════════════════════════════

TEST(the_builder_places_notes_on_the_right_beat_of_the_right_bar) {
    ScoreBuilder builder;
    builder.title("test").tempo(60.0).meter(3, 4).key(0);
    builder.note(69, 1.0).note(71, 1.0).note(72, 1.0)   // bar 1
           .note(74, 1.0);                              // bar 2, beat 1

    const auto built = builder.build();
    CHECK_EQ(built.events.size(), std::size_t{4});
    CHECK_EQ(built.events[0].measure, 1);
    CHECK_EQ(built.events[2].measure, 1);
    CHECK_EQ(built.events[3].measure, 2);
    CHECK_NEAR(built.events[2].beat, 3.0f, 1e-4);
    CHECK_NEAR(built.events[3].beat, 1.0f, 1e-4);
    // At 60 quarter-notes a minute a quarter is exactly one second.
    CHECK_NEAR(built.events[3].startSeconds, 3.0, 1e-9);
}

TEST(a_bow_group_is_numbered_from_zero_and_cannot_cross_a_rest) {
    ScoreBuilder builder;
    builder.tempo(60.0).meter(4, 4).bow(4);
    builder.note(69, 1.0).note(71, 1.0);
    builder.rest(1.0);                 // breaks the bow
    builder.note(72, 1.0).note(74, 1.0);

    const auto built = builder.build();
    CHECK_EQ(int{built.events[0].bowSlot}, 0);
    CHECK_EQ(int{built.events[1].bowSlot}, 1);
    CHECK_EQ(int{built.events[2].bowSpan}, 1);   // the rest
    // The slur starts again after the rest rather than resuming at slot 2.
    CHECK_EQ(int{built.events[3].bowSlot}, 0);
    CHECK_EQ(int{built.events[4].bowSlot}, 1);
}

TEST(note_names_are_spelled_the_way_the_key_signature_writes_them) {
    // Same pitch, two names. A drill that says "A#" while the staff shows a
    // B flat is teaching the wrong name for the right note.
    char sharp[8] = {};
    char flat[8]  = {};
    score::writeNoteName(sharp, sizeof(sharp), 70, +2);
    score::writeNoteName(flat,  sizeof(flat),  70, -2);
    CHECK(std::string(sharp) == "A#4");
    CHECK(std::string(flat)  == "Bb4");
}

TEST(notes_are_presented_with_their_latin_names) {
    // The letter names stay in the data because the staff positions notes by
    // letter; the Latin names are a presentation step. If the two ever get
    // mixed up, the staff draws the right note under the wrong label.
    char latin[16] = {};

    score::writeLatinName(latin, sizeof(latin), 69, 0);
    CHECK(std::string(latin) == "Lá4");
    score::writeLatinName(latin, sizeof(latin), 60, 0);
    CHECK(std::string(latin) == "Dó4");
    score::writeLatinName(latin, sizeof(latin), 55, 0);
    CHECK(std::string(latin) == "Sol3");
    score::writeLatinName(latin, sizeof(latin), 65, 0);
    CHECK(std::string(latin) == "Fá4");

    // Accidentals follow the key signature, exactly as the letter form does.
    score::writeLatinName(latin, sizeof(latin), 70, +2);
    CHECK(std::string(latin) == "Lá#4");
    score::writeLatinName(latin, sizeof(latin), 70, -2);
    CHECK(std::string(latin) == "Sib4");

    // A key has no octave.
    score::writeLatinPitchClass(latin, sizeof(latin), 58, -2);
    CHECK(std::string(latin) == "Sib");
    score::writeLatinPitchClass(latin, sizeof(latin), 62, 2);
    CHECK(std::string(latin) == "Ré");

    // And the conversion is driven off whatever letter form it is handed, so
    // the tuner can feed it the detector's answer directly.
    score::toLatinName("C#5", latin, sizeof(latin));
    CHECK(std::string(latin) == "Dó#5");
}

TEST(the_open_strings_are_named_the_way_a_player_names_them) {
    CHECK(std::string(score::kStringName[score::kStringG]) == "Sol");
    CHECK(std::string(score::kStringName[score::kStringD]) == "Ré");
    CHECK(std::string(score::kStringName[score::kStringA]) == "Lá");
    CHECK(std::string(score::kStringName[score::kStringE]) == "Mi");
}

TEST(exercise_ids_stay_ascii_so_a_progress_file_can_hold_them) {
    // Progress is whitespace-delimited text read back with operator>>. An id
    // is safe as long as it has no space in it, but keeping them ASCII also
    // keeps them greppable and stable if the UI language ever changes.
    for (const auto& module : shipped().modules) {
        for (const auto& exercise : module.exercises) {
            for (const unsigned char ch : exercise.id) {
                if (ch > 127 || ch == ' ') {
                    ::testing::reportFailure(__FILE__, __LINE__,
                                             "non-ASCII id: " + exercise.id);
                    break;
                }
            }
        }
    }
}

TEST(fifths_are_chosen_to_spell_a_key_with_the_fewest_accidentals) {
    CHECK_EQ(fifthsFor(69, ScaleType::Major), 3);          // A major, 3 sharps
    CHECK_EQ(fifthsFor(62, ScaleType::Major), 2);          // D major
    CHECK_EQ(fifthsFor(58, ScaleType::Major), -2);         // Bb major, 2 flats
    CHECK_EQ(fifthsFor(69, ScaleType::NaturalMinor), 0);   // A minor
    CHECK_EQ(fifthsFor(64, ScaleType::NaturalMinor), 1);   // E minor
}

// ═══════════════════════════════════════════════════════════════════════════
//  Progress
// ═══════════════════════════════════════════════════════════════════════════

TEST(progress_keeps_the_best_result_and_the_tempo_it_was_reached_at) {
    Progress progress;
    progress.record("x", 100, 70.0f, 14.0f, 60);
    progress.record("x", 400, 92.0f, 9.0f, 80);
    progress.record("x", 200, 55.0f, 30.0f, 160);   // fast, and much worse

    const ExerciseRecord* record = progress.find("x");
    CHECK(record != nullptr);
    if (record == nullptr) {
        return;
    }
    CHECK_EQ(record->attempts, 3);
    CHECK_EQ(record->bestScore, 400);
    CHECK_NEAR(record->bestAccuracy, 92.0f, 1e-4);
    // The tempo travels with the best accuracy. Reporting 160 here would say
    // the player is clean at a speed they have never been clean at.
    CHECK_EQ(record->bestBpm, 80);
    CHECK_NEAR(record->bestMeanCents, 9.0f, 1e-4);
    CHECK_NEAR(record->lastAccuracy, 55.0f, 1e-4);
}

TEST(the_third_star_needs_the_tempo_as_well_as_the_accuracy) {
    Progress progress;
    progress.record("y", 10, 99.0f, 4.0f, 40);      // immaculate, at half speed
    const ExerciseRecord* record = progress.find("y");
    CHECK(record != nullptr);
    if (record == nullptr) {
        return;
    }
    CHECK_EQ(record->stars(80), 2);

    progress.record("y", 10, 99.0f, 4.0f, 80);      // and now up to tempo
    CHECK_EQ(progress.find("y")->stars(80), 3);
}

TEST(a_streak_counts_days_of_practice_not_exercises_last_touched) {
    // The bug this replaces: only the most recent attempt per exercise was
    // stored, so practising the same warm-up every morning read as one day.
    Progress progress;
    CHECK_EQ(progress.streakDays(), 0);

    progress.record("a", 1, 90.0f, 5.0f, 60);
    CHECK_EQ(progress.streakDays(), 1);
    CHECK_EQ(static_cast<int>(progress.practiceDays()), 1);

    // Three more attempts today, on three different exercises. All of them
    // land on the same day, so the streak must not move.
    progress.record("b", 1, 90.0f, 5.0f, 60);
    progress.record("c", 1, 90.0f, 5.0f, 60);
    progress.record("a", 1, 92.0f, 5.0f, 60);
    CHECK_EQ(progress.streakDays(), 1);
    CHECK_EQ(static_cast<int>(progress.practiceDays()), 1);
    CHECK_EQ(progress.totalAttempts(), 4);
}

TEST(an_unplayed_exercise_has_no_stars) {
    Progress progress;
    CHECK(progress.find("never") == nullptr);
    CHECK_EQ(progress.touch("never").stars(72), 0);
    CHECK_EQ(static_cast<int>(progress.playedCount()), 0);
}

TEST(progress_survives_a_round_trip_through_its_file) {
    // The format is hand-rolled text, so the round trip is the only thing
    // standing between a released build and a player losing their history.
    const std::string path =
        (std::filesystem::temp_directory_path() / "fretless_progress_test.txt").string();
    std::filesystem::remove(path);

    {
        Progress writing;
        writing.load(path);                       // absent file: not an error
        CHECK_EQ(writing.totalAttempts(), 0);
        writing.record("warmup.longtone.G", 320, 88.5f, 11.25f, 52);
        writing.record("scales.1oct.69", 900, 96.0f, 6.5f, 66);
        writing.record("scales.1oct.69", 400, 71.0f, 19.0f, 90);
        CHECK(writing.dirty());
        CHECK(writing.save());
        CHECK(!writing.dirty());
    }

    Progress reading;
    reading.load(path);
    CHECK_EQ(reading.totalAttempts(), 3);
    CHECK_EQ(static_cast<int>(reading.playedCount()), 2);
    CHECK_EQ(reading.streakDays(), 1);

    const ExerciseRecord* scale = reading.find("scales.1oct.69");
    CHECK(scale != nullptr);
    if (scale != nullptr) {
        CHECK_EQ(scale->attempts, 2);
        CHECK_EQ(scale->bestScore, 900);
        CHECK_NEAR(scale->bestAccuracy, 96.0f, 0.01);
        CHECK_EQ(scale->bestBpm, 66);
        CHECK_NEAR(scale->lastAccuracy, 71.0f, 0.01);
    }

    const auto recent = reading.recent(2);
    CHECK_EQ(recent.size(), std::size_t{2});

    std::filesystem::remove(path);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Practice plan
// ═══════════════════════════════════════════════════════════════════════════

TEST(a_practice_plan_never_lists_the_same_exercise_twice) {
    Progress progress;
    const auto plan = buildPracticePlan(shipped(), progress, 25, 99u);

    CHECK(!plan.items.empty());
    std::set<std::string> seen;
    for (const auto& item : plan.items) {
        CHECK(seen.insert(item.exerciseId).second);
        CHECK(!item.reason.empty());
        // Every item must be reachable: the home screen opens the module and
        // then selects the exercise inside it.
        const Module* module = shipped().findModule(item.moduleId);
        CHECK(module != nullptr);
        if (module != nullptr) {
            const auto it = std::find_if(
                module->exercises.begin(), module->exercises.end(),
                [&](const Exercise& e) { return e.id == item.exerciseId; });
            CHECK(it != module->exercises.end());
            CHECK(isPlayable(it->kind));
        }
    }
}

TEST(a_practice_plan_opens_with_the_warm_up) {
    Progress progress;
    const auto plan = buildPracticePlan(shipped(), progress, 25, 7u);
    CHECK(!plan.items.empty());
    if (!plan.items.empty()) {
        CHECK(plan.items.front().moduleId == "warmup");
    }
}

TEST(a_beginner_is_not_handed_a_three_octave_scale) {
    Progress progress;   // empty: level 1
    const auto plan = buildPracticePlan(shipped(), progress, 25, 3u);
    for (const auto& item : plan.items) {
        const Exercise* exercise = shipped().findExercise(item.exerciseId);
        CHECK(exercise != nullptr);
        if (exercise != nullptr) {
            CHECK(exercise->level <= 3);
        }
    }
}

TEST(the_plan_is_stable_within_a_day_and_moves_on_the_next) {
    Progress progress;
    const auto today    = buildPracticePlan(shipped(), progress, 25, 100u);
    const auto again    = buildPracticePlan(shipped(), progress, 25, 100u);
    const auto tomorrow = buildPracticePlan(shipped(), progress, 25, 101u);

    CHECK_EQ(today.items.size(), again.items.size());
    for (std::size_t i = 0; i < today.items.size() && i < again.items.size(); ++i) {
        CHECK(today.items[i].exerciseId == again.items[i].exerciseId);
    }

    bool differs = false;
    for (std::size_t i = 0; i < today.items.size() && i < tomorrow.items.size(); ++i) {
        differs = differs || (today.items[i].exerciseId != tomorrow.items[i].exerciseId);
    }
    CHECK(differs);
}

TEST(a_played_exercise_loses_its_place_to_one_that_has_waited) {
    // The whole point of the schedule: spacing beats massing. An exercise
    // finished today should not be first in today's plan.
    Progress progress;
    const auto before = buildPracticePlan(shipped(), progress, 25, 55u);
    CHECK(!before.items.empty());
    if (before.items.empty()) {
        return;
    }
    const std::string first = before.items.front().exerciseId;
    progress.record(first, 1000, 99.0f, 5.0f, 200);

    const auto after = buildPracticePlan(shipped(), progress, 25, 55u);
    CHECK(!after.items.empty());
    if (!after.items.empty()) {
        CHECK(after.items.front().exerciseId != first);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Content that has to match what it claims
// ═══════════════════════════════════════════════════════════════════════════

TEST(a_module_level_band_is_the_band_its_exercises_really_cover) {
    for (const auto& module : shipped().modules) {
        int lowest = 99;
        int highest = 0;
        for (const auto& exercise : module.exercises) {
            lowest = std::min(lowest, exercise.level);
            highest = std::max(highest, exercise.level);
        }
        if (module.levelFrom != lowest || module.levelTo != highest) {
            ::testing::reportFailure(__FILE__, __LINE__,
                                     module.id + " says " + std::to_string(module.levelFrom) + "-" +
                                         std::to_string(module.levelTo) + " but holds " +
                                         std::to_string(lowest) + "-" + std::to_string(highest));
        }
    }
}

TEST(au_clair_de_la_lune_descends_without_an_octave_leap_and_ends_on_its_tonic) {
    const Exercise* exercise = shipped().findExercise("repertoire.6");
    CHECK(exercise != nullptr);
    if (exercise == nullptr) {
        return;
    }
    const auto pitches = pitchesOf(buildScore(*exercise));
    constexpr int kWidestLeapInTheTune = 7;
    for (std::size_t i = 1; i < pitches.size(); ++i) {
        CHECK(std::abs(pitches[i] - pitches[i - 1]) <= kWidestLeapInTheTune);
    }
    CHECK_EQ(pitches.back(), 62);
}

TEST(the_repertoire_reaches_levels_four_and_six) {
    const Module* module = shipped().findModule("repertoire");
    CHECK(module != nullptr);
    if (module == nullptr) {
        return;
    }
    std::set<int> levels;
    for (const auto& exercise : module->exercises) {
        levels.insert(exercise.level);
    }
    CHECK(levels.count(4) == 1);
    CHECK(levels.count(6) == 1);
}

TEST(a_piece_with_a_pickup_waits_for_it_and_still_fills_whole_bars) {
    for (const char* id : {"repertoire.9", "repertoire.10"}) {
        const Exercise* exercise = shipped().findExercise(id);
        CHECK(exercise != nullptr);
        if (exercise == nullptr) {
            continue;
        }
        const auto score = buildScore(*exercise);
        CHECK(!score.events.empty());
        CHECK(!score.measures.empty());
        const auto firstPlayed = std::find_if(score.events.begin(), score.events.end(),
                                               [](const score::ScoreEvent& event) { return !event.isRest; });
        CHECK(firstPlayed != score.events.end());
        const double firstNote = firstPlayed == score.events.end() ? 0.0 : firstPlayed->startSeconds;
        CHECK(firstNote > 0.0);
        CHECK(firstNote < score.measures.front().endSeconds);
        const double bar = score.measures.front().endSeconds - score.measures.front().startSeconds;
        const double bars = score.durationSeconds() / bar;
        CHECK_NEAR(bars - std::floor(bars + 0.5), 0.0, 1e-6);
    }
}

TEST(tonalization_is_not_the_ring_tone_drill_under_another_name) {
    for (const auto& module : shipped().modules) {
        for (const auto& tonalize : module.exercises) {
            if (tonalize.id.rfind("warmup.tonalize.", 0) != 0) {
                continue;
            }
            const std::string string = tonalize.id.substr(tonalize.id.rfind('.') + 1);
            const Exercise* ring = shipped().findExercise("intonation.ring." + string);
            CHECK(ring != nullptr);
            if (ring != nullptr) {
                CHECK(ring->droneMidi >= 0);
                CHECK(tonalize.droneMidi != ring->droneMidi);
                CHECK(tonalize.recipe.repeats != ring->recipe.repeats);
            }
        }
    }
}

TEST(a_bow_stroke_study_is_not_the_rhythm_drill_on_the_same_string) {
    for (const int pattern : {0, 1, 4, 7}) {
        const Exercise* stroke = shipped().findExercise("bowing.stroke." + std::to_string(pattern));
        const Exercise* rhythm = shipped().findExercise("rhythm." + std::to_string(pattern));
        CHECK(stroke != nullptr);
        CHECK(rhythm != nullptr);
        if (stroke != nullptr && rhythm != nullptr) {
            CHECK(stroke->recipe.tonicMidi != rhythm->recipe.tonicMidi);
        }
    }
}

TEST(the_repertoire_twinkle_is_not_the_suzuki_theme_again) {
    const Exercise* repertoire = shipped().findExercise("repertoire.0");
    const Exercise* suzuki = shipped().findExercise("suzuki.twinkle.0");
    CHECK(repertoire != nullptr);
    CHECK(suzuki != nullptr);
    if (repertoire == nullptr || suzuki == nullptr) {
        return;
    }
    CHECK_EQ(pitchesOf(buildScore(*repertoire)).front(), 62);
    CHECK_EQ(pitchesOf(buildScore(*suzuki)).front(), 69);
}

TEST(note_naming_stays_on_the_string_its_title_names) {
    struct Range { const char* id; int low; int high; };
    constexpr Range kRanges[] = {
        {"reading.name.g", 55, 62}, {"reading.name.d", 62, 69},
        {"reading.name.a", 69, 76}, {"reading.name.e", 76, 83},
    };
    for (const auto& range : kRanges) {
        const Exercise* exercise = shipped().findExercise(range.id);
        CHECK(exercise != nullptr);
        if (exercise != nullptr) {
            CHECK_EQ(exercise->recipe.lowMidi, range.low);
            CHECK_EQ(exercise->recipe.highMidi, range.high);
        }
    }
}

TEST(a_third_position_reading_exercise_stays_in_third_position) {
    const Exercise* exercise = shipped().findExercise("reading.full.6");
    CHECK(exercise != nullptr);
    if (exercise != nullptr) {
        constexpr int kFourthFingerInThirdPositionOnE = 88;
        CHECK(exercise->recipe.highMidi <= kFourthFingerInThirdPositionOnE);
    }
}

TEST(a_two_octave_scale_only_promises_a_shift_when_it_needs_one) {
    const Module* module = shipped().findModule("scales");
    CHECK(module != nullptr);
    if (module == nullptr) {
        return;
    }
    constexpr int kFirstPositionTop = 83;
    for (const auto& exercise : module->exercises) {
        if (exercise.id.rfind("scales.2oct.", 0) != 0) {
            continue;
        }
        const bool needsShift = exercise.recipe.tonicMidi + 24 > kFirstPositionTop;
        const bool promisesShift = exercise.subtitle.find("mudança") != std::string::npos;
        CHECK(promisesShift == needsShift);
    }
}

TEST(sixteenth_note_tempos_never_fall_as_the_level_rises) {
    constexpr const char* kSixteenthStudies[] = {
        "suzuki.twinkle.1", "rhythm.8", "rhythm.9", "rhythm.4",
        "bowing.stroke.4", "rhythm.7", "bowing.stroke.7",
    };
    int previousLevel = 0;
    int previousBpm = 0;
    for (const char* id : kSixteenthStudies) {
        const Exercise* exercise = shipped().findExercise(id);
        CHECK(exercise != nullptr);
        if (exercise == nullptr) {
            continue;
        }
        CHECK(exercise->level >= previousLevel);
        CHECK(exercise->defaultBpm >= previousBpm);
        previousLevel = exercise->level;
        previousBpm = exercise->defaultBpm;
    }
}

TEST(one_good_pass_does_not_move_a_player_up_a_level) {
    constexpr float kCleanAccuracy = 95.0f;
    constexpr float kSteadyCents = 5.0f;
    constexpr int kScore = 1000;
    std::vector<const Exercise*> levelOne;
    for (const auto& module : shipped().modules) {
        for (const auto& exercise : module.exercises) {
            if (isPlayable(exercise.kind) && exercise.level == 1) {
                levelOne.push_back(&exercise);
            }
        }
    }
    CHECK(levelOne.size() >= 3);

    Progress progress;
    const Exercise* first = levelOne.front();
    progress.record(first->id, kScore, kCleanAccuracy, kSteadyCents, first->defaultBpm);
    CHECK_EQ(estimateLevel(shipped(), progress), 1);

    for (const Exercise* exercise : levelOne) {
        progress.record(exercise->id, kScore, kCleanAccuracy, kSteadyCents, exercise->defaultBpm);
    }
    CHECK_EQ(estimateLevel(shipped(), progress), 2);
}

// ═══════════════════════════════════════════════════════════════════════════
//  New content: strokes, double stops, positions, keys, reading
// ═══════════════════════════════════════════════════════════════════════════

namespace {

constexpr double kQuarterTolerance = 1e-6;

double quartersOf(const score::Score& built, std::size_t index) {
    return index + 1 < built.events.size()
        ? built.events[index + 1].startQuarters - built.events[index].startQuarters
        : 0.0;
}

const Exercise& mustFind(const std::string& id) {
    const Exercise* exercise = shipped().findExercise(id);
    if (exercise == nullptr) {
        ::testing::reportFailure(__FILE__, __LINE__, id + " is missing from the curriculum");
        std::abort();
    }
    return *exercise;
}

}  // namespace

TEST(every_stroke_the_bowing_module_promises_is_written_on_its_notes) {
    struct Expected { const char* id; std::uint16_t mark; bool hasRests; int bowSpan; };
    static const Expected kExpected[] = {
        {"bowing.pizzicato", score::kMarkPizzicato, true, 1},
        {"bowing.martele", score::kMarkAccent, true, 1},
        {"bowing.colle", score::kMarkStaccato, true, 1},
        {"bowing.staccato", score::kMarkStaccato, false, 4},
        {"bowing.spiccato", score::kMarkStaccato, false, 1},
    };
    for (const auto& expected : kExpected) {
        const auto built = buildScore(mustFind(expected.id), 1u);
        bool sawRest = false;
        for (const auto& event : built.events) {
            if (event.isRest) {
                sawRest = true;
            } else {
                CHECK((event.marks & expected.mark) != 0);
                CHECK_EQ(static_cast<int>(event.bowSpan), expected.bowSpan);
            }
        }
        CHECK_EQ(sawRest, expected.hasRests);
    }
}

TEST(a_rest_in_a_rhythm_cell_is_silence_not_a_note_or_a_shorter_bar) {
    const auto built = buildScore(mustFind("rhythm.13"), 1u);
    CHECK(built.events.size() >= 4);
    CHECK(!built.events[0].isRest);
    CHECK(built.events[1].isRest);
    CHECK_NEAR(built.events[2].startQuarters, 2.0, kQuarterTolerance);
    CHECK(built.events[3].isRest);
}

TEST(a_double_stop_keeps_both_notes_and_lets_the_detector_hear_either) {
    for (const char* lower : {"G", "D", "A"}) {
        const auto built = buildScore(mustFind(std::string("doublestops.open.") + lower), 1u);
        for (const auto& event : built.events) {
            if (event.isRest) {
                continue;
            }
            CHECK_EQ(static_cast<int>(event.chordSize), 1);
            CHECK_EQ(event.midi - event.chordMidi[0], 7);
            CHECK(event.acceptedCount >= 1);
            CHECK_NEAR(event.acceptedHz[0], score::midiToFrequency(event.chordMidi[0]), 0.01f);
        }
    }
}

TEST(a_fingered_double_stop_keeps_one_string_open) {
    const auto below = buildScore(mustFind("doublestops.below.D"), 1u);
    const auto above = buildScore(mustFind("doublestops.above.D"), 1u);
    std::set<int> belowFingered, aboveFingered;
    for (const auto& event : below.events) {
        if (!event.isRest) {
            CHECK_EQ(event.midi, 69);
            belowFingered.insert(event.chordMidi[0]);
        }
    }
    for (const auto& event : above.events) {
        if (!event.isRest) {
            CHECK_EQ(event.chordMidi[0], 62);
            aboveFingered.insert(event.midi);
        }
    }
    CHECK((belowFingered == std::set<int>{62, 64, 66}));
    CHECK((aboveFingered == std::set<int>{69, 71, 74}));
}

TEST(preparatory_vibrato_rises_one_measured_speed_at_a_time) {
    int previousLevel = 0;
    for (const char* speed : {"2", "3", "4"}) {
        const Exercise& exercise = mustFind(std::string("doublestops.vibrato.") + speed);
        CHECK(exercise.metronome);
        CHECK_EQ(exercise.level, previousLevel == 0 ? 3 : previousLevel + 1);
        previousLevel = exercise.level;
        const auto built = buildScore(exercise, 1u);
        CHECK_EQ(built.events.front().midi, 74);
        CHECK_NEAR(quartersOf(built, 0), 4.0, kQuarterTolerance);
    }
}

TEST(the_seventh_position_comes_before_three_octave_scales) {
    for (const char* string : {"G", "D", "A", "E"}) {
        CHECK(shipped().findExercise(std::string("strings.") + string + ".second") != nullptr);
        CHECK(shipped().findExercise(std::string("strings.") + string + ".fourth") != nullptr);
        const Exercise& seventh = mustFind(std::string("strings.") + string + ".seventh");
        for (const int tonic : {55, 57, 58, 60, 62, 63, 64}) {
            const Exercise& scale = mustFind("scales.3oct." + std::to_string(tonic));
            CHECK(scale.level > seventh.level);
        }
    }
}

TEST(a_shape_exists_in_every_key_and_harder_keys_are_not_easier) {
    static constexpr ScaleType kShapes[] = {
        ScaleType::ArpeggioMajor, ScaleType::ArpeggioMinor, ScaleType::ArpeggioDominant7,
        ScaleType::ArpeggioDiminished7, ScaleType::BrokenThirds, ScaleType::Chromatic};
    for (const ScaleType type : kShapes) {
        const std::string base = "scales.shape." + std::to_string(static_cast<int>(type));
        const Exercise& written = mustFind(base);
        std::set<int> pitchClasses{written.recipe.tonicMidi % 12};
        for (int tonic = 55; tonic <= 66; ++tonic) {
            if (tonic == 57) {
                continue;
            }
            const Exercise& keyed = mustFind(base + "." + std::to_string(tonic));
            CHECK(keyed.level >= written.level);
            pitchClasses.insert(tonic % 12);
        }
        CHECK_EQ(pitchClasses.size(), std::size_t{12});
    }
}

TEST(minor_scales_start_at_one_octave_before_the_two_octave_ones) {
    for (const int tonic : {69, 62, 55, 64}) {
        for (const ScaleType type : {ScaleType::NaturalMinor, ScaleType::HarmonicMinor,
                                     ScaleType::MelodicMinor}) {
            const Exercise& exercise = mustFind("scales.min1." + std::to_string(tonic) + "." +
                                                std::to_string(static_cast<int>(type)));
            const auto pitches = pitchesOf(buildScore(exercise, 1u));
            const auto [low, high] = std::minmax_element(pitches.begin(), pitches.end());
            CHECK_EQ(*high - *low, 12);
        }
    }
}

TEST(a_minor_key_past_six_flats_is_spelled_with_sharps) {
    CHECK_EQ(fifthsFor(61, ScaleType::NaturalMinor), 4);
    CHECK_EQ(fifthsFor(66, ScaleType::HarmonicMinor), 3);
    CHECK_EQ(fifthsFor(56, ScaleType::MelodicMinor), 5);
    CHECK_EQ(fifthsFor(58, ScaleType::NaturalMinor), -5);
}

TEST(acceleration_keeps_the_bow_and_shortens_the_notes) {
    const auto built = buildScore(mustFind("bowing.accel"), 1u);
    double firstNoteOfSpan[9] = {};
    for (std::size_t index = 0; index + 1 < built.events.size(); ++index) {
        const auto& event = built.events[index];
        const auto span = static_cast<std::size_t>(event.bowSpan);
        if (!event.isRest && span < 9 && firstNoteOfSpan[span] == 0.0) {
            firstNoteOfSpan[span] = quartersOf(built, index);
        }
    }
    const double bow = firstNoteOfSpan[1];
    CHECK(bow > 0.0);
    for (const int span : {2, 3, 4, 6, 8}) {
        CHECK_NEAR(firstNoteOfSpan[span] * span, bow, kQuarterTolerance);
    }
}

TEST(a_note_that_opens_a_bar_after_triplets_belongs_to_that_bar) {
    const auto built = buildScore(mustFind("bowing.accel"), 1u);
    for (const auto& event : built.events) {
        CHECK(event.beat >= 1.0f);
        CHECK(event.beat < static_cast<float>(built.beatsPerMeasure) + 1.0f);
        const auto& bar = built.measures[static_cast<std::size_t>(event.measureIndex)];
        CHECK(event.startQuarters > bar.startQuarters - kQuarterTolerance);
    }
}

TEST(real_bariolage_walks_one_string_under_an_open_one) {
    for (int lower = 0; lower < 3; ++lower) {
        const std::string name = std::string("warmup.bariolage.") + "GDA"[lower];
        const auto pitches = pitchesOf(buildScore(mustFind(name), 1u));
        const int low = score::kOpenStringMidi[lower];
        const int high = score::kOpenStringMidi[lower + 1];
        std::set<int> walk;
        for (std::size_t index = 0; index + 1 < pitches.size(); index += 2) {
            walk.insert(pitches[index]);
            CHECK_EQ(pitches[index + 1], high);
        }
        CHECK((walk == std::set<int>{low, low + 2, low + 4, low + 5, low + 7}));
        CHECK_EQ(pitches.back(), low);
    }
}

TEST(a_string_skip_never_sounds_the_string_between) {
    const auto pitches = pitchesOf(buildScore(mustFind("warmup.cross.skip.GE"), 1u));
    CHECK((std::set<int>(pitches.begin(), pitches.end()) == std::set<int>{55, 76}));
    CHECK(shipped().findExercise("warmup.cross.skip.GA") != nullptr);
    CHECK(shipped().findExercise("warmup.cross.skip.DE") != nullptr);
}

TEST(a_read_duration_never_hides_the_beat) {
    const Module* module = shipped().findModule("reading");
    CHECK(module != nullptr);
    for (const auto& exercise : module->exercises) {
        if (exercise.kind != ExerciseKind::SightReading) {
            continue;
        }
        const bool syncopated = exercise.id == "reading.syncopation";
        const double bar = exercise.recipe.beats * 4.0 / exercise.recipe.beatUnit;
        const double beat =
            (exercise.recipe.beatUnit == 8 && exercise.recipe.beats % 3 == 0) ? 1.5 : 1.0;
        for (unsigned seed = 1; seed <= 40; ++seed) {
            const auto built = buildScore(exercise, seed);
            for (std::size_t index = 0; index + 1 < built.events.size(); ++index) {
                const double duration = quartersOf(built, index);
                const double intoBar = std::fmod(built.events[index].startQuarters, bar);
                const double intoBeat = std::fmod(intoBar, beat);
                CHECK(intoBar + duration <= bar + kQuarterTolerance);
                if (syncopated) {
                    continue;
                }
                if (duration >= beat - kQuarterTolerance) {
                    CHECK(intoBeat <= kQuarterTolerance);
                } else {
                    CHECK(intoBeat + duration <= beat + kQuarterTolerance);
                }
            }
        }
    }
}

TEST(a_reading_rest_is_never_the_first_or_last_thing_and_never_doubled) {
    const Exercise& exercise = mustFind("reading.rests");
    bool sawRest = false;
    for (unsigned seed = 1; seed <= 40; ++seed) {
        const auto built = buildScore(exercise, seed);
        CHECK(!built.events.front().isRest);
        CHECK(!built.events.back().isRest);
        for (std::size_t index = 0; index + 1 < built.events.size(); ++index) {
            CHECK(!(built.events[index].isRest && built.events[index + 1].isRest));
            sawRest = sawRest || built.events[index].isRest;
        }
    }
    CHECK(sawRest);
}

TEST(reading_grades_before_rests_have_none) {
    for (const char* id : {"reading.full.1", "reading.leaps", "reading.full.2"}) {
        const auto built = buildScore(mustFind(id), 7u);
        for (const auto& event : built.events) {
            CHECK(!event.isRest);
        }
    }
}

TEST(a_meter_other_than_four_four_reaches_the_score) {
    struct Expected { const char* id; int beats; int unit; };
    static const Expected kExpected[] = {
        {"reading.meter.3", 3, 4}, {"reading.meter.2", 2, 4}, {"reading.meter.68", 6, 8}};
    for (const auto& expected : kExpected) {
        const Exercise& exercise = mustFind(expected.id);
        CHECK_EQ(exercise.recipe.beats, expected.beats);
        CHECK_EQ(exercise.recipe.beatUnit, expected.unit);
        const auto built = buildScore(exercise, 3u);
        const double bar = expected.beats * 4.0 / expected.unit;
        const auto& last = built.events.back();
        const double seconds = 60.0 / built.beatsPerMinute;
        const double end = last.startQuarters + last.durationSeconds / seconds;
        CHECK_NEAR(std::fmod(end + kQuarterTolerance, bar), kQuarterTolerance, 1e-3);
    }
}

TEST(syncopation_puts_a_long_note_off_the_beat) {
    const Exercise& exercise = mustFind("reading.syncopation");
    bool sawSyncope = false;
    for (unsigned seed = 1; seed <= 40 && !sawSyncope; ++seed) {
        const auto built = buildScore(exercise, seed);
        for (std::size_t index = 0; index + 1 < built.events.size(); ++index) {
            const double intoBeat = std::fmod(built.events[index].startQuarters, 1.0);
            if (std::fabs(intoBeat - 0.5) < kQuarterTolerance &&
                std::fabs(quartersOf(built, index) - 1.0) < kQuarterTolerance) {
                sawSyncope = true;
            }
        }
    }
    CHECK(sawSyncope);
}

TEST(a_pickup_exercise_waits_for_the_last_beat) {
    const auto built = buildScore(mustFind("reading.pickup"), 5u);
    CHECK(built.events[0].isRest);
    CHECK(!built.events[1].isRest);
    CHECK_NEAR(built.events[1].startQuarters, 3.0, kQuarterTolerance);
    CHECK_NEAR(built.events[2].startQuarters, 4.0, kQuarterTolerance);
}
