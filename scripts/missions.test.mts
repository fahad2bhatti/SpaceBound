// missions-guide-v1 tests. Run: npx tsx scripts/missions.test.mts  (pure logic)
import assert from "node:assert/strict";

const R = new URL("../src/game/", import.meta.url).pathname;
const { ContractManager, validateContracts } = await import(R + "contracts/manager.ts");
const { CONTRACTS } = await import(R + "contracts/data.ts");
const { defaultContractsSave } = await import(R + "contracts/state.ts");
const { MISSIONS, BODIES, activeMission, missionState, SHIP_LIST } = await import(R + "catalog.ts");
const { PLACE_ORDER, guideFor, placeOfMission, shipsUnlockedBy } = await import(R + "guide.ts");

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("ok  ", name);
  } catch (e) {
    console.log("FAIL", name, "\n    ", (e as Error).stack?.split("\n").slice(0, 8).join("\n"));
    process.exitCode = 1;
  }
}

function make(ctx: { range?: number; ship?: string; campaignDone?: string[] } = {}) {
  const c = { range: 360, ship: "lunar", campaignDone: [] as string[], ...ctx };
  const m = new ContractManager({ ctx: () => c, onObjective: () => {}, onFinish: () => {}, onChange: () => {} }, CONTRACTS);
  m.bind(defaultContractsSave());
  return { m, c };
}

t("contract data validates (gas contracts included)", () => {
  assert.deepEqual(validateContracts(), []);
});

t("every campaign mission maps to a place with a guide", () => {
  for (const m of MISSIONS) {
    const p = placeOfMission(m);
    assert.ok(PLACE_ORDER.includes(p), `${m.id} -> ${p}`);
  }
  for (const p of PLACE_ORDER) {
    const g = guideFor(p);
    assert.equal(g.name, BODIES[p].name);
    assert.ok(g.summary.length > 10);
    for (const s of g.sections) assert.ok(s.lines.length > 0, `${p}/${s.title}`);
  }
});

t("every planet has at least one campaign mission and one contract", () => {
  for (const p of PLACE_ORDER) {
    assert.ok(MISSIONS.some((m) => placeOfMission(m) === p), `campaign ${p}`);
    assert.ok(CONTRACTS.some((c) => c.planet === p), `contract ${p}`);
  }
});

t("gas landing missions are side missions: main chain and unlocks are unchanged", () => {
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(ids[ids.indexOf("neptune-survey") + 1], "jupiter-landing");
  for (const id of ["jupiter", "saturn", "uranus", "neptune"]) assert.ok(ids.includes(`${id}-landing`));
  // old save that finished the whole chain: landing missions are available, nothing else becomes locked/undone
  const gas = ["jupiter-landing", "saturn-landing", "uranus-landing", "neptune-landing"];
  const done = ids.filter((id) => !gas.includes(id));
  assert.equal(activeMission(done)?.id, "jupiter-landing");
  for (const id of done) assert.equal(missionState(done, id), "done");
  assert.equal(missionState([], "jupiter-landing"), "locked");
  assert.equal(missionState(["jupiter-flyby"], "jupiter-landing"), "active");
});

t("neptune-survey opens the three galaxy ships (shown on the mission row)", () => {
  const names = shipsUnlockedBy("neptune-survey").map((s: any) => s.id).sort();
  assert.deepEqual(names, ["galaxy", "nebula", "pathfinder"]);
  assert.ok(SHIP_LIST.length >= 10);
});

t("allView lists every visible contract; accept works for a contract that is not on the board", () => {
  const { m } = make({ range: 360, campaignDone: [] });
  const all = m.allView();
  assert.equal(all.length, CONTRACTS.filter((c: any) => !c.hidden).length);
  const board = new Set(m.boardView().map((c: any) => c.id));
  const off = all.find((c: any) => c.status === "available" && !board.has(c.id));
  assert.ok(off, "some available contract is off the board");
  assert.match(m.accept(off.id) ?? "", /not on the board/);
  assert.equal(m.accept(off.id, { any: true }), null);
});

t("gas contracts stay locked until range and campaign step are met", () => {
  const { m, c } = make({ range: 360, campaignDone: [] });
  const jup = () => m.allView().find((x: any) => x.id === "jupiter-cloud-survey");
  assert.equal(jup().status, "locked");
  assert.match(m.accept("jupiter-cloud-survey", { any: true }) ?? "", /Needs 900/);
  c.range = 1200;
  assert.match(jup().lockedReason ?? "", /Finish campaign/);
  c.campaignDone = ["jupiter-flyby"];
  assert.equal(jup().status, "available");
  assert.equal(m.accept("jupiter-cloud-survey", { any: true }), null);
  assert.equal(jup().status, "active");
  assert.match(m.accept("saturn-deck-survey", { any: true }) ?? "", /abandon/);
});

console.log(`\n${passed} passed`);
