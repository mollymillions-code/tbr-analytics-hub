import "server-only";

import allData from "@/data/e1_all_data.json";
import type { AllData } from "@/lib/types";

export function getServerData(): AllData {
  return allData as AllData;
}
