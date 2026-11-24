// autopilot-v1 tests. Run: npx tsx scripts/autopilot.test.mts
// A small copy of the flight model (gravity, thrust, arcade alignment, speed cap, atmosphere, cloud cushion)
// flies the autopilot on real routes and checks that it arrives without touching the ground, the Sun or the range limit.
// If you change flight numbers in engine.ts (ALIGN_RATE, AP_TURN, AP_BRAKE, gravity), change them here too.
import assert from "node:assert/strict";
const R = "../src/game/";
const { BODIES, shipStats, cruiseMultiplier, bodyOffset, deepOffset, DEEP_IDS } = await import(R + "catalog.ts");
const { PLANETS } = await import(R + "planets.ts");
const { plan, detour } = await import(R + "autopilot.ts");

type V = [number, number, number];
let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("ok  ", name);
  } catch (e) {
    console.log("FAIL", name, "\n    ", (e as Error).message);
    process.exitCode = 1;
  }
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => (len(a) > 1e-9 ? mul(a, 1 / len(a)) : [0, 0, 1]);

// Same numbers as engine.ts
const ALIGN_RATE = 1.8;
const AP_TURN = 2.2;
const AP_BRAKE = 1.2;
const PITCH_LIMIT = (75 * Math.PI) / 180;
const IDS = ["earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;
type Id = (typeof IDS)[number];
const C = Object.fromEntries(IDS.map((id) => [id, bodyOffset(id) as V])) as Record<Id, V>;
const PAD = norm([0.2, 0.38, 0.9]);
const SUN = mul(norm([80, 30, 20]), 3500);
const SUN_R = 260;
const SUN_WARN = SUN_R * 3.6;
const STATION = mul(norm(C.moon), 75);
const beacon: Record<string, V> = {};
for (const id of DEEP_IDS) beacon[id] = deepOffset(id) as V;
for (const id of IDS) {
  if (id === "earth") continue;
  const b = BODIES[id];
  if (b.gas) beacon[id] = add(C[id], mul(norm([-norm(C[id])[2], 0, norm(C[id])[0]]), b.radius + 9));
  else beacon[id] = add(C[id], mul(norm(C[id]), -(b.radius + 0.2)));
}
const bodies = [
  ...IDS.map((id) => ({ id, c: C[id], r: BODIES[id].radius, clear: PLANETS[id].boundary + 6 })),
  { id: "sun", c: SUN, r: SUN_R, clear: (SUN_WARN * 1.05 - SUN_R) / 0.8 },
];

function gravity(p: V): V {
  let g: V = [0, 0, 0];
  for (const id of IDS) {
    const v = sub(p, C[id]);
    const r = len(v);
    const b = BODIES[id];
    const infl = b.radius * 4.8;
    if (r < 0.2 || r > infl) continue;
    const fade = 1 - Math.min(1, Math.max(0, (r - b.radius) / (infl - b.radius)));
    g = add(g, mul(v, (-b.g * (b.radius / r) ** 2 * (0.35 + 0.65 * fade)) / r));
  }
  return g;
}
function dominant(p: V): Id {
  let best: Id = "earth";
  let sc = Infinity;
  for (const id of IDS) {
    const s = len(sub(p, C[id])) / BODIES[id].soi;
    if (s < sc) [sc, best] = [s, id];
  }
  return best;
}
function target(dest: string) {
  if (dest === "station") return { t: STATION, arrive: 5, tb: null, floor: 0 };
  if (dest === "earth") return { t: mul(PAD, 16 + 12), arrive: 5, tb: "earth", floor: 7 };
  if ((DEEP_IDS as string[]).includes(dest)) return { t: beacon[dest]!, arrive: 5, tb: null, floor: 0 };
  const b = BODIES[dest as Id];
  if (b.gas) return { t: beacon[dest]!, arrive: 4, tb: dest, floor: 5 };
  return { t: add(beacon[dest]!, mul(norm(sub(beacon[dest]!, C[dest as Id])), 12)), arrive: 5, tb: dest, floor: 7 };
}

function fly(ship: string, start: { p: V; v: V; f: V }, dest: string): { ok: boolean; why: string; fuelUsed: number } {
  const st = shipStats(ship, { engine: 0, tank: 0, nav: 0 });
  let { p, v, f } = start;
  let fuel = st.fuel;
  const tg = target(dest);
  const dt = 1 / 30;
  for (let time = 0; time < 1500; time += dt) {
    const cap = st.speed * cruiseMultiplier(len(p));
    const out = plan({ pos: p, vel: v, target: tg.t, arrive: tg.arrive, cap, bodies, targetBody: tg.tb, floor: tg.floor });
    if (out.phase === "arrived") return { ok: true, why: `arrived in ${time.toFixed(0)} s`, fuelUsed: 1 - fuel / st.fuel };
    f = norm(add(mul(f, Math.exp(-AP_TURN * dt)), mul(out.dir, 1 - Math.exp(-AP_TURN * dt))));
    const dom = dominant(p);
    const up: V = len(sub(p, C[dom])) < BODIES[dom].soi * 1.8 ? norm(sub(p, C[dom])) : [0, 1, 0];
    const s = Math.max(-1, Math.min(1, dot(f, up)));
    if (Math.abs(Math.asin(s)) > PITCH_LIMIT) {
      const head = norm(sub(f, mul(up, s)));
      const np = Math.sign(s) * PITCH_LIMIT;
      f = norm(add(mul(up, Math.sin(np)), mul(head, Math.cos(np))));
    }
    if (len(p) > st.range) return { ok: false, why: "range lock", fuelUsed: 1 };
    fuel -= st.burn * out.throttle * dt;
    if (fuel <= 0) return { ok: false, why: "out of fuel", fuelUsed: 1 };
    if (out.throttle > 0.02 && len(v) < cap) v = add(v, mul(f, st.accel * out.throttle * dt));
    const sp = len(v);
    if (sp > 0.05) v = mul(norm(add(mul(v, Math.exp(-ALIGN_RATE * dt)), mul(f, sp * (1 - Math.exp(-ALIGN_RATE * dt))))), sp);
    v = add(v, mul(gravity(p), dt));
    const alt = len(sub(p, C[dom])) - BODIES[dom].radius;
    const atmo = BODIES[dom].atmo;
    const dens = atmo > 0 ? Math.max(0, Math.min(1, 1 - alt / atmo)) : 0;
    if (dens > 0) v = mul(v, Math.max(0, 1 - dens * (0.25 + len(v) * 0.08) * dt));
    if (len(v) > cap) v = mul(v, Math.max(cap / len(v), 1 - dt * 0.85));
    const bnd = PLANETS[dom].boundary;
    if (alt < bnd) {
      const lim = cap * (1 - 0.3 * Math.max(0, Math.min(1, 1 - alt / bnd)));
      if (len(v) > lim) v = mul(v, Math.max(lim / len(v), 1 - dt * 0.6));
    }
    if (out.brake > 0) {
      v = mul(v, 1 - out.brake * AP_BRAKE * dt);
      fuel -= st.burn * 0.3 * out.brake * dt;
    }
    if (BODIES[dom].gas && alt < 14) {
      const u = norm(sub(p, C[dom]));
      const climb = dot(v, u);
      const maxDown = 4 + Math.max(0, alt) * 0.55;
      if (climb <= 0.5 && -climb > maxDown) v = add(v, mul(u, (-maxDown - climb) * Math.min(1, dt * 6)));
    }
    p = add(p, mul(v, dt));
    const altN = len(sub(p, C[dom])) - BODIES[dom].radius;
    if (altN < 1.15 && dot(v, norm(sub(p, C[dom]))) <= 0.3) return { ok: false, why: `touched ${dom}`, fuelUsed: 1 };
    if (len(sub(p, SUN)) < SUN_WARN) return { ok: false, why: "flew into Sun heat", fuelUsed: 1 };
  }
  return { ok: false, why: "did not arrive in 25 min", fuelUsed: 1 };
}

const orbit = () => {
  const tan = norm([-PAD[2], 0, PAD[0]]);
  return { p: mul(PAD, 26), v: mul(tan, 3.4), f: tan };
};
const surface = (id: Id) => {
  const n = norm(sub(beacon[id]!, C[id]));
  return { p: add(C[id], mul(n, BODIES[id].radius + 2.4)), v: mul(n, 3.2), f: n };
};
const pad = () => ({ p: mul(PAD, 18.4), v: mul(PAD, 5.2), f: PAD });

const routes: [string, string, () => { p: V; v: V; f: V }, string][] = [
  ["pad -> Moon", "lunar", pad, "moon"],
  ["orbit -> Vesper Station", "orbital", orbit, "station"],
  ["Moon surface -> Earth", "lunar", () => surface("moon"), "earth"],
  ["orbit -> Mars", "advanced", orbit, "mars"],
  ["Mars surface -> Earth", "advanced", () => surface("mars"), "earth"],
  ["orbit -> Jupiter beacon", "heavy", orbit, "jupiter"],
  ["orbit -> Saturn beacon", "elite", orbit, "saturn"],
  ["Saturn surface -> Earth", "elite", () => surface("saturn"), "earth"],
  ["orbit -> Uranus beacon", "ultimate", orbit, "uranus"],
  ["orbit -> Neptune beacon", "ultimate", orbit, "neptune"],
  ["Mars surface -> Neptune", "ultimate", () => surface("mars"), "neptune"],
  ["orbit -> Proxima gate", "pathfinder", orbit, "proxima"],
  ["Mars far side -> Mars landing site", "advanced", () => ({ p: add(C.mars, mul(norm(C.mars), 30)), v: [0, 0, 0], f: [1, 0, 0] }), "mars"],
];
for (const [name, ship, start, dest] of routes) {
  t(`autopilot flies ${name} (${ship})`, () => {
    const r = fly(ship, start(), dest);
    assert.ok(r.ok, r.why);
    assert.ok(r.fuelUsed < 0.6, `used ${(r.fuelUsed * 100).toFixed(0)}% fuel`);
  });
}

t("detour: a planet on the straight line gives a point beside it, a clear line gives null", () => {
  const b = [{ id: "x", c: [50, 0, 0] as V, r: 10, clear: 5 }];
  const d = detour([0, 0, 0], [100, 0, 0], b, null);
  assert.ok(d, "expected a detour");
  assert.ok(len(sub(d!, [50, 0, 0])) > 14, "detour point must be outside the planet");
  assert.equal(detour([0, 0, 0], [0, 0, 100], b, null), null);
});

t("plan: arrived inside the arrive distance, climb when leaving a planet", () => {
  const b = [{ id: "x", c: [0, 0, 0] as V, r: 10, clear: 8 }];
  assert.equal(plan({ pos: [0, 0, 100], vel: [0, 0, 0], target: [0, 0, 102], arrive: 4, cap: 10, bodies: b, targetBody: null, floor: 0 }).phase, "arrived");
  const c = plan({ pos: [0, 12, 0], vel: [0, 0, 0], target: [500, 0, 0], arrive: 4, cap: 10, bodies: b, targetBody: null, floor: 0 });
  assert.equal(c.phase, "climb");
  assert.ok(c.dir[1] > 0.8, "climb points mostly up");
});

console.log(`\n${passed} passed`);
