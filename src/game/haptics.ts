import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const native = Capacitor.isNativePlatform();
let enabled = true;
let last = 0;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function fire(run: () => Promise<void>, minGap = 0): void {
  if (!native || !enabled) return;
  const now = performance.now();
  if (now - last < minGap) return;
  last = now;
  run().catch(() => {});
}

export const haptic = {
  /** Button / stick press. */
  tap: () => fire(() => Haptics.impact({ style: ImpactStyle.Medium }), 40),
  /** Hard impact or crash. */
  heavy: () => fire(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  /** Bounce or warning (rate limited, the ground check can fire every few frames). */
  warn: () => fire(() => Haptics.notification({ type: NotificationType.Warning }), 400),
  /** Good touchdown. */
  success: () => fire(() => Haptics.notification({ type: NotificationType.Success })),
};
