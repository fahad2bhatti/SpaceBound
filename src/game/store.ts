// store-v1: Store ke products, Nova (◆) currency, aur kharidne par kya milta hai.
// Yeh file sirf data + saaf functions hai (koi 3D / UI nahi), taake test aasaan ho.
// Asli paisa Google Play Billing se aata hai (billing.ts). Yahan sirf yeh likha hai ke product ID par kya milega.

import { NOVA_UNLOCK, SHIPS, shipStats, type ShipId } from "./catalog";
import type { SaveData } from "./save";

export type ProductKind = "nova" | "deal";

export type Product = {
  /** Google Play Console mein bilkul yahi product ID banana hai. */
  id: string;
  kind: ProductKind;
  name: string;
  blurb: string;
  /** Sirf dikhane ke liye (Play Console se asli, local currency wali qeemat aati hai). */
  usd: number;
  /** Consumable (dobara khareed sakte ho) ya ek dafa (Google yaad rakhta hai, reinstall par wapas aata hai). */
  consumable: boolean;
  /** Is mein kya milta hai. */
  nova?: number;
  credits?: number;
  ships?: ShipId[];
  removeAds?: boolean;
  /** Card par chhota label, jaise "Best value". */
  tag?: string;
};

export const PRODUCTS: Product[] = [
  { id: "nova_100", kind: "nova", name: "100 Nova", blurb: "A handful of Nova.", usd: 0.99, consumable: true, nova: 100 },
  { id: "nova_550", kind: "nova", name: "550 Nova", blurb: "10% bonus Nova.", usd: 4.99, consumable: true, nova: 550, tag: "+10%" },
  { id: "nova_1200", kind: "nova", name: "1,200 Nova", blurb: "20% bonus Nova.", usd: 9.99, consumable: true, nova: 1200, tag: "Popular" },
  { id: "nova_2600", kind: "nova", name: "2,600 Nova", blurb: "30% bonus Nova.", usd: 19.99, consumable: true, nova: 2600, tag: "Best value" },
  {
    id: "starter_pack",
    kind: "deal",
    name: "Starter Pack",
    blurb: "300 Nova, 20,000 CR and the Shadow Phantom. One per player.",
    usd: 1.99,
    consumable: false,
    nova: 300,
    credits: 20000,
    ships: ["phantom"],
    tag: "One time",
  },
  {
    id: "remove_ads",
    kind: "deal",
    name: "Remove Ads",
    blurb: "No more ads you did not ask for. Optional reward videos stay if you want them.",
    usd: 2.99,
    consumable: false,
    removeAds: true,
  },
  {
    id: "commander_bundle",
    kind: "deal",
    name: "Commander Bundle",
    blurb: "Remove Ads, Shadow Phantom, Aurora Gold and 500 Nova.",
    usd: 7.99,
    consumable: false,
    nova: 500,
    ships: ["phantom", "aurora"],
    removeAds: true,
    tag: "Best deal",
  },
];

export const PRODUCT: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/** Nova se ship ki qeemat: exclusive ship (premium) ya locked ship ka "Unlock now". Null = Nova se nahi bikta. */
export function novaPrice(id: ShipId): number | null {
  const s = SHIPS[id];
  if (s.premium) return s.premium;
  return NOVA_UNLOCK[id] ?? null;
}

export function adsRemoved(save: SaveData): boolean {
  return save.ent.some((id) => PRODUCT[id]?.removeAds);
}

/** Ek dafa wala product pehle se liya hua hai? */
export function hasProduct(save: SaveData, id: string): boolean {
  return save.ent.includes(id);
}

function giveShip(save: SaveData, id: ShipId): void {
  if (!save.paidShips.includes(id)) save.paidShips.push(id);
  if (save.owned.includes(id)) return;
  save.owned.push(id);
  save.fuel[id] = shipStats(id, save.upgrades[id]).fuel;
}

/**
 * Google ne payment confirm kar di: player ko item do.
 * `orderId` dobara aaye (app restart, restore) to kuch dobara nahi milta.
 * Returns: player ko dikhane wali line, ya null agar kuch naya nahi mila.
 */
export function grantProduct(save: SaveData, productId: string, orderId: string, restoring = false): string | null {
  const p = PRODUCT[productId];
  if (!p) return null;
  if (orderId && save.orders.includes(orderId)) return null;
  if (!p.consumable && save.ent.includes(p.id)) {
    if (orderId) save.orders.push(orderId);
    return null;
  }
  // Restore par consumable (Nova) dobara nahi milta: woh pehle hi kharch/mil chuka.
  if (restoring && p.consumable) return null;
  if (orderId) save.orders.push(orderId);
  if (!p.consumable) save.ent.push(p.id);
  const got: string[] = [];
  if (p.nova) {
    save.nova += p.nova;
    got.push(`${p.nova} Nova`);
  }
  if (p.credits) {
    save.credits += p.credits;
    got.push(`${p.credits.toLocaleString("en-US")} CR`);
  }
  for (const s of p.ships ?? []) {
    if (!save.owned.includes(s)) got.push(SHIPS[s].name);
    giveShip(save, s);
  }
  if (p.removeAds) got.push("ads removed");
  return got.length ? `${restoring ? "Restored" : "Got"}: ${got.join(", ")}.` : null;
}

export type SpendResult = { ok: true; text: string } | { ok: false; text: string; short?: number };

/** Nova kharch karke ship lo (exclusive ya locked ship ka "Unlock now"). */
export function buyShipWithNova(save: SaveData, id: ShipId): SpendResult {
  const price = novaPrice(id);
  if (price === null) return { ok: false, text: "This ship is not sold for Nova." };
  if (save.owned.includes(id)) return { ok: false, text: "Already in the hangar." };
  if (save.nova < price) return { ok: false, text: `Need ${price - save.nova} more Nova.`, short: price - save.nova };
  save.nova -= price;
  giveShip(save, id);
  return { ok: true, text: `${SHIPS[id].name} is yours.` };
}

/** Store kis ko dikhe: 13 saal se chhote players ko nahi. */
export function storeAllowed(save: SaveData): boolean {
  return save.profile.ageGroup !== "child";
}
