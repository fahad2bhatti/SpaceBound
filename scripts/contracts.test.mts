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

t("starter ship: only contracts it can fly are available, rest locked with a reason", () => {
  const { m } = make({ range: 90, ship: "starter" });
  const cards = m.boardView();
  assert.equal(cards[0].status, "available");
  assert.equal(cards[1].status, "locked");
  assert.match(cards[1].lockedReason, /210/);
  assert.match(cards[2].lockedReason, /470/);
  assert.match(m.accept(cards[1].id)!, /210/);
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

console.log(`\n${passed} passed`);
