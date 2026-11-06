const WORD_TEMPOS: ReadonlyArray<readonly [string, number]> = [
  ["larghetto", 60],
  ["largo", 50],
  ["lento", 56],
  ["adagio", 66],
  ["andantino", 84],
  ["andante", 76],
  ["moderato", 96],
  ["allegretto", 112],
  ["allegro", 126],
  ["vivace", 150],
  ["presto", 176],
];
const METRONOME_MARK = /=\s*(\d{2,3})\b/;
const LOWEST_BPM = 20;
const HIGHEST_BPM = 300;

function withoutAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function tempoFromTexts(texts: readonly string[]): number | null {
  for (const text of texts) {
    const bpm = Number(METRONOME_MARK.exec(text)?.[1]);
    if (bpm >= LOWEST_BPM && bpm <= HIGHEST_BPM) return bpm;
  }
  for (const text of texts) {
    const words = withoutAccents(text).split(/[^a-z]+/);
    const known = WORD_TEMPOS.find(([word]) => words.includes(word));
    if (known) return known[1];
  }
  return null;
}
