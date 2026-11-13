// contracts-v1: objective handlers. One handler per objective type, registered by name.
// To add a type: (1) add its params to ObjectiveParamsMap in types.ts, (2) registerObjective() it below.
// A handler never touches the engine: it reads events / the world probe and updates its own ObjState.
import type { ContractEvent, ObjectiveParamsMap, ObjectiveType, ObjState, Spot, WorldProbe } from "./types";

export type HandlerCtx<K extends ObjectiveType = ObjectiveType> = {
  params: ObjectiveParamsMap[K];
  state: ObjState;
  /** Items the player carries for this contract. Shared by all its objectives. */
  inventory: Record<string, number>;
};

export type SpotInfo = { spot: Spot; kind: "pickup" | "drop"; /** Marker look. Omit for the default crate / beacon. */ icon?: "crew" };

// Method syntax on purpose: it keeps handlers for one type assignable to the registry's wide type.
export interface ObjectiveHandler<K extends ObjectiveType = ObjectiveType> {
  /** Progress goal (default 1). */
  target?(params: ObjectiveParamsMap[K]): number;
  /** A game event happened (landing, crash, ...). Only called while the objective is active. */
  onEvent?(ev: ContractEvent, c: HandlerCtx<K>): void;
  /** Called every simulated frame while the objective is active. */
  onTick?(dt: number, w: WorldProbe, c: HandlerCtx<K>): void;
  /** An interactable spot the engine should mark and offer E on. */
  spot?(c: HandlerCtx<K>): SpotInfo | null;
  /** The player pressed E on this objective's spot. Return true if it was used. */
  interact?(c: HandlerCtx<K>): boolean;
  /** Short progress text for the checklist, e.g. "12 / 30 s". */
  progress?(c: HandlerCtx<K>): string | null;
  /** A landing-zone id (planets.ts) the game should reveal on the HUD while this objective is current. */
  hintZone?(c: HandlerCtx<K>): string | null;
}

const registry = new Map<ObjectiveType, ObjectiveHandler>();

export function registerObjective<K extends ObjectiveType>(type: K, handler: ObjectiveHandler<K>): void {
  registry.set(type, handler as unknown as ObjectiveHandler);
}

export function getHandler(type: string): ObjectiveHandler | undefined {
  return registry.get(type as ObjectiveType);
}

function complete(c: { state: ObjState }): void {
  c.state.done = true;
  c.state.value = c.state.target;
}

registerObjective("reachLocation", {
  onTick(_dt, w, c) {
    if (!w.flying) return;
    const p = c.params as ObjectiveParamsMap["reachLocation"];
    if (w.distToDest(p.dest) > p.radius) return;
    if (p.maxSpeed !== undefined && w.speed > p.maxSpeed) return;
    complete(c);
  },
});

registerObjective("landAtZone", {
  onEvent(ev, c) {
    if (ev.type !== "landed") return;
    const p = c.params as ObjectiveParamsMap["landAtZone"];
    if (ev.body !== p.body) return;
    if (p.zone !== undefined && ev.zone !== p.zone) return;
    complete(c);
  },
  hintZone(c) {
    return c.state.done ? null : ((c.params as ObjectiveParamsMap["landAtZone"]).zone ?? null);
  },
});

registerObjective("collectItem", {
  spot(c) {
    if (c.state.done) return null;
    return { spot: (c.params as ObjectiveParamsMap["collectItem"]).at, kind: "pickup" };
  },
  interact(c) {
    if (c.state.done) return false;
    const p = c.params as ObjectiveParamsMap["collectItem"];
    c.inventory[p.item] = (c.inventory[p.item] ?? 0) + 1;
    complete(c);
    return true;
  },
});

registerObjective("deliverTo", {
  spot(c) {
    const p = c.params as ObjectiveParamsMap["deliverTo"];
    if (c.state.done || (c.inventory[p.item] ?? 0) < 1) return null;
    return { spot: p.at, kind: "drop" };
  },
  interact(c) {
    const p = c.params as ObjectiveParamsMap["deliverTo"];
    if (c.state.done || (c.inventory[p.item] ?? 0) < 1) return false;
    c.inventory[p.item] = (c.inventory[p.item] ?? 0) - 1;
    complete(c);
    return true;
  },
});

registerObjective("surviveTime", {
  target(p) {
    return Math.max(1, (p as ObjectiveParamsMap["surviveTime"]).seconds);
  },
  onTick(dt, w, c) {
    const p = c.params as ObjectiveParamsMap["surviveTime"];
    const where = p.where ?? "any";
    if (where === "flight" && !w.flying) return;
    if (where === "surface" && !w.onFoot) return;
    c.state.value = Math.min(c.state.target, c.state.value + dt);
    if (c.state.value >= c.state.target) complete(c);
  },
  progress(c) {
    return `${Math.floor(c.state.value)} / ${Math.round(c.state.target)} s`;
  },
});

// Crew stand in a short row around `at` (spacing CREW_GAP m, along z). Only the next one is marked, so one E = one rescue.
const CREW_GAP = 3.5;
const crewCount = (p: ObjectiveParamsMap["rescueCrew"]): number => Math.min(3, Math.max(1, Math.round(p.count)));

registerObjective("rescueCrew", {
  target(p) {
    return crewCount(p as ObjectiveParamsMap["rescueCrew"]);
  },
  spot(c) {
    if (c.state.done) return null;
    const p = c.params as ObjectiveParamsMap["rescueCrew"];
    const n = crewCount(p);
    const i = Math.min(n - 1, Math.floor(c.state.value));
    const z = p.at.z + (i - (n - 1) / 2) * CREW_GAP;
    return { spot: { ...p.at, z, label: p.label ?? p.at.label }, kind: "pickup", icon: "crew" };
  },
  interact(c) {
    if (c.state.done) return false;
    c.inventory.crew = (c.inventory.crew ?? 0) + 1;
    c.state.value = Math.min(c.state.target, c.state.value + 1);
    if (c.state.value >= c.state.target) complete(c);
    return true;
  },
  progress(c) {
    return `${Math.floor(c.state.value)} / ${Math.round(c.state.target)}`;
  },
});

registerObjective("returnToEarth", {
  onEvent(ev, c) {
    if (ev.type === "landed" && ev.body === "earth") complete(c);
  },
});
