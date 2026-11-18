// store-v1: payment ka darwaza. Abhi "test" mode: kuch charge nahi hota, item foran mil jata hai.
// Agle qadam mein yahan Google Play Billing lagegi (BILLING_MODE = "play"). Baqi game ko farq nahi padega.

import { PRODUCTS } from "./store";

/** "test" = muft test purchase (sirf testing ke liye). Play Store par release se pehle "play" karna LAZMI hai. */
export const BILLING_MODE: "test" | "play" = "test";

export type BillingResult =
  | { status: "ok"; productId: string; orderId: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export type OwnedPurchase = { productId: string; orderId: string };

export interface Billing {
  readonly mode: "test" | "play";
  /** Har product ki dikhane wali qeemat, user ki currency mein (jaise "Rs 280" ya "$0.99"). */
  prices(): Promise<Record<string, string>>;
  buy(productId: string): Promise<BillingResult>;
  /** Pehle khareede gaye ek-dafa wale products (reinstall ke baad wapas lene ke liye). */
  restore(): Promise<OwnedPurchase[]>;
}

const usd = (n: number): string => "$" + n.toFixed(2);

class TestBilling implements Billing {
  readonly mode = "test" as const;
  async prices(): Promise<Record<string, string>> {
    return Object.fromEntries(PRODUCTS.map((p) => [p.id, usd(p.usd)]));
  }
  async buy(productId: string): Promise<BillingResult> {
    await new Promise((r) => setTimeout(r, 500));
    return { status: "ok", productId, orderId: "TEST-" + productId + "-" + Date.now() };
  }
  async restore(): Promise<OwnedPurchase[]> {
    return [];
  }
}

export const billing: Billing = new TestBilling();
