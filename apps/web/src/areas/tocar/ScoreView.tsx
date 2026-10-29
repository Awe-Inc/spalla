import type { NoteJudgement, Score } from "@fretless/core";

import { useSettings } from "@/app/settings";

import { Highway } from "./Highway";
import { PageStaff } from "./PageStaff";
import { ScrollingStaff } from "./ScrollingStaff";

interface ScoreViewProps {
  score: Score;
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
}

const STAFF_BASE_HEIGHT_PX = 208;
const HIGHWAY_BASE_HEIGHT_PX = 240;
const PAGE_BASE_HEIGHT_PX = 440;
const PAGE_MAX_VIEWPORT = "62dvh";

export function ScoreView(props: ScoreViewProps) {
  const playView = useSettings((state) => state.playView);
  const staffScale = useSettings((state) => state.staffScale);
  const pageStyle = useSettings((state) => state.pageStyle);
  const readingGuide = useSettings((state) => state.readingGuide);

  if (playView === "pagina") {
    return (
      <PageStaff
        {...props}
        staffScale={staffScale}
        pageStyle={pageStyle}
        readingGuide={readingGuide}
        style={{ height: `min(${Math.round(PAGE_BASE_HEIGHT_PX * staffScale)}px, ${PAGE_MAX_VIEWPORT})` }}
        className="w-full"
      />
    );
  }

  const showsLanes = playView !== "pauta";
  const showsStaff = playView !== "pistas";

  return (
    <div className="grid w-full gap-3">
      {showsLanes ? <Highway {...props} style={{ height: `${Math.round(HIGHWAY_BASE_HEIGHT_PX * staffScale)}px` }} /> : null}
      {showsStaff ? <ScrollingStaff {...props} style={{ height: `${Math.round(STAFF_BASE_HEIGHT_PX * staffScale)}px` }} /> : null}
    </div>
  );
}
