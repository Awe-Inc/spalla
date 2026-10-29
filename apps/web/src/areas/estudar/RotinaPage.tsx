import { useRoutines } from "@/areas/hoje/useTodayPlan";

import { EstudarHeader } from "./EstudarTabs";
import { RoutinePicker } from "./RoutinePicker";

export function RotinaPage() {
  const routines = useRoutines();
  return (
    <>
      <EstudarHeader />
      <RoutinePicker routines={routines} />
    </>
  );
}
