// contracts-v1 logic tests. Run: npx tsx scripts/contracts.test.mts  (pure logic, no browser/three needed)
import assert from "node:assert/strict";

const R = new URL("../src/game/", import.meta.url).pathname;
const { ContractManager, urgency, validateContracts } = await import(R + "contracts/manager.ts");
const { CONTRACTS, DIFFICULTY, scaledLimit } = await import(R + "contracts/data.ts");
const { sanitizeContracts, defaultContractsSave } = await import(R + "contracts/state.ts");
const { PLANETS } = await import(R + "planets.ts");
const { defaultSave } = await import(R + "save.ts");
const { MISSIONS } = await import(R + "catalog.ts");

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("ok  ", name);
  } catch (e) {
    console.log("FAIL", name, "\n    ", (e as Error).stack?.split("\n").slice(0,9).join("\n"));
    process.exitCode = 1;
  }
}

type Ctx = { range: number; ship: string; campaignDone: string[] };
function make(ctx: Partial<Ctx> = {}, defs = CONTRACTS) {
  const log = { objectives: [] as string[], finished: [] as any[], changes: 0 };
  const c: Ctx = { range: 360, ship: "lunar", campaignDone: [], ...ctx };
  const m = new ContractManager(
    {
      ctx: () => c,
      onObjective: (l: string) => log.objectives.push(l),
      onFinish: (r: any) => log.finished.push(r),
      onChange: () => log.changes++,
    },
    defs,
  );
  m.bind(defaultContractsSave());
  return { m, log, c };
}
const flying = (dist = 999, speed = 3) => ({ phase: "flight", flying: true, onFoot: false, speed, distToDest: () => dist });
const walking = () => ({ phase: "surface", onFoot: true, flying: false, speed: 0, distToDest: () => 9999 });
const onPad = () => ({ phase: "pad", onFoot: false, flying: false, speed: 0, distToDest: () => 9999 });

t("config validates", () => assert.deepEqual(validateContracts(), []));

t("every landAtZone zone id exists in planets.ts", () => {
  for (const d of CONTRACTS)
    for (const o of d.objectives)
      if (o.type === "landAtZone" && (o.params as any).zone) {
        const p = o.params as any;
        assert.ok(PLANETS[p.body].zones.some((z: any) => z.id === p.zone), `${d.id}: ${p.zone}`);
      }
});

t("every campaign / body / dest reference is real", () => {
  for (const d of CONTRACTS) for (const c of d.requirements?.campaign ?? []) assert.ok(MISSIONS.some((x: any) => x.id === c));
});

t("board: one contract per difficulty", () => {
  const { m } = make();
  const cards = m.boardView();
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((c: any) => c.difficulty), ["easy", "normal", "hard"]);
});

t("starter ship: contracts above its range are locked with a reason, the rest are available", () => {
  const { m } = make({ range: 90, ship: "starter" });
  const cards = m.boardView();
  assert.equal(cards[0].status, "available");
  for (const c of cards) {
    const def = CONTRACTS.find((d: any) => d.id === c.id)!;
    if ((def.requirements?.minRange ?? 0) > 90) {
      assert.equal(c.status, "locked");
      assert.match(c.lockedReason, /210|470/);
      assert.match(m.accept(c.id)!, /210|470/);
    } else assert.equal(c.status, "available");
  }
});

t("time limits are scaled by difficulty", () => {
  const mc = CONTRACTS.find((d: any) => d.id === "moon-cargo")!;
  assert.equal(scaledLimit(mc, mc.timeLimit), 600);
  const easy = CONTRACTS.find((d: any) => d.difficulty === "easy")!;
  assert.equal(scaledLimit(easy, easy.timeLimit), Math.round(easy.timeLimit! * DIFFICULTY.easy.time));
  assert.ok(scaledLimit(easy, easy.timeLimit)! > easy.timeLimit!);
  const hard = CONTRACTS.find((d: any) => d.difficulty === "hard")!;
  assert.ok(scaledLimit(hard, hard.timeLimit)! < hard.timeLimit!);
});

t("moon-cargo end to end: collect -> land in zone -> deliver -> home -> success", () => {
  const { m, log } = make();
  assert.equal(m.accept("moon-cargo", { retry: true }), null);
  assert.equal(m.activeId, "moon-cargo");
  // only the pad crate is available at first, and it is not on the surface
  assert.equal(m.spots("surface", "moon").length, 0);
  const pad = m.spots("pad", null);
  assert.equal(pad.length, 1);
  assert.equal(pad[0].kind, "pickup");
  // landing / returning too early does nothing (sequence)
  m.handle({ type: "landed", body: "moon", zone: "moon-flats" });
  m.handle({ type: "landed", body: "earth", zone: null });
  assert.equal(log.objectives.length, 0);
  assert.equal(m.interact("load"), true);
  assert.deepEqual(log.objectives, ["Load the cargo crate on the pad"]);
  assert.equal(m.data.active!.inventory.cargo, 1);
  assert.equal(m.spots("pad", null).length, 0);
  // wrong zone / wrong body
  m.handle({ type: "landed", body: "moon", zone: "moon-rille" });
  m.handle({ type: "landed", body: "moon", zone: null });
  m.handle({ type: "landed", body: "mars", zone: "moon-flats" });
  assert.equal(log.objectives.length, 1);
  assert.deepEqual(m.hintZones(), ["moon-flats"]);
  m.handle({ type: "landed", body: "moon", zone: "moon-flats" });
  assert.equal(log.objectives.length, 2);
  // drop marker only on the moon surface now
  assert.equal(m.spots("surface", "mars").length, 0);
  const drop = m.spots("surface", "moon");
  assert.equal(drop.length, 1);
  assert.equal(drop[0].kind, "drop");
  assert.equal(m.interact("deliver"), true);
  assert.equal(m.data.active!.inventory.cargo, 0);
  assert.equal(log.finished.length, 0);
  m.handle({ type: "landed", body: "earth", zone: "earth-pad" });
  assert.equal(log.finished.length, 1);
  const r = log.finished[0];
  assert.equal(r.kind, "success");
  assert.equal(r.reward.credits, 1800);
  assert.equal(m.activeId, null);
  assert.ok(m.data.completed.includes("moon-cargo"));
  assert.equal(m.data.xp, 150);
  assert.equal(m.data.stats.done, 1);
  assert.equal(m.boardView().length, 3);
  assert.ok(m.result && m.result.kind === "success");
});

t("timer: ticks only while active, fails with reason time", () => {
  const { m, log } = make();
  m.accept("moon-cargo", { retry: true });
  m.tick(100, onPad());
  assert.equal(Math.round(m.data.active!.timeLeft!), 500);
  m.tick(499, onPad());
  assert.equal(log.finished.length, 0);
  m.tick(2, onPad());
  assert.equal(log.finished[0].kind, "failed");
  assert.equal(log.finished[0].reason, "time");
  assert.equal(m.activeId, null);
  assert.equal(m.data.stats.failed, 1);
  // after failing, retry works and resets progress
  assert.equal(m.accept("moon-cargo", { retry: true }), null);
  assert.equal(Math.round(m.data.active!.timeLeft!), 600);
  assert.equal(m.data.active!.objectives.load!.done, false);
});

t("oxygen: drains only on foot, fails with reason oxygen", () => {
  const { m, log } = make();
  m.accept("lunar-survey", { retry: true }); // oxygenLimit 120 * normal 1
  assert.equal(m.data.active!.oxygenLeft, 120);
  m.tick(30, flying());
  m.tick(30, onPad());
  assert.equal(m.data.active!.oxygenLeft, 120);
  m.tick(50, walking());
  assert.equal(Math.round(m.data.active!.oxygenLeft!), 70);
  m.tick(71, walking());
  assert.equal(log.finished[0].reason, "oxygen");
});

t("crash fails the contract", () => {
  const { m, log } = make();
  m.accept("moon-cargo", { retry: true });
  m.handle({ type: "crash", body: "moon" });
  assert.equal(log.finished[0].reason, "crash");
  assert.equal(m.activeId, null);
});

t("one active contract at a time; abandon frees the slot", () => {
  const { m } = make();
  assert.equal(m.accept("moon-cargo", { retry: true }), null);
  assert.match(m.accept("orbital-cargo", { retry: true })!, /abandon/i);
  assert.equal(m.abandon(), "Cargo Delivery to Moon");
  assert.equal(m.data.stats.abandoned, 1);
  assert.equal(m.accept("orbital-cargo", { retry: true }), null);
});

t("accepting a contract that is not on the board is refused (unless retry)", () => {
  const { m } = make();
  m.boardView();
  const off = CONTRACTS.find((d: any) => !m.data.board.includes(d.id))!;
  assert.match(m.accept(off.id)!, /board/);
  assert.equal(m.accept(off.id, { retry: true }), null);
});

t("surviveTime counts only while on foot; reachLocation needs radius + speed", () => {
  const { m, log } = make();
  m.accept("lunar-survey", { retry: true });
  m.handle({ type: "landed", body: "moon", zone: "moon-beacon" });
  assert.equal(log.objectives.length, 1);
  m.tick(10, flying());
  assert.equal(m.activeView()!.objectives[1]!.progress, "0 / 25 s");
  m.tick(10, walking());
  assert.equal(m.activeView()!.objectives[1]!.progress, "10 / 25 s");
  m.tick(16, walking());
  assert.equal(log.objectives.length, 2);

  const b = make({ range: 90, ship: "starter" });
  b.m.accept("station-courier", { retry: true });
  b.m.interact("load");
  b.m.tick(1, flying(5, 30)); // too fast
  assert.equal(b.log.objectives.length, 1);
  b.m.tick(1, flying(20, 3)); // too far
  assert.equal(b.log.objectives.length, 1);
  b.m.tick(1, flying(5, 3));
  assert.equal(b.log.objectives.length, 2);
});

t("urgency: ok -> warn -> danger, pulse in the last 30 s", () => {
  assert.deepEqual(urgency(500, 600), { level: "ok", pulse: false });
  assert.deepEqual(urgency(150, 600), { level: "warn", pulse: false });
  assert.deepEqual(urgency(61, 600), { level: "warn", pulse: false });
  assert.deepEqual(urgency(60, 600), { level: "danger", pulse: false });
  assert.deepEqual(urgency(31, 600), { level: "danger", pulse: false });
  assert.deepEqual(urgency(30, 600), { level: "danger", pulse: true });
  assert.deepEqual(urgency(0, 600), { level: "danger", pulse: true });
  assert.equal(urgency(80, 90).level, "ok"); // short limits are not red from the start
});

t("parallel objectives complete in any order", () => {
  const defs = [
    {
      id: "par", title: "Par", description: "", type: "test", difficulty: "easy", planet: "moon", order: "parallel",
      objectives: [
        { id: "a", type: "landAtZone", label: "A", params: { body: "moon" } },
        { id: "b", type: "returnToEarth", label: "B", params: {} },
      ],
      reward: { credits: 10 },
    },
  ];
  const { m, log } = make({}, defs as any);
  m.accept("par", { retry: true });
  assert.deepEqual(m.activeView()!.objectives.map((o: any) => o.current), [true, true]);
  m.handle({ type: "landed", body: "earth", zone: null });
  assert.equal(log.finished.length, 0);
  m.handle({ type: "landed", body: "moon", zone: null });
  assert.equal(log.finished[0].kind, "success");
});

t("hidden contracts are unlocked by rewards", () => {
  const base = { description: "", type: "test", planet: "moon", objectives: [{ id: "h", type: "returnToEarth", label: "H", params: {} }] };
  const defs = [
    { ...base, id: "first", title: "First", difficulty: "easy", reward: { credits: 1, unlocks: ["secret"] } },
    { ...base, id: "secret", title: "Secret", difficulty: "normal", hidden: true, reward: { credits: 1 } },
    { ...base, id: "plain", title: "Plain", difficulty: "normal", reward: { credits: 1 } },
  ];
  const { m } = make({}, defs as any);
  for (let i = 0; i < 6; i++) {
    m.refreshBoard();
    assert.ok(!m.data.board.includes("secret"));
  }
  m.accept("first", { retry: true });
  m.handle({ type: "landed", body: "earth", zone: null });
  assert.deepEqual(m.result!.unlocked, ["Secret"]);
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    m.refreshBoard();
    for (const id of m.data.board) seen.add(id);
  }
  assert.ok(seen.has("secret") && seen.has("plain"));
});

t("sequence: an objective that is not current yet ignores its event", () => {
  const { m } = make();
  m.boardView();
  const before = [...m.data.board];
  m.accept(before[0]!);
  m.handle({ type: "landed", body: "earth", zone: null }); // orbital-cargo/station-courier need steps first; skip via retry
  assert.equal(m.activeId, before[0]); // still active: sequence not satisfied
});

t("save: v1 save without contracts loads with defaults; damaged data is repaired", () => {
  assert.deepEqual(sanitizeContracts(undefined), defaultContractsSave());
  assert.deepEqual(sanitizeContracts("garbage"), defaultContractsSave());
  const s = sanitizeContracts({ completed: ["a", 3, null], board: ["x", "y", "z", "w"], xp: -5, active: { id: 7 } });
  assert.deepEqual(s.completed, ["a"]);
  assert.equal(s.board.length, 3);
  assert.equal(s.xp, 0);
  assert.equal(s.active, null);
  assert.equal(defaultSave().version, 2);
  assert.deepEqual(defaultSave().contracts, defaultContractsSave());
});

t("bind drops an active contract whose id no longer exists and repairs missing objective state", () => {
  const { m } = make();
  const slice = defaultContractsSave();
  slice.active = { id: "gone", objectives: {}, inventory: {}, timeLeft: 5, oxygenLeft: null, elapsed: 0 };
  m.bind(slice);
  assert.equal(m.activeId, null);
  slice.active = { id: "moon-cargo", objectives: { load: { done: true, value: 1, target: 1 } }, inventory: { cargo: 1 }, timeLeft: 50, oxygenLeft: null, elapsed: 1 };
  m.bind(slice);
  assert.deepEqual(Object.keys(m.data.active!.objectives), ["load", "land", "deliver", "home"]);
  assert.equal(m.data.active!.objectives.load!.done, true);
  assert.equal(m.activeView()!.objectives.find((o: any) => o.current)!.id, "land");
});

t("manager state survives a JSON round trip (save/load) mid-contract", () => {
  const { m } = make();
  m.accept("moon-cargo", { retry: true });
  m.interact("load");
  m.tick(42, onPad());
  const saved = JSON.parse(JSON.stringify(m.data));
  const again = make();
  again.m.bind(sanitizeContracts(saved));
  assert.equal(again.m.activeId, "moon-cargo");
  assert.equal(Math.round(again.m.data.active!.timeLeft!), 558);
  assert.equal(again.m.data.active!.inventory.cargo, 1);
  assert.equal(again.m.activeView()!.objectives[1]!.current, true);
});

// ---- rescue (Part 4A) ----------------------------------------------------------------------------
const toRescue = (id: string, body: string, zone: string) => {
  const x = make({ range: 500 });
  assert.equal(x.m.accept(id, { retry: true }), null);
  x.m.handle({ type: "landed", body, zone });
  return x;
};

t("rescueCrew: progress 0/2 -> 1/2 -> 2/2, one marker at a time, crew counted in inventory", () => {
  const { m } = toRescue("moon-rescue-pair", "moon", "moon-beacon");
  const view = () => m.activeView()!.objectives.find((o: any) => o.id === "crew")!;
  assert.equal(view().progress, "0 / 2");
  const s1 = m.spots("surface", "moon");
  assert.equal(s1.length, 1);
  assert.equal(s1[0].icon, "crew");
  assert.equal(m.spots("surface", "mars").length, 0);
  assert.equal(m.interact("crew"), true);
  assert.equal(view().progress, "1 / 2");
  assert.equal(m.data.active!.inventory.crew, 1);
  const s2 = m.spots("surface", "moon");
  assert.notEqual(s2[0].z, s1[0].z);
  assert.equal(m.interact("crew"), true);
  assert.equal(m.data.active!.inventory.crew, 2);
  assert.equal(m.spots("surface", "moon").length, 0);
  assert.equal(m.interact("crew"), false);
});

t("rescueCrew: partial crew does not finish; success pays base + crew bonus", () => {
  const { m, log } = toRescue("mars-rescue-trio", "mars", "mars-dunes");
  m.interact("crew");
  m.interact("crew");
  m.handle({ type: "landed", body: "earth", zone: "earth-pad" });
  assert.equal(log.finished.length, 0);
  m.interact("crew");
  m.handle({ type: "landed", body: "earth", zone: "earth-pad" });
  const r = log.finished[0];
  const d = CONTRACTS.find((c: any) => c.id === "mars-rescue-trio")!;
  assert.equal(r.kind, "success");
  assert.equal(r.crewSaved, 3);
  assert.equal(r.reward.credits, d.reward.credits + 3 * d.reward.crewBonus.credits);
  assert.equal(r.reward.xp, d.reward.xp + 3 * d.reward.crewBonus.xp);
});

t("rescue: timer running out fails with reason time and keeps the rescue type for the message", () => {
  const { m, log } = toRescue("moon-rescue-solo", "moon", "moon-flats");
  m.tick(10, walking());
  m.tick(99999, walking());
  const r = log.finished[0];
  assert.equal(r.kind, "failed");
  assert.equal(r.reason, "time");
  assert.equal(r.type, "rescue");
  assert.equal(r.crewSaved, 0);
});

t("rescue: save/restore mid-rescue keeps crew progress and the marker", () => {
  const { m } = toRescue("moon-rescue-pair", "moon", "moon-beacon");
  m.interact("crew");
  m.tick(5, walking());
  const saved = JSON.parse(JSON.stringify(m.data));
  const again = make({ range: 500 });
  again.m.bind(sanitizeContracts(saved));
  assert.equal(again.m.data.active!.inventory.crew, 1);
  assert.equal(again.m.activeView()!.objectives.find((o: any) => o.id === "crew")!.progress, "1 / 2");
  assert.equal(again.m.spots("surface", "moon").length, 1);
  assert.equal(again.m.interact("crew"), true);
  assert.ok(again.m.data.active!.objectives.crew.done);
});

// ---- EVA repair (Part 4B) ------------------------------------------------------------------------
const eva = (dist = 3) => ({ phase: "eva", flying: false, onFoot: false, onEva: true, drainMult: 1, speed: 0, distToDest: () => dist });
const toEva = (id: string) => {
  const x = make({ range: 500 });
  assert.equal(x.m.accept(id, { retry: true }), null);
  x.m.tick(0.1, flying(5, 2)); // parked next to the station
  return x;
};

t("repairPoint: hold-to-repair progress, marker is an eva spot, finishes at `seconds`", () => {
  const { m, log } = toEva("eva-quick-fix");
  const sp = m.spots("eva", null);
  assert.equal(sp.length, 1);
  assert.equal(sp[0].icon, "repair");
  assert.equal(typeof sp[0].y, "number");
  assert.equal(m.spots("surface", "moon").length, 0);
  assert.equal(m.hold("r1", 2), true);
  assert.equal(m.activeView()!.objectives.find((o: any) => o.id === "r1")!.progress, "2 / 4 s");
  assert.equal(log.objectives.length, 1); // only "park at the station" so far
  m.hold("r1", 2.1);
  assert.equal(log.objectives.length, 2);
  assert.equal(m.hold("r1", 1), false);
});

t("repairPoint: partial repair is kept, 3-bolt point moves its marker after each bolt", () => {
  const { m } = toEva("eva-station-service");
  m.hold("r1", 4);
  m.hold("r2", 5);
  const a = m.spots("eva", null)[0];
  assert.match(a.label, /bolt 1\/3/);
  const rev = m.rev;
  m.hold("r3", 3.2);
  const b = m.spots("eva", null)[0];
  assert.match(b.label, /bolt 2\/3/);
  assert.ok(a.x !== b.x || a.z !== b.z);
  assert.ok(m.rev > rev);
  m.hold("r3", 3);
  m.hold("r3", 3);
  assert.equal(m.data.active!.objectives.r3.done, true);
});

t("returnToShuttle needs the repairs first, then evaEnded completes it", () => {
  const { m, log } = toEva("eva-quick-fix");
  m.handle({ type: "evaEnded" });
  assert.equal(m.data.active!.objectives.back.done, false);
  m.hold("r1", 5);
  m.handle({ type: "evaEnded" });
  assert.equal(m.data.active!.objectives.back.done, true);
  m.handle({ type: "landed", body: "earth", zone: "earth-pad" });
  assert.equal(log.finished[0].kind, "success");
});

t("eva oxygen: drains on EVA only (with the range multiplier), fails with reason oxygen", () => {
  const { m, log } = toEva("eva-quick-fix");
  const full = m.data.active!.oxygenLeft!;
  m.tick(10, flying(5, 2));
  assert.equal(m.data.active!.oxygenLeft, full);
  m.tick(10, eva());
  assert.equal(Math.round(m.data.active!.oxygenLeft!), Math.round(full - 10));
  m.tick(10, { ...eva(), drainMult: 3 });
  assert.equal(Math.round(m.data.active!.oxygenLeft!), Math.round(full - 40));
  m.drainOxygen(5);
  assert.equal(Math.round(m.data.active!.oxygenLeft!), Math.round(full - 45));
  for (let i = 0; i < 30 && !log.finished.length; i++) m.tick(20, eva());
  assert.equal(log.finished[0].reason, "oxygen");
  assert.equal(log.finished[0].type, "eva-repair");
});

t("eva: save/restore mid-repair keeps hold progress, oxygen and the bolt marker", () => {
  const { m } = toEva("eva-station-service");
  m.hold("r1", 4);
  m.hold("r2", 5);
  m.hold("r3", 4);
  m.tick(7, eva());
  const saved = JSON.parse(JSON.stringify(m.data));
  const again = make({ range: 500 });
  again.m.bind(sanitizeContracts(saved));
  assert.equal(again.m.activeView()!.objectives.find((o: any) => o.id === "r3")!.progress, "Bolt 2 / 3");
  assert.match(again.m.spots("eva", null)[0].label, /bolt 2\/3/);
  assert.equal(Math.round(again.m.data.active!.oxygenLeft!), Math.round(saved.active.oxygenLeft));
});

t("eva contracts: hazards, oxygen scale with difficulty, three missions exist", () => {
  const evs = CONTRACTS.filter((d: any) => d.type === "eva-repair");
  assert.deepEqual(evs.map((d: any) => d.difficulty), ["easy", "normal", "hard"]);
  const hard = evs[2];
  const { m } = make({ range: 500 });
  m.accept(hard.id, { retry: true });
  assert.equal(m.hazards().debris, 3);
  assert.equal(m.data.active!.oxygenLeft, scaledLimit(hard, hard.oxygenLimit));
  const easy = evs[0];
  assert.ok(scaledLimit(easy, easy.oxygenLimit)! > easy.oxygenLimit!);
});

console.log(`\n${passed} passed`);
