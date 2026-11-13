// contracts-v1: default + tolerant loader for the contracts slice of the save.
import type { ActiveContract, ContractsSave, ObjState } from "./types";

export function defaultContractsSave(): ContractsSave {
  return {
    completed: [],
    unlocked: [],
    board: [],
    active: null,
    xp: 0,
    stats: { done: 0, failed: 0, abandoned: 0 },
    nonce: 1,
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function finite(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function nullableNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sanitizeActive(raw: unknown): ActiveContract | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ActiveContract>;
  if (typeof r.id !== "string") return null;
  const objectives: Record<string, ObjState> = {};
  if (r.objectives && typeof r.objectives === "object") {
    for (const [k, v] of Object.entries(r.objectives)) {
      if (!v || typeof v !== "object") continue;
      const s = v as Partial<ObjState>;
      objectives[k] = { done: s.done === true, value: finite(s.value, 0), target: Math.max(1, finite(s.target, 1)) };
    }
  }
  const inventory: Record<string, number> = {};
  if (r.inventory && typeof r.inventory === "object") {
    for (const [k, v] of Object.entries(r.inventory)) {
      const n = finite(v, 0);
      if (n > 0) inventory[k] = Math.floor(n);
    }
  }
  return {
    id: r.id,
    objectives,
    inventory,
    timeLeft: nullableNum(r.timeLeft),
    oxygenLeft: nullableNum(r.oxygenLeft),
    elapsed: Math.max(0, finite(r.elapsed, 0)),
  };
}

/** Old saves (no contracts at all) and damaged saves both come back as a valid slice. */
export function sanitizeContracts(raw: unknown): ContractsSave {
  const base = defaultContractsSave();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ContractsSave>;
  return {
    completed: strings(r.completed),
    unlocked: strings(r.unlocked),
    board: strings(r.board).slice(0, 3),
    active: sanitizeActive(r.active),
    xp: Math.max(0, Math.round(finite(r.xp, 0))),
    stats: {
      done: Math.max(0, Math.round(finite(r.stats?.done, 0))),
      failed: Math.max(0, Math.round(finite(r.stats?.failed, 0))),
      abandoned: Math.max(0, Math.round(finite(r.stats?.abandoned, 0))),
    },
    nonce: Math.max(1, Math.round(finite(r.nonce, 1))),
  };
}
