// landing-stars-v1: share a landing result as text. Phone: Capacitor Share. Browser: Web Share API. Last resort: clipboard.
export const SHARE_CONFIG = {
  gameName: "SpaceBound",
  /** Placeholder: replace with the Play Store / website link when the game is published. */
  url: "https://github.com/fahad2bhatti/SpaceBound",
  title: "SpaceBound landing",
} as const;

export type ShareInfo = { bodyName: string; zoneName: string | null; stars: number; score: number; perfect: boolean };
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export function starString(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.round(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** e.g. "SpaceBound: Perfect landing on Moon (Tranquil Flats) ★★★ · 3,420 pts\nCan you beat it? <link>" */
export function shareText(r: ShareInfo, cfg: { gameName: string; url: string } = SHARE_CONFIG): string {
  const place = r.zoneName ? `${r.bodyName} (${r.zoneName})` : r.bodyName;
  const pts = r.score.toLocaleString("en-US");
  return `${cfg.gameName}: ${r.perfect ? "Perfect landing" : "Landing"} on ${place} ${starString(r.stars)} · ${pts} pts\nCan you beat it? ${cfg.url}`;
}

export async function shareResult(text: string): Promise<ShareOutcome> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: SHARE_CONFIG.title, text, dialogTitle: "Share your landing" });
      return "shared";
    }
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return "cancelled";
    /* plugin missing or failed: fall through to the web paths */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: SHARE_CONFIG.title, text });
      return "shared";
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "cancelled";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
