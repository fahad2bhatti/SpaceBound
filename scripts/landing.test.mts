// landing-stars-v1 tests. Run: npx tsx scripts/landing.test.mts
import assert from "node:assert/strict";
const R = "../src/game/";
const { gradeLanding, rateLanding, starMultiplier, updateBest, LANDING_CFG } = await import(R + "landing.ts");
const { defaultSave, sanitize, SAVE_VERSION } = await import(R + "save.ts");
const { shareText, starString } = await import(R + "share.ts");

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

const base = { descent: 3, drift: 4, tiltDeg: 40, centerFrac: null as number | null, fuelFrac: 0.5, assisted: false };

t("gradeLanding keeps its S / A / B limits and bonus", () => {
  assert.equal(gradeLanding(1.0, 1.0, 0, false, "moon").grade, "S");
  assert.equal(gradeLanding(2.0, 2.0, 0, false, "moon").grade, "A");
  assert.equal(gradeLanding(3.0, 1.0, 0, false, "moon").grade, "B");
  assert.equal(gradeLanding(1.0, 1.0, 1, true, "moon").grade, "A");
  assert.equal(gradeLanding(1.0, 1.0, 1, false, "moon").bonus, 280);
  assert.equal(gradeLanding(1.0, 1.0, 1, false, "mars").bonus, 420);
});

t("stars: perfect, 3, 2 and 1 star thresholds", () => {
  const perfect = rateLanding({ descent: 0.3, drift: 0.4, tiltDeg: 2, centerFrac: 0.2, fuelFrac: 0.8, assisted: false });
  assert.equal(perfect.stars, 3);
  assert.equal(perfect.perfect, true);
  const three = rateLanding({ descent: 1.0, drift: 1.0, tiltDeg: 8, centerFrac: 0.5, fuelFrac: 0.5, assisted: false });
  assert.equal(three.stars, 3);
  assert.equal(three.perfect, false);
  const two = rateLanding({ descent: 2.0, drift: 2.0, tiltDeg: 20, centerFrac: 0.9, fuelFrac: 0.5, assisted: false });
  assert.equal(two.stars, 2);
  const one = rateLanding(base);
  assert.equal(one.stars, 1);
  assert.equal(one.perfect, false);
});

t("stars: tilt and distance from the zone centre can each cost a star; outside a zone only speed and tilt count", () => {
  assert.equal(rateLanding({ ...base, descent: 0.5, drift: 0.5, tiltDeg: 15, centerFrac: 0.2 }).stars, 2);
  assert.equal(rateLanding({ ...base, descent: 0.5, drift: 0.5, tiltDeg: 2, centerFrac: 0.8 }).stars, 2);
  assert.equal(rateLanding({ ...base, descent: 0.5, drift: 0.5, tiltDeg: 2, centerFrac: 1.2 }).stars, 1);
  assert.equal(rateLanding({ ...base, descent: 0.5, drift: 0.5, tiltDeg: 2, centerFrac: null }).stars, 3);
  assert.equal(rateLanding({ ...base, descent: 0.5, drift: 0.5, tiltDeg: 2, centerFrac: null }).perfect, false); // perfect needs a zone
});

t("landing assist caps stars at 2 and never gives Perfect", () => {
  const r = rateLanding({ descent: 0.3, drift: 0.4, tiltDeg: 2, centerFrac: 0.2, fuelFrac: 1, assisted: true });
  assert.equal(r.stars, 2);
  assert.equal(r.perfect, false);
});

t("score: more stars always beats fewer, cleaner touchdown beats rougher at equal stars", () => {
  const s3 = rateLanding({ descent: 1.1, drift: 1.4, tiltDeg: 9, centerFrac: 0.6, fuelFrac: 0, assisted: false }).score;
  const s2 = rateLanding({ descent: 0.5, drift: 0.5, tiltDeg: 20, centerFrac: 0.8, fuelFrac: 1, assisted: false }).score;
  assert.ok(s3 > s2);
  const clean = rateLanding({ descent: 0.4, drift: 0.4, tiltDeg: 2, centerFrac: 0.1, fuelFrac: 0.5, assisted: false }).score;
  assert.ok(clean > s3);
});

t("reward multiplier: 1 star x1.0, 2 stars x1.15, 3 stars x1.3, crash / unknown x1.0", () => {
  assert.equal(starMultiplier(1), 1);
  assert.equal(starMultiplier(2), 1.15);
  assert.equal(starMultiplier(3), 1.3);
  assert.equal(starMultiplier(0), 1);
  assert.equal(starMultiplier(99), 1.3);
  assert.equal(LANDING_CFG.perfect.bonus > 0, true);
});

t("best score: keeps the best per planet and per zone, flags New Best only when an older record is beaten", () => {
  const best: Record<string, { stars: number; score: number }> = {};
  assert.equal(updateBest(best, ["moon", "moon-flats"], 2, 2200), false); // first record: no tag
  assert.deepEqual(best["moon"], { stars: 2, score: 2200 });
  assert.equal(updateBest(best, ["moon", "moon-flats"], 1, 1500), false);
  assert.deepEqual(best["moon-flats"], { stars: 2, score: 2200 });
  assert.equal(updateBest(best, ["moon", "moon-flats"], 3, 3300), true);
  assert.deepEqual(best["moon-flats"], { stars: 3, score: 3300 });
  assert.equal(updateBest(best, ["moon"], 3, 3400), true); // free landing: planet key only
  assert.equal(best["moon"]!.score, 3400);
  assert.equal(best["moon-flats"]!.score, 3300);
});

t("save: best and badges round-trip through JSON and sanitize", () => {
  const s = defaultSave();
  updateBest(s.best, ["mars", "mars-dunes"], 3, 3500);
  s.badges.push("perfect-landing");
  const back = sanitize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.best, s.best);
  assert.deepEqual(back.badges, ["perfect-landing"]);
});

t("migration: v2 and v1 saves load as version 3 with empty best, nothing else lost", () => {
  const v2 = { ...defaultSave(), version: 2, credits: 4321, done: ["x"] } as Record<string, unknown>;
  delete v2.best;
  delete v2.badges;
  const m2 = sanitize(v2 as never);
  assert.equal(SAVE_VERSION, 3);
  assert.equal(m2.version, 3);
  assert.deepEqual(m2.best, {});
  assert.deepEqual(m2.badges, []);
  assert.equal(m2.credits, 4321);
  assert.deepEqual(m2.done, ["x"]);
  const m1 = sanitize({ started: true, credits: 77 } as never);
  assert.equal(m1.version, 3);
  assert.deepEqual(m1.best, {});
  assert.equal(m1.credits, 77);
});

t("migration: damaged best data is dropped or clamped", () => {
  const s = sanitize({ best: { moon: { stars: 9, score: -5 }, bad: "x", mars: { stars: 2 }, ok: { stars: 2, score: 1234.4 } }, badges: [1, "a"] } as never);
  assert.deepEqual(s.best, { moon: { stars: 3, score: 0 }, ok: { stars: 2, score: 1234 } });
  assert.deepEqual(s.badges, ["a"]);
});

t("share text: planet, zone, stars, score, game name and link", () => {
  const txt = shareText({ bodyName: "Moon", zoneName: "Tranquil Flats", stars: 3, score: 3420, perfect: true }, { gameName: "SpaceBound", url: "https://example.test/g" });
  assert.match(txt, /SpaceBound/);
  assert.match(txt, /Perfect landing on Moon \(Tranquil Flats\) ★★★ · 3,420 pts/);
  assert.match(txt, /https:\/\/example\.test\/g/);
  assert.equal(starString(2), "★★☆");
  assert.match(shareText({ bodyName: "Mars", zoneName: null, stars: 1, score: 1200, perfect: false }), /Landing on Mars ★☆☆/);
});

console.log(`\n${passed} passed`);
