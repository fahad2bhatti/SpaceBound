// looks-v1 tests: ship paint and stickers (cosmetics.ts + save). Run: npx tsx scripts/looks.test.mts
import assert from "node:assert/strict";
const R = "../src/game/";
const C = await import(R + "cosmetics.ts");
const { defaultSave, sanitize, keepPaid, SAVE_VERSION } = await import(R + "save.ts");

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

const saveWith = (nova: number, owned = ["starter", "orbital"]) => {
  const s = defaultSave();
  s.nova = nova;
  s.owned = owned;
  return s;
};

t("the stock look is the only free paint and sticker; everything else costs Nova", () => {
  assert.deepEqual(C.PAINTS.filter((p: { nova: number }) => p.nova === 0).map((p: { id: string }) => p.id), [C.STOCK_PAINT]);
  assert.deepEqual(C.STICKERS.filter((p: { nova: number }) => p.nova === 0).map((p: { id: string }) => p.id), [C.NO_STICKER]);
  assert.ok(C.PAINTS.every((p: { nova: number }) => Number.isInteger(p.nova) && p.nova >= 0));
});

t("ids are unique and colours are valid", () => {
  const ids = [...C.PAINTS, ...C.STICKERS].map((x: { id: string }) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of C.PAINTS) {
    assert.ok(p.hull >= 0 && p.hull <= 0xffffff);
    assert.ok(p.accent >= 0 && p.accent <= 0xffffff);
  }
});

t("a new save has every ship on the stock look", () => {
  const s = defaultSave();
  assert.deepEqual(C.lookOf(s, "starter"), C.STOCK_LOOK);
  assert.deepEqual(s.cosmetics, []);
  assert.deepEqual(s.looks, {});
  assert.equal(s.version, SAVE_VERSION);
});

t("cleanLook turns unknown ids into stock", () => {
  assert.deepEqual(C.cleanLook({ paint: "nope", sticker: "nah" }), C.STOCK_LOOK);
  assert.deepEqual(C.cleanLook(null), C.STOCK_LOOK);
  assert.deepEqual(C.cleanLook({ paint: "crimson" }), { paint: "crimson", sticker: C.NO_STICKER });
});

t("lookCost adds up only the parts that are not owned", () => {
  const s = saveWith(0);
  assert.equal(C.lookCost(s, C.STOCK_LOOK), 0);
  assert.equal(C.lookCost(s, { paint: "crimson", sticker: "star" }), 120 + 40);
  s.cosmetics.push("crimson");
  assert.equal(C.lookCost(s, { paint: "crimson", sticker: "star" }), 40);
});

t("not enough Nova: nothing is bought, nothing changes", () => {
  const s = saveWith(100);
  const r = C.buyAndEquip(s, "starter", { paint: "crimson", sticker: "none" });
  assert.equal(r.ok, false);
  assert.equal(r.short, 20);
  assert.equal(s.nova, 100);
  assert.deepEqual(s.cosmetics, []);
  assert.deepEqual(s.looks, {});
});

t("enough Nova: pays, unlocks and equips", () => {
  const s = saveWith(500);
  const r = C.buyAndEquip(s, "starter", { paint: "crimson", sticker: "star" });
  assert.equal(r.ok, true);
  assert.equal(s.nova, 500 - 160);
  assert.deepEqual(s.cosmetics.sort(), ["crimson", "star"]);
  assert.deepEqual(C.lookOf(s, "starter"), { paint: "crimson", sticker: "star" });
});

t("bought parts work on every ship you own, for free", () => {
  const s = saveWith(500);
  C.buyAndEquip(s, "starter", { paint: "crimson", sticker: "star" });
  const r = C.buyAndEquip(s, "orbital", { paint: "crimson", sticker: "star" });
  assert.equal(r.ok, true);
  assert.equal(s.nova, 500 - 160);
  assert.deepEqual(C.lookOf(s, "orbital"), { paint: "crimson", sticker: "star" });
  assert.deepEqual(s.cosmetics.length, 2);
});

t("going back to stock is free and always allowed", () => {
  const s = saveWith(0);
  s.cosmetics.push("crimson");
  s.looks.starter = { paint: "crimson", sticker: "none" };
  const r = C.buyAndEquip(s, "starter", C.STOCK_LOOK);
  assert.equal(r.ok, true);
  assert.deepEqual(C.lookOf(s, "starter"), C.STOCK_LOOK);
  assert.equal(s.nova, 0);
});

t("a ship you do not own cannot be painted", () => {
  const s = saveWith(500);
  const r = C.buyAndEquip(s, "galaxy", { paint: "arctic", sticker: "none" });
  assert.equal(r.ok, false);
  assert.equal(s.nova, 500);
});

t("lookOf never shows a part that was not bought (edited save)", () => {
  const s = saveWith(0);
  s.looks.starter = { paint: "chrome", sticker: "crown" };
  assert.deepEqual(C.lookOf(s, "starter"), C.STOCK_LOOK);
});

t("sanitize drops unknown ids and looks that use parts not owned", () => {
  const s = sanitize({
    cosmetics: ["crimson", "crimson", "unknown", "stock", "none", 5],
    looks: {
      starter: { paint: "crimson", sticker: "crown" },
      orbital: { paint: "violet", sticker: "none" },
      ghost: { paint: "crimson", sticker: "none" },
    },
  } as never);
  assert.deepEqual(s.cosmetics, ["crimson"]);
  assert.deepEqual(s.looks, { starter: { paint: "crimson", sticker: "none" } });
});

t("an old save without looks loads with defaults", () => {
  const s = sanitize({ credits: 1234 } as never);
  assert.deepEqual(s.cosmetics, []);
  assert.deepEqual(s.looks, {});
  assert.equal(s.version, SAVE_VERSION);
});

t("new game keeps what was bought", () => {
  const old = saveWith(300);
  C.buyAndEquip(old, "starter", { paint: "emerald", sticker: "bolt" });
  const fresh = defaultSave();
  keepPaid(old, fresh);
  assert.deepEqual(fresh.cosmetics.sort(), ["bolt", "emerald"]);
  assert.deepEqual(C.lookOf(fresh, "starter"), { paint: "emerald", sticker: "bolt" });
  assert.equal(fresh.nova, old.nova);
});

console.log(`\n${passed} passed`);
