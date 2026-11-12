// contracts-v1: types for the data-driven contract (mission) system.
// This module is pure TypeScript: no three.js, no DOM. The engine feeds it events and a small world probe.
import type { BodyId, DestId, ShipId } from "../catalog";

export type Difficulty = "easy" | "normal" | "hard";

/** Where an interactable spot lives. "pad" = spaceport (walker x/z). "surface" = x/z relative to the landed ship, which sits at 0,0. */
export type Spot = {
  scene: "pad" | "surface";
  /** Surface spots only: restrict to one body. Omit to allow any landable body. */
  body?: BodyId;
  x: number;
  z: number;
  /** Prompt shown as "E  <label>" when the player stands on the spot. */
  label: string;
};

/**
 * Params per objective type. To add a new type: add an entry here, then call registerObjective() in objectives.ts.
 * (Interface, so a new type can also be added from another file with declaration merging.)
 */
export interface ObjectiveParamsMap {
  /** Fly within `radius` su of a destination point (optionally slower than `maxSpeed`). */
  reachLocation: { dest: DestId; radius: number; maxSpeed?: number };
  /** Touch down on `body`. With `zone` (a PLANETS zone id) the touchdown must be inside that zone. */
  landAtZone: { body: BodyId; zone?: string };
  /** Pick up `item` by pressing E on the spot. */
  collectItem: { item: string; at: Spot };
  /** Hand over a carried `item` by pressing E on the spot. */
  deliverTo: { item: string; at: Spot };
  /** Accumulate `seconds` while `where` holds (any / in flight / on foot on a surface). */
  surviveTime: { seconds: number; where?: "any" | "flight" | "surface" };
  /** Touch down on Earth. */
  returnToEarth: Record<string, never>;
}
export type ObjectiveType = keyof ObjectiveParamsMap;

export type ObjectiveDef<T extends ObjectiveType = ObjectiveType> = {
  [K in T]: { id: string; type: K; label: string; params: ObjectiveParamsMap[K] };
}[T];

export type Requirements = {
  /** Selected ship needs at least this certified range (su). */
  minRange?: number;
  /** Selected ship must be one of these. */
  ships?: ShipId[];
  /** Campaign mission ids (catalog MISSIONS) that must be done. */
  campaign?: string[];
  /** Contract ids that must be completed first. */
  contracts?: string[];
};

export type ContractReward = {
  credits: number;
  xp?: number;
  /** Contract ids that become eligible for the board (see ContractDef.hidden). */
  unlocks?: string[];
};

export type ContractDef = {
  id: string;
  title: string;
  description: string;
  /** Free tag for grouping and future per-type rules: "delivery", "survey", "rescue", "eva-repair", "comet-chase"... */
  type: string;
  difficulty: Difficulty;
  /** Planet the contract is about (shown on the card). */
  planet: BodyId;
  /** Optional nicer name for the card, e.g. "Tranquil Flats". */
  target?: string;
  /** Seconds at "normal" difficulty. Scaled by DIFFICULTY[difficulty].time. Omit for no timer. */
  timeLimit?: number;
  /** Seconds of EVA oxygen (drains only while on foot on a surface). Scaled like timeLimit. Omit for none. */
  oxygenLimit?: number;
  /** "sequence" (default): one objective at a time, in order. "parallel": all at once, any order. */
  order?: "sequence" | "parallel";
  objectives: ObjectiveDef[];
  reward: ContractReward;
  requirements?: Requirements;
  /** Hidden contracts never appear on the board until another contract lists them in reward.unlocks. */
  hidden?: boolean;
};

// ---- events ---------------------------------------------------------------------------------------

/** Add an event: add it here and emit it from the engine with Spacebound.contractEvent(). */
export interface ContractEventMap {
  landed: { body: BodyId; zone: string | null };
  crash: { body: BodyId };
}
export type ContractEvent = { [K in keyof ContractEventMap]: { type: K } & ContractEventMap[K] }[keyof ContractEventMap];

/** What the engine tells the contracts every frame. Kept tiny on purpose. */
export type WorldProbe = {
  phase: string;
  flying: boolean;
  onFoot: boolean;
  speed: number;
  distToDest: (dest: DestId) => number;
};

// ---- state ----------------------------------------------------------------------------------------

/** Lifecycle of one attempt. "available" and the three end states are what the UI shows; only "active" is stored. */
export type ContractStatus = "available" | "active" | "success" | "failed" | "abandoned";
export type FailReason = "time" | "oxygen" | "crash";

export type ObjState = { done: boolean; value: number; target: number };

export type ActiveContract = {
  id: string;
  objectives: Record<string, ObjState>;
  inventory: Record<string, number>;
  /** Seconds left, null = no timer. */
  timeLeft: number | null;
  oxygenLeft: number | null;
  elapsed: number;
};

export type ContractsSave = {
  completed: string[];
  unlocked: string[];
  board: string[];
  active: ActiveContract | null;
  xp: number;
  stats: { done: number; failed: number; abandoned: number };
  /** Seeds the board draw, bumped on every refresh. */
  nonce: number;
};

export type ContractResult = {
  kind: "success" | "failed";
  id: string;
  title: string;
  reason?: FailReason;
  reward?: { credits: number; xp: number };
  elapsed: number;
  /** Titles of contracts this one unlocked. */
  unlocked: string[];
};

// ---- views for the UI -----------------------------------------------------------------------------

export type Urgency = { level: "ok" | "warn" | "danger"; pulse: boolean };

export type MeterView = { left: number; limit: number; urgency: Urgency };

export type ObjectiveView = { id: string; label: string; done: boolean; current: boolean; progress: string | null };

export type ActiveView = {
  id: string;
  title: string;
  difficulty: Difficulty;
  objectives: ObjectiveView[];
  time: MeterView | null;
  oxygen: MeterView | null;
};

export type BoardCard = {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  planet: BodyId;
  target: string | null;
  reward: { credits: number; xp: number };
  /** Effective limits after the difficulty multiplier, seconds. */
  timeLimit: number | null;
  oxygenLimit: number | null;
  steps: string[];
  status: "available" | "active" | "locked";
  /** Why it is locked, e.g. "Needs 210 su range". */
  lockedReason: string | null;
  completed: boolean;
};

export type SpotView = { key: string; x: number; z: number; label: string; kind: "pickup" | "drop" };

/** What the manager needs from the game to judge eligibility. */
export type ContractCtx = { range: number; ship: ShipId; campaignDone: readonly string[] };

export type ContractsSnap = {
  active: ActiveView | null;
  result: ContractResult | null;
  /** Only filled while the Missions screen is open. */
  board: BoardCard[];
  /** Why a contract cannot be accepted right now (null = fine). */
  acceptBlock: string | null;
  xp: number;
};
