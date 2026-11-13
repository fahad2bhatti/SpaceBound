// contracts-v1: contract state machine, board, timers. Pure TypeScript (no three.js / DOM).
//
//   available --accept--> active --all objectives--> success
//                                \--time / oxygen / crash--> failed
//                                \--player quits--> abandoned
//
// The engine owns the wallet and the world; it feeds this class events (handle), a world probe (tick) and
// interactions (interact), and reacts to the hooks. Everything here lives in one saved slice (ContractsSave).
import { MISSIONS, SHIPS } from "../catalog";
import type { BodyId } from "../catalog";
import { CONTRACTS, DIFFICULTY_ORDER, scaledLimit } from "./data";
import { getHandler, type HandlerCtx } from "./objectives";
import { defaultContractsSave } from "./state";
import type {
  ActiveContract,
  ActiveView,
  BoardCard,
  ContractCtx,
  ContractDef,
  ContractEvent,
  ContractResult,
  ContractsSave,
  FailReason,
  MeterView,
  ObjState,
  SpotView,
  Urgency,
  WorldProbe,
} from "./types";

export type ManagerHooks = {
  /** Current ship / progress, used for requirements. */
  ctx(): ContractCtx;
  /** An objective was completed (label of the objective). */
  onObjective?(label: string): void;
  /** The contract ended in success or failure. The engine pays the reward here. */
  onFinish?(result: ContractResult): void;
  /** Saved state changed; the engine should persist soon. */
  onChange?(): void;
};

/**
 * Colour level for a countdown meter: ok -> warn (yellow) -> danger (red); pulse in the last 30 s.
 * Thresholds scale down for short limits so a 90 s contract is not red from the start.
 */
export function urgency(left: number, limit: number): Urgency {
  const warn = Math.min(150, limit * 0.35);
  const danger = Math.min(60, limit * 0.15);
  const pulse = left <= 30;
  if (pulse || left <= danger) return { level: "danger", pulse };
  if (left <= warn) return { level: "warn", pulse: false };
  return { level: "ok", pulse: false };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Config sanity check. Used by the test script and handy after editing data.ts. Returns a list of problems. */
export function validateContracts(defs: ContractDef[] = CONTRACTS): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) problems.push(`duplicate contract id ${d.id}`);
    ids.add(d.id);
    if (!d.objectives.length) problems.push(`${d.id}: no objectives`);
    const oids = new Set<string>();
    for (const o of d.objectives) {
      if (oids.has(o.id)) problems.push(`${d.id}: duplicate objective id ${o.id}`);
      oids.add(o.id);
      if (!getHandler(o.type)) problems.push(`${d.id}: no handler for objective type ${o.type}`);
    }
  }
  for (const d of defs) {
    for (const u of d.reward.unlocks ?? []) if (!ids.has(u)) problems.push(`${d.id}: unlocks unknown contract ${u}`);
    for (const c of d.requirements?.contracts ?? []) if (!ids.has(c)) problems.push(`${d.id}: requires unknown contract ${c}`);
    for (const m of d.requirements?.campaign ?? []) {
      if (!MISSIONS.some((x) => x.id === m)) problems.push(`${d.id}: requires unknown campaign mission ${m}`);
    }
  }
  return problems;
}

export class ContractManager {
  private slice: ContractsSave = defaultContractsSave();
  /** Bumps whenever the active objective set / spots change. The engine uses it to refresh world markers. */
  rev = 1;
  /** Set when a contract just ended. The UI shows it until dismissResult(). */
  result: ContractResult | null = null;

  private hooks: ManagerHooks;
  private defs: ContractDef[];

  constructor(hooks: ManagerHooks, defs: ContractDef[] = CONTRACTS) {
    this.hooks = hooks;
    this.defs = defs;
  }

  /** Attach the saved slice (call after every load / new game / reset). Repairs it against the current config. */
  bind(slice: ContractsSave): void {
    this.slice = slice;
    this.result = null;
    const a = slice.active;
    if (a) {
      const def = this.def(a.id);
      if (!def) slice.active = null;
      else {
        const fixed: Record<string, ObjState> = {};
        for (const o of def.objectives) fixed[o.id] = a.objectives[o.id] ?? this.initState(o);
        a.objectives = fixed;
      }
    }
    this.slice.board = this.slice.board.filter((id, i, all) => !!this.def(id) && all.indexOf(id) === i);
    this.rev++;
  }

  // ---- lookups -----------------------------------------------------------------------------------

  get data(): ContractsSave {
    return this.slice;
  }

  get activeId(): string | null {
    return this.slice.active?.id ?? null;
  }

  private def(id: string): ContractDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  private activeDef(): ContractDef | null {
    const a = this.slice.active;
    return a ? (this.def(a.id) ?? null) : null;
  }

  private initState(o: ContractDef["objectives"][number]): ObjState {
    const target = Math.max(1, getHandler(o.type)?.target?.(o.params) ?? 1);
    return { done: false, value: 0, target };
  }

  private hctx(def: ContractDef, a: ActiveContract, i: number): HandlerCtx {
    const o = def.objectives[i]!;
    return { params: o.params, state: a.objectives[o.id]!, inventory: a.inventory };
  }

  /** Indices of objectives that currently accept events: first unfinished one (sequence) or all unfinished (parallel). */
  private liveIdx(def: ContractDef, a: ActiveContract): number[] {
    const open: number[] = [];
    def.objectives.forEach((o, i) => {
      if (!a.objectives[o.id]?.done) open.push(i);
    });
    return def.order === "parallel" ? open : open.slice(0, 1);
  }

  // ---- eligibility ---------------------------------------------------------------------------------

  /** Why the contract cannot be taken with the current ship / progress, or null. */
  unmet(def: ContractDef): string | null {
    const r = def.requirements;
    if (!r) return null;
    const ctx = this.hooks.ctx();
    if (r.minRange !== undefined && ctx.range + 0.01 < r.minRange) return `Needs ${r.minRange} su ship range`;
    if (r.ships && !r.ships.includes(ctx.ship)) return `Needs ${r.ships.map((s) => SHIPS[s].name).join(" or ")}`;
    for (const m of r.campaign ?? []) {
      if (!ctx.campaignDone.includes(m)) return `Finish campaign: ${MISSIONS.find((x) => x.id === m)?.name ?? m}`;
    }
    for (const c of r.contracts ?? []) {
      if (!this.slice.completed.includes(c)) return `Complete ${this.def(c)?.title ?? c} first`;
    }
    return null;
  }

  // ---- board ---------------------------------------------------------------------------------------

  private boardEligible(d: ContractDef): boolean {
    return !d.hidden || this.slice.unlocked.includes(d.id);
  }

  /** Draw a fresh board: one contract per difficulty, preferring ones you can take and have not finished. */
  refreshBoard(): void {
    const rnd = mulberry32(this.slice.nonce * 9301 + 49297);
    this.slice.nonce += 1;
    const prev = this.slice.board;
    const board: string[] = [];
    for (const diff of DIFFICULTY_ORDER) {
      const pool = this.defs.filter((d) => d.difficulty === diff && this.boardEligible(d));
      if (!pool.length) continue;
      const tier = (d: ContractDef): number => (this.unmet(d) ? 2 : this.slice.completed.includes(d.id) ? 1 : 0);
      const best = Math.min(...pool.map(tier));
      let cand = pool.filter((d) => tier(d) === best);
      const fresh = cand.filter((d) => !prev.includes(d.id));
      if (fresh.length) cand = fresh;
      board.push(cand[Math.floor(rnd() * cand.length)]!.id);
    }
    this.slice.board = board;
    this.touch();
  }

  /** Keep the board filled (first run, old save, config changed). */
  ensureBoard(): void {
    const have = new Set(this.slice.board.map((id) => this.def(id)?.difficulty));
    const want = new Set(this.defs.filter((d) => this.boardEligible(d)).map((d) => d.difficulty));
    for (const d of want) {
      if (!have.has(d)) {
        this.refreshBoard();
        return;
      }
    }
  }

  boardView(): BoardCard[] {
    this.ensureBoard();
    const cards: BoardCard[] = [];
    for (const id of this.slice.board) {
      const d = this.def(id);
      if (!d) continue;
      const lockedReason = this.slice.active?.id === id ? null : this.unmet(d);
      cards.push({
        id: d.id,
        title: d.title,
        description: d.description,
        difficulty: d.difficulty,
        planet: d.planet,
        target: d.target ?? null,
        reward: { credits: d.reward.credits, xp: d.reward.xp ?? 0 },
        timeLimit: scaledLimit(d, d.timeLimit),
        oxygenLimit: scaledLimit(d, d.oxygenLimit),
        steps: d.objectives.map((o) => o.label),
        status: this.slice.active?.id === id ? "active" : lockedReason ? "locked" : "available",
        lockedReason,
        completed: this.slice.completed.includes(d.id),
      });
    }
    return cards;
  }

  // ---- lifecycle -----------------------------------------------------------------------------------

  /** Start a contract. Returns an error message, or null on success. `retry` skips the "must be on the board" rule. */
  accept(id: string, opts?: { retry?: boolean }): string | null {
    if (this.slice.active) return "Finish or abandon your current contract first.";
    const def = this.def(id);
    if (!def) return "Unknown contract.";
    if (!opts?.retry && !this.slice.board.includes(id)) return "That contract is not on the board.";
    const unmet = this.unmet(def);
    if (unmet) return unmet;
    const objectives: Record<string, ObjState> = {};
    for (const o of def.objectives) objectives[o.id] = this.initState(o);
    this.slice.active = {
      id,
      objectives,
      inventory: {},
      timeLeft: scaledLimit(def, def.timeLimit),
      oxygenLeft: scaledLimit(def, def.oxygenLimit),
      elapsed: 0,
    };
    this.result = null;
    this.touch();
    return null;
  }

  /** Player quits. Returns the title for a toast, or null if nothing was active. */
  abandon(): string | null {
    const def = this.activeDef();
    if (!this.slice.active) return null;
    this.slice.active = null;
    this.slice.stats.abandoned += 1;
    this.touch();
    return def?.title ?? "Contract";
  }

  dismissResult(): void {
    if (!this.result) return;
    this.result = null;
    this.hooks.onChange?.();
  }

  private fail(reason: FailReason): void {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a) return;
    this.slice.active = null;
    this.slice.stats.failed += 1;
    this.result = { kind: "failed", id: def.id, title: def.title, reason, type: def.type, crewSaved: a.inventory.crew ?? 0, elapsed: a.elapsed, unlocked: [] };
    this.touch();
    this.hooks.onFinish?.(this.result);
  }

  private succeed(): void {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a) return;
    this.slice.active = null;
    if (!this.slice.completed.includes(def.id)) this.slice.completed.push(def.id);
    const unlockedTitles: string[] = [];
    for (const u of def.reward.unlocks ?? []) {
      const target = this.def(u);
      if (target && !this.slice.unlocked.includes(u)) {
        this.slice.unlocked.push(u);
        unlockedTitles.push(target.title);
      }
    }
    const crewSaved = a.inventory.crew ?? 0;
    const credits = def.reward.credits + crewSaved * (def.reward.crewBonus?.credits ?? 0);
    const xp = (def.reward.xp ?? 0) + crewSaved * (def.reward.crewBonus?.xp ?? 0);
    this.slice.xp += xp;
    this.slice.stats.done += 1;
    this.result = {
      kind: "success",
      id: def.id,
      title: def.title,
      reward: { credits, xp },
      type: def.type,
      crewSaved,
      elapsed: a.elapsed,
      unlocked: unlockedTitles,
    };
    this.refreshBoard();
    this.hooks.onFinish?.(this.result);
  }

  private touch(): void {
    this.rev++;
    this.hooks.onChange?.();
  }

  // ---- runtime -------------------------------------------------------------------------------------

  /** Close out an objective that just flipped to done. Returns true if the whole contract ended. */
  private settle(def: ContractDef, a: ActiveContract, idx: number, wasDone: boolean): boolean {
    const o = def.objectives[idx]!;
    if (wasDone || !a.objectives[o.id]!.done) return false;
    this.rev++;
    this.hooks.onObjective?.(o.label);
    this.hooks.onChange?.();
    if (def.objectives.every((x) => a.objectives[x.id]?.done)) {
      this.succeed();
      return true;
    }
    return false;
  }

  /** Per-frame update while the game is simulating. Handles the timer, oxygen and tick-driven objectives. */
  tick(dt: number, w: WorldProbe): void {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a || this.result) return;
    a.elapsed += dt;
    if (a.timeLeft !== null) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        a.timeLeft = 0;
        this.fail("time");
        return;
      }
    }
    if (a.oxygenLeft !== null && w.onFoot) {
      a.oxygenLeft -= dt;
      if (a.oxygenLeft <= 0) {
        a.oxygenLeft = 0;
        this.fail("oxygen");
        return;
      }
    }
    for (const i of this.liveIdx(def, a)) {
      const h = getHandler(def.objectives[i]!.type);
      if (!h?.onTick) continue;
      const c = this.hctx(def, a, i);
      const was = c.state.done;
      h.onTick(dt, w, c);
      if (this.settle(def, a, i, was)) return;
    }
  }

  /** A game event (landing, crash, ...). A crash ends the contract; everything else is offered to live objectives. */
  handle(ev: ContractEvent): void {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a || this.result) return;
    if (ev.type === "crash") {
      this.fail("crash");
      return;
    }
    for (const i of this.liveIdx(def, a)) {
      const h = getHandler(def.objectives[i]!.type);
      if (!h?.onEvent) continue;
      const c = this.hctx(def, a, i);
      const was = c.state.done;
      h.onEvent(ev, c);
      if (this.settle(def, a, i, was)) return;
    }
  }

  /** Interactable spots for the scene the player is in. `body` = surface body, or null on the pad. */
  spots(scene: "pad" | "surface", body: BodyId | null): SpotView[] {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a || this.result) return [];
    const out: SpotView[] = [];
    for (const i of this.liveIdx(def, a)) {
      const info = getHandler(def.objectives[i]!.type)?.spot?.(this.hctx(def, a, i));
      if (!info || info.spot.scene !== scene) continue;
      if (scene === "surface" && info.spot.body && info.spot.body !== body) continue;
      out.push({ key: def.objectives[i]!.id, x: info.spot.x, z: info.spot.z, label: info.spot.label, kind: info.kind, icon: info.icon });
    }
    return out;
  }

  /** E pressed on a spot (key from spots()). Returns true if something happened. */
  interact(key: string): boolean {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a || this.result) return false;
    for (const i of this.liveIdx(def, a)) {
      if (def.objectives[i]!.id !== key) continue;
      const h = getHandler(def.objectives[i]!.type);
      if (!h?.interact) return false;
      const c = this.hctx(def, a, i);
      const was = c.state.done;
      if (!h.interact(c)) return false;
      this.settle(def, a, i, was);
      return true;
    }
    return false;
  }

  /** Landing-zone ids the HUD should reveal for the current objectives. */
  hintZones(): string[] {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a) return [];
    const out: string[] = [];
    for (const i of this.liveIdx(def, a)) {
      const z = getHandler(def.objectives[i]!.type)?.hintZone?.(this.hctx(def, a, i));
      if (z) out.push(z);
    }
    return out;
  }

  // ---- views ---------------------------------------------------------------------------------------

  private meter(left: number | null, base: number | undefined, def: ContractDef): MeterView | null {
    if (left === null) return null;
    const limit = scaledLimit(def, base) ?? Math.max(1, left);
    return { left, limit, urgency: urgency(left, limit) };
  }

  activeView(): ActiveView | null {
    const def = this.activeDef();
    const a = this.slice.active;
    if (!def || !a) return null;
    const live = this.liveIdx(def, a);
    return {
      id: def.id,
      title: def.title,
      type: def.type,
      difficulty: def.difficulty,
      objectives: def.objectives.map((o, i) => {
        const h = getHandler(o.type);
        const st = a.objectives[o.id]!;
        return {
          id: o.id,
          label: o.label,
          done: st.done,
          current: live.includes(i),
          progress: !st.done && h?.progress ? h.progress({ params: o.params, state: st, inventory: a.inventory }) : null,
        };
      }),
      time: this.meter(a.timeLeft, def.timeLimit, def),
      oxygen: this.meter(a.oxygenLeft, def.oxygenLimit, def),
    };
  }
}
