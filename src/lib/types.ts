export interface BestLap {
  lap: number;
  time: string;
  kph: number;
}

export interface RaceResult {
  pos: number | string;
  no: string;
  pilot: string;
  team: string;
  racebird: string;
  class: string;
  laps: number;
  total_time: string | null;
  gap: string | null;
  kph: number | null;
  best_lap: BestLap | null;
  note?: string;
}

export interface FastestLap {
  lap: number;
  pilot: string;
  time: string;
  kph: number;
}

export interface ClassificationDoc {
  type: "classification";
  race_round: string;
  location: string;
  session: string;
  laps: number | null;
  distance: string;
  wind: string;
  fastest_lap: FastestLap | null;
  results: RaceResult[];
  date: string;
  source_file: string;
}

export interface LapData {
  marker: "SL" | "LL" | "__" | null;
  lap: number;
  pilot_pos: number;
  time: string;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  kph: number | null;
  elapsed: string;
}

export interface TeamAnalysis {
  team: string;
  no: string;
  racebird: string;
  class: string;
  pilots: string[];
  laps: LapData[];
}

export interface AnalysisDoc {
  type: "analysis";
  race_round: string;
  location: string;
  session: string;
  teams: TeamAnalysis[];
  source_file: string;
}

export interface GridEntry {
  pos: number;
  pilot: string;
  no: string;
  team: string;
}

export interface GridDoc {
  type: "grid";
  race_round: string;
  location: string;
  session: string;
  grid: GridEntry[];
  source_file: string;
}

export interface ChampionshipStanding {
  pos: number;
  team: string;
  points: number;
}

export interface ChampionshipDoc {
  type: "championship";
  location: string;
  standings: ChampionshipStanding[];
  source_file: string;
}

export type EventDoc = ClassificationDoc | AnalysisDoc | GridDoc | ChampionshipDoc;

export interface RaceData {
  events: Record<string, EventDoc[]>;
}

export interface SeasonData {
  races: Record<string, RaceData>;
}

export interface AllData {
  seasons: Record<string, SeasonData>;
}
