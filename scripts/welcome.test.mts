// welcome-gate-v1 tests. Run: npx tsx scripts/welcome.test.mts
import assert from "node:assert/strict";
const R = "../src/game/";
const { ageGroupFromBirth, TERMS_VERSION } = await import(R + "terms.ts");
const { defaultSave, sanitize } = await import(R + "save.ts");

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; }
}
const now = new Date(2026, 10, 17); // 17 Nov 2026

t("child / teen / adult", () => {
  assert.equal(ageGroupFromBirth(2018, 5, 1, now), "child");
  assert.equal(ageGroupFromBirth(2010, 1, 1, now), "teen");
  assert.equal(ageGroupFromBirth(1999, 1, 1, now), "adult");
});
t("birthday boundaries", () => {
  assert.equal(ageGroupFromBirth(2013, 11, 17, now), "teen"); // exactly 13 today
  assert.equal(ageGroupFromBirth(2013, 11, 18, now), "child"); // 13 tomorrow
  assert.equal(ageGroupFromBirth(2008, 11, 17, now), "adult"); // exactly 18 today
  assert.equal(ageGroupFromBirth(2008, 11, 18, now), "teen");
});
t("invalid dates", () => {
  assert.equal(ageGroupFromBirth(2000, 2, 31, now), null);
  assert.equal(ageGroupFromBirth(2030, 1, 1, now), null);
  assert.equal(ageGroupFromBirth(1800, 1, 1, now), null);
  assert.equal(ageGroupFromBirth(NaN, 1, 1, now), null);
});
t("default save is gated", () => {
  const s = defaultSave();
  assert.equal(s.profile.ageGroup, null);
  assert.ok(s.profile.termsVersion < TERMS_VERSION);
});
t("old saves load with a profile and need the gate", () => {
  const { profile, ...old } = defaultSave();
  const s = sanitize(old);
  assert.equal(s.profile.ageGroup, null);
  assert.equal(s.profile.termsVersion, 0);
});
t("sanitize keeps a good profile, drops garbage", () => {
  const good = sanitize({ ...defaultSave(), profile: { ageGroup: "teen", termsVersion: 1, acceptedAt: 5 } });
  assert.deepEqual(good.profile, { ageGroup: "teen", termsVersion: 1, acceptedAt: 5 });
  const bad = sanitize({ ...defaultSave(), profile: { ageGroup: "wizard", termsVersion: -3, acceptedAt: "x" } as never });
  assert.deepEqual(bad.profile, { ageGroup: null, termsVersion: 0, acceptedAt: 0 });
});
console.log(`welcome tests: ${passed} passed`);
