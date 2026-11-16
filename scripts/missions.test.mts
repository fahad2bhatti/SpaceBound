// missions-guide-v1 tests. Run: npx tsx scripts/missions.test.mts  (pure logic)
import assert from "node:assert/strict";

const R = new URL("../src/game/", import.meta.url).pathname;
const { ContractManager, validateContracts } = await import(R + "contracts/manager.ts");
const { CONTRACTS } = await import(R + "contracts/data.ts");
const { defaultContractsSave } = await import(R + "contracts/state.ts");
const { MISSIONS, BODIES, DESTS, DEST_LIST, DEEP_IDS, SHIPS, activeMission, missionState, SHIP_LIST, gateShip, deepOffset } = await import(R + "catalog.ts");
const { sanitize, defaultSave } = await import(R + "save.ts");
const { buildGalaxy, CHART_GALAXY, CHART_ZOOM_MAX } = await import(R + "models.ts");
const { PLACE_ORDER, guideFor, placeOfDest, placeOfMission, shipsUnlockedBy } = await import(R + "guide.ts");

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
    assert.equal(g.name, p === "deep" ? "Deep Space" : BODIES[p].name);
    assert.ok(g.summary.length > 10);
    for (const s of g.sections) assert.ok(s.lines.length > 0, `${p}/${s.title}`);
  }
});

t("every planet has at least one campaign mission and one contract", () => {
  for (const p of PLACE_ORDER) {
    assert.ok(MISSIONS.some((m) => placeOfMission(m) === p), `campaign ${p}`);
    if (p !== "deep") assert.ok(CONTRACTS.some((c) => c.planet === p), `contract ${p}`);
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

t("deep-space gates: routes grow, each needs the next galaxy ship, base range already covers it", () => {
  assert.deepEqual(DEEP_IDS.map((id) => gateShip(DESTS[id].route).id), ["pathfinder", "nebula", "galaxy"]);
  let prev = BODIES.neptune.route;
  for (const id of DEEP_IDS) {
    const route = DESTS[id].route;
    assert.ok(route > prev, id + " is beyond the previous gate");
    assert.equal(DESTS[id].body, null);
    assert.ok(SHIPS[gateShip(route).id].range >= route, id + " needs no upgrades on its ship");
    assert.ok(DEST_LIST.includes(id), id + " is listed");
    prev = route;
  }
  for (const id of DEST_LIST) assert.ok(DESTS[id], id);
});

t("deep-space gate positions: distance matches the route, ships can reach them, the Sun is far from the flight line", () => {
  // engine.ts: Sun at SUN_DIR*3500, heat starts at SUN_RADIUS*3.6 = 936
  const len = Math.hypot(80, 30, 20);
  const sun = [(80 / len) * 3500, (30 / len) * 3500, (20 / len) * 3500];
  for (const id of DEEP_IDS) {
    const p = deepOffset(id);
    const d = Math.hypot(p[0], p[1], p[2]);
    const route = DESTS[id].route;
    assert.ok(d >= route && d <= route * 1.0025, id + " distance " + d);
    assert.ok(SHIPS[gateShip(route).id].range > d, id + " inside certified range");
    const tt = Math.max(0, Math.min(1, (sun[0] * p[0] + sun[1] * p[1] + sun[2] * p[2]) / (d * d)));
    const gap = Math.hypot(sun[0] - tt * p[0], sun[1] - tt * p[1], sun[2] - tt * p[2]);
    assert.ok(gap > 1500, id + " passes " + Math.round(gap) + " from the Sun");
  }
});

t("deep-space missions: one per gate, side missions at the end, open after the Neptune survey in any order", () => {
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(ids.slice(-3).join(), "proxima-relay,orion-gate,andromeda-gate");
  for (const id of DEEP_IDS) {
    const ms = MISSIONS.filter((m) => m.dest === id);
    assert.equal(ms.length, 1, id);
    assert.equal(ms[0].requires, "neptune-survey");
    assert.equal(placeOfMission(ms[0]), "deep");
    assert.equal(missionState([], ms[0].id), "locked");
    assert.equal(missionState(["neptune-survey"], ms[0].id), "active");
  }
  assert.equal(placeOfDest("neptune"), "neptune");
  assert.equal(placeOfDest("station"), "earth");
});

t("deep-space guide lists every gate with the ship it needs", () => {
  const g = guideFor("deep");
  assert.equal(g.place, "deep");
  const gates = g.sections.find((s) => s.title === "Gates");
  assert.ok(gates);
  assert.equal(gates.lines.length, DEEP_IDS.length);
  DEEP_IDS.forEach((id, i) => {
    assert.ok(gates.lines[i].includes(DESTS[id].name));
    assert.ok(gates.lines[i].includes(gateShip(DESTS[id].route).name));
  });
});

t("save: a deep-space destination survives sanitize, an unknown one falls back to orbit", () => {
  for (const id of DEEP_IDS) assert.equal(sanitize({ ...defaultSave(), destination: id }).destination, id);
  assert.equal(sanitize({ ...defaultSave(), destination: "nowhere" as any }).destination, "orbit");
});

t("chart galaxies: one per gate, beyond the planet orbits, apart from each other, framing fits the zoom limit", () => {
  assert.deepEqual(Object.keys(CHART_GALAXY).sort(), [...DEEP_IDS].sort());
  const NEPTUNE_ORBIT = 8 + 6 * 4.4; // engine.ts buildSolar: planet orbit radius
  let prev = 0;
  DEEP_IDS.forEach((id, i) => {
    const g = CHART_GALAXY[id];
    assert.ok(g.dist - g.size > NEPTUNE_ORBIT + 2, id + " is outside the planets");
    assert.ok(g.dist > prev, id + " is farther than the gate before it");
    assert.ok(g.dist * 1.7 <= CHART_ZOOM_MAX, id + " fits the zoom limit");
    prev = g.dist;
    for (let j = i + 1; j < DEEP_IDS.length; j++) {
      const h = CHART_GALAXY[DEEP_IDS[j]];
      const sep = Math.hypot(Math.cos(g.ang) * g.dist - Math.cos(h.ang) * h.dist, Math.sin(g.ang) * g.dist - Math.sin(h.ang) * h.dist);
      assert.ok(sep > g.size + h.size + 5, id + " and " + DEEP_IDS[j] + " do not touch");
    }
  });
});

t("buildGalaxy: 700 finite points inside the radius, flat, colours in range", () => {
  const size = 4;
  const p = buildGalaxy(size, "#a99bff");
  const pos = p.geometry.getAttribute("position");
  const col = p.geometry.getAttribute("color");
  assert.equal(pos.count, 700);
  assert.equal(col.count, 700);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    assert.ok(Number.isFinite(x + y + z), "finite " + i);
    assert.ok(Math.hypot(x, z) <= size + 1e-4, "inside radius " + i);
    assert.ok(Math.abs(y) <= size * 0.04 + 1e-4, "flat " + i);
    for (const v of [col.getX(i), col.getY(i), col.getZ(i)]) assert.ok(v >= 0 && v <= 1, "colour " + i);
  }
});

console.log(`\n${passed} passed`);
