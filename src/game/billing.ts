// store-v1 / billing-v1: payment ka darwaza.
// Phone (Android app) par: asli Google Play Billing (@capgo/native-purchases, Play Billing Library 9).
// Browser / dev par: "test" mode, kuch charge nahi hota, item foran mil jata hai.
//
// Hifazat ka tareeqa (taake player ka paisa kabhi zaya na ho, chahe app beech mein band ho jaye):
//   1. Google payment confirm karta hai, lekin purchase abhi "finish" nahi hoti.
//   2. Game item deti hai aur SAVE karti hai.
//   3. Phir finish(): Nova pack "consume" (dobara khareed sakein), deal "acknowledge".
//   4. Har game start par unfinished() se adhoori purchases mil kar de di jaati hain.
// Google 3 din mein acknowledge na ho to paisa wapas kar deta hai, is liye step 3 aur 4 zaroori hain.

import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE, type Transaction } from "@capgo/native-purchases";
import { PRODUCT, PRODUCTS } from "./store";

/**
 * Sirf apne phone par Store ka UI dekhne ke liye (bina Play Store ke) true karo.
 * Play Store par jaane wali build mein HAMESHA false hona chahiye, warna sab muft milega.
 */
const FORCE_TEST_BILLING = false;

export type BillingResult =
  | { status: "ok"; purchase: Paid }
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "owned" }
  | { status: "error"; message: string };

/** Ek confirmed (paid) purchase jo abhi game ko deni hai. */
export type Paid = {
  productId: string;
  /** Google order ID (GPA.xxxx), na ho to purchase token. Ek order do dafa na mile is ke liye. */
  orderId: string;
  /** Play ka token: finish (consume / acknowledge) ke liye. Test mode mein khali. */
  token: string;
  acknowledged: boolean;
};

export interface Billing {
  readonly mode: "test" | "play";
  /** Har product ki dikhane wali qeemat, player ki currency mein (jaise "Rs 280"). */
  prices(): Promise<Record<string, string>>;
  buy(productId: string): Promise<BillingResult>;
  /** Item save hone ke BAAD Google ko "ho gaya" batao. */
  finish(p: Paid): Promise<void>;
  /** Adhoori purchases (app band ho gayi thi, ya pending payment ab poori hui). */
  unfinished(): Promise<Paid[]>;
  /** Ek-dafa wale products jo is Google account ne khareede (reinstall ke baad). */
  restore(): Promise<Paid[]>;
  /** App chalte hue koi purchase poori ho (jaise pending payment) to yeh chalega. */
  onPurchase(cb: (p: Paid) => void): void;
}

const usd = (n: number): string => "$" + n.toFixed(2);

class TestBilling implements Billing {
  readonly mode = "test" as const;
  async prices(): Promise<Record<string, string>> {
    return Object.fromEntries(PRODUCTS.map((p) => [p.id, usd(p.usd)]));
  }
  async buy(productId: string): Promise<BillingResult> {
    await new Promise((r) => setTimeout(r, 500));
    return { status: "ok", purchase: { productId, orderId: "TEST-" + productId + "-" + Date.now(), token: "", acknowledged: true } };
  }
  async finish(): Promise<void> {}
  async unfinished(): Promise<Paid[]> {
    return [];
  }
  async restore(): Promise<Paid[]> {
    return [];
  }
  onPurchase(): void {}
}

function toPaid(t: Transaction): Paid | null {
  // Android: purchaseState "1" = PURCHASED. "2" = pending (abhi paisa nahi aaya), us ko chhod do.
  if (t.purchaseState !== undefined && t.purchaseState !== "1") return null;
  if (!PRODUCT[t.productIdentifier]) return null;
  const token = t.purchaseToken ?? "";
  return { productId: t.productIdentifier, orderId: t.orderId || token, token, acknowledged: Boolean(t.isAcknowledged) };
}

function errCode(e: unknown): string {
  const o = e as { code?: string; message?: string; data?: { code?: string } } | null;
  return String(o?.code ?? o?.data?.code ?? o?.message ?? e ?? "");
}

class PlayBilling implements Billing {
  readonly mode = "play" as const;
  private cached: Record<string, string> | null = null;

  async prices(): Promise<Record<string, string>> {
    if (this.cached) return this.cached;
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: PRODUCTS.map((p) => p.id),
      productType: PURCHASE_TYPE.INAPP,
    });
    const out: Record<string, string> = {};
    for (const p of products) if (p.identifier && p.priceString) out[p.identifier] = p.priceString;
    if (Object.keys(out).length) this.cached = out;
    return out;
  }

  async buy(productId: string): Promise<BillingResult> {
    const p = PRODUCT[productId];
    if (!p) return { status: "error", message: "Unknown item." };
    try {
      const t = await NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
        // Hum khud finish() karte hain, item SAVE hone ke baad. Is liye plugin se auto consume / acknowledge band.
        isConsumable: false,
        autoAcknowledgePurchases: false,
      });
      const paid = toPaid(t);
      return paid ? { status: "ok", purchase: paid } : { status: "pending" };
    } catch (e) {
      const c = errCode(e);
      if (/USER_CANCEL|cancel/i.test(c)) return { status: "cancelled" };
      if (/ALREADY_OWNED/i.test(c)) return { status: "owned" };
      if (/pending/i.test(c)) return { status: "pending" };
      if (/ITEM_UNAVAILABLE|not found|BILLING_UNAVAILABLE/i.test(c))
        return { status: "error", message: "Store not available. Install the game from Google Play and sign in." };
      return { status: "error", message: "Google Play could not finish the payment. Try again." };
    }
  }

  async finish(paid: Paid): Promise<void> {
    if (!paid.token) return;
    const p = PRODUCT[paid.productId];
    if (p?.consumable) await NativePurchases.consumePurchase({ purchaseToken: paid.token });
    else if (!paid.acknowledged) await NativePurchases.acknowledgePurchase({ purchaseToken: paid.token });
  }

  async unfinished(): Promise<Paid[]> {
    // Consumables jo consume nahi hue + deals jo acknowledge nahi hue: sab getPurchases mein aate hain.
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases
      .map(toPaid)
      .filter((p): p is Paid => !!p && (Boolean(PRODUCT[p.productId]?.consumable) || !p.acknowledged));
  }

  async restore(): Promise<Paid[]> {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.map(toPaid).filter((p): p is Paid => !!p && !PRODUCT[p.productId]?.consumable);
  }

  onPurchase(cb: (p: Paid) => void): void {
    void NativePurchases.addListener("transactionUpdated", (t: Transaction) => {
      const paid = toPaid(t);
      if (paid) cb(paid);
    }).catch(() => {});
  }
}

/** Android app (Play se install) par asli billing, browser par test. */
export const BILLING_MODE: "test" | "play" = !FORCE_TEST_BILLING && Capacitor.isNativePlatform() ? "play" : "test";

export const billing: Billing = BILLING_MODE === "play" ? new PlayBilling() : new TestBilling();
