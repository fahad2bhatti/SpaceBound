// looks-v1: ship paint and stickers. Cosmetic only: nothing here changes speed, fuel, range or any other stat.
// The stock look is free and is what every ship has by default. Paints and stickers are bought once with Nova
// and can then be used on every ship you own. This file is data + pure functions (no 3D, no UI) so it is easy to test.
// The 3D part is in livery.ts.

import { SHIPS, type ShipId } from "./catalog";
import type { SaveData } from "./save";

export const STOCK_PAINT = "stock";
export const NO_STICKER = "none";

/** What one ship wears. */
export type ShipLook = { paint: string; sticker: string };

export const STOCK_LOOK: ShipLook = { paint: STOCK_PAINT, sticker: NO_STICKER };

export type PaintDef = {
  id: string;
  name: string;
  /** Nova price. 0 = free (only the stock paint). */
  nova: number;
  /** Main body colour (0xRRGGBB). */
  hull: number;
  /** Stripe / accent colour. */
  accent: number;
  /** Shiny metal finish instead of painted. */
  metal?: boolean;
};

export type StickerDef = { id: string; name: string; nova: number };

export const PAINTS: PaintDef[] = [
  { id: STOCK_PAINT, name: "Stock", nova: 0, hull: 0, accent: 0 },
  { id: "arctic", name: "Arctic Blue", nova: 80, hull: 0x4aa3df, accent: 0xf2f6fa },
  { id: "dune", name: "Desert Sand", nova: 80, hull: 0xc9a66b, accent: 0x5a4630 },
  { id: "crimson", name: "Crimson Ace", nova: 120, hull: 0xc62d3a, accent: 0xf2f2f2 },
  { id: "emerald", name: "Emerald", nova: 120, hull: 0x1e8f5a, accent: 0xf2f2f2 },
  { id: "solar", name: "Solar Flare", nova: 120, hull: 0xf2b134, accent: 0x1a1d22 },
  { id: "midnight", name: "Midnight", nova: 150, hull: 0x22262e, accent: 0x8ecfff },
  { id: "violet", name: "Nebula Violet", nova: 150, hull: 0x6b3fc4, accent: 0xff7ad9 },
  { id: "chrome", name: "Chrome", nova: 200, hull: 0xc9d1d9, accent: 0x8ecfff, metal: true },
];

export const STICKERS: StickerDef[] = [
  { id: NO_STICKER, name: "None", nova: 0 },
  { id: "star", name: "Star", nova: 40 },
  { id: "bolt", name: "Bolt", nova: 40 },
  { id: "flame", name: "Flame", nova: 60 },
  { id: "planet", name: "Ringed Planet", nova: 60 },
  { id: "crescent", name: "Crescent Star", nova: 60 },
  { id: "crown", name: "Crown", nova: 80 },
];

export const paintById = (id: string): PaintDef | undefined => PAINTS.find((p) => p.id === id);
export const stickerById = (id: string): StickerDef | undefined => STICKERS.find((s) => s.id === id);

/** A look with unknown ids turned back into stock. */
export function cleanLook(raw: Partial<ShipLook> | null | undefined): ShipLook {
  return {
    paint: raw?.paint && paintById(raw.paint) ? raw.paint : STOCK_PAINT,
    sticker: raw?.sticker && stickerById(raw.sticker) ? raw.sticker : NO_STICKER,
  };
}

/** Free items are always usable; everything else must have been bought. */
export function ownsPaint(cosmetics: readonly string[], id: string): boolean {
  const p = paintById(id);
  return !!p && (p.nova === 0 || cosmetics.includes(id));
}

export function ownsSticker(cosmetics: readonly string[], id: string): boolean {
  const s = stickerById(id);
  return !!s && (s.nova === 0 || cosmetics.includes(id));
}

/** The look a ship really wears: anything not owned falls back to stock. */
export function lookOf(save: Pick<SaveData, "cosmetics" | "looks">, ship: ShipId): ShipLook {
  const l = cleanLook(save.looks[ship]);
  return {
    paint: ownsPaint(save.cosmetics, l.paint) ? l.paint : STOCK_PAINT,
    sticker: ownsSticker(save.cosmetics, l.sticker) ? l.sticker : NO_STICKER,
  };
}

/** Nova still to pay to wear [look]: the price of the parts that are not owned yet. */
export function lookCost(save: Pick<SaveData, "cosmetics">, look: ShipLook): number {
  const l = cleanLook(look);
  let total = 0;
  if (!ownsPaint(save.cosmetics, l.paint)) total += paintById(l.paint)?.nova ?? 0;
  if (!ownsSticker(save.cosmetics, l.sticker)) total += stickerById(l.sticker)?.nova ?? 0;
  return total;
}

export type LookResult = { ok: true; text: string } | { ok: false; text: string; short?: number };

/** Buys what is missing with Nova, then puts the look on [ship]. Nothing changes if Nova is short. */
export function buyAndEquip(
  save: Pick<SaveData, "cosmetics" | "looks" | "nova" | "owned">,
  ship: ShipId,
  look: ShipLook,
): LookResult {
  if (!save.owned.includes(ship)) return { ok: false, text: "Own the ship first." };
  const l = cleanLook(look);
  const cost = lookCost(save, l);
  if (save.nova < cost) {
    return { ok: false, text: `Need ${cost - save.nova} more Nova.`, short: cost - save.nova };
  }
  save.nova -= cost;
  if (!ownsPaint(save.cosmetics, l.paint)) save.cosmetics.push(l.paint);
  if (!ownsSticker(save.cosmetics, l.sticker)) save.cosmetics.push(l.sticker);
  save.looks[ship] = l;
  return { ok: true, text: cost > 0 ? `Look unlocked for ${SHIPS[ship].name}.` : `Look set on ${SHIPS[ship].name}.` };
}

/** Keeps only known ids and only looks that use owned parts. Used when loading a save. */
export function sanitizeCosmetics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || out.includes(id)) continue;
    if ((paintById(id) && id !== STOCK_PAINT) || (stickerById(id) && id !== NO_STICKER)) out.push(id);
  }
  return out;
}

export function sanitizeLooks(raw: unknown, cosmetics: readonly string[]): Partial<Record<ShipId, ShipLook>> {
  const out: Partial<Record<ShipId, ShipLook>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of Object.keys(SHIPS) as ShipId[]) {
    const v = (raw as Record<string, Partial<ShipLook> | undefined>)[id];
    if (!v || typeof v !== "object") continue;
    const l = cleanLook(v);
    const safe = {
      paint: ownsPaint(cosmetics, l.paint) ? l.paint : STOCK_PAINT,
      sticker: ownsSticker(cosmetics, l.sticker) ? l.sticker : NO_STICKER,
    };
    if (safe.paint !== STOCK_PAINT || safe.sticker !== NO_STICKER) out[id] = safe;
  }
  return out;
}

export function isStockLook(l: ShipLook): boolean {
  return l.paint === STOCK_PAINT && l.sticker === NO_STICKER;
}

export const sameLook = (a: ShipLook, b: ShipLook): boolean => a.paint === b.paint && a.sticker === b.sticker;
