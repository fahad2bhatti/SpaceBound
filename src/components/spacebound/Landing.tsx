// landing-stars-v1: small landing result panel. Plain DOM/CSS: stars pop one by one, a tap finishes the animation,
// the next tap closes it. Under low quality or reduced motion everything appears at once. Never blocks the game.
import { useState } from "react";
import { Share2 } from "lucide-react";
import { formatInt } from "@/game/catalog";
import type { Snap, Spacebound } from "@/game/engine";

type Act = (fn: (e: Spacebound) => void) => void;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function LandingPanel({ snap, act }: { snap: Snap; act: Act }) {
  const r = snap.landing;
  const [done, setDone] = useState(false);
  if (!r) return null;
  const instant = done || snap.settings.quality === "low" || reducedMotion();
  const tap = () => {
    if (!instant) setDone(true);
    else act((e) => e.dismissLanding());
  };
  const credits = r.bonus + r.perfectBonus;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={tap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") tap();
      }}
      className={
        "pointer-events-auto absolute left-1/2 top-16 z-20 w-[min(20rem,92vw)] -translate-x-1/2 cursor-pointer border bg-bg/90 p-3 text-center backdrop-blur-md " +
        (r.perfect ? "border-accent" : "border-line") +
        (instant ? " sb-landing-instant" : "")
      }
    >
      <p className="font-display text-xs tracking-widest text-accent">
        {r.perfect ? "PERFECT LANDING" : "LANDING REPORT"} · {r.bodyName.toUpperCase()}
        {r.zoneName ? ` · ${r.zoneName.toUpperCase()}` : ""}
      </p>
      <div className="mt-1 flex items-center justify-center gap-2" aria-label={`${r.stars} of 3 stars`}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={"text-4xl leading-none " + (n <= r.stars ? "sb-star text-accent" : "text-line")}
            style={n <= r.stars ? { animationDelay: `${(n - 1) * 0.38}s` } : undefined}
          >
            {n <= r.stars ? "★" : "☆"}
          </span>
        ))}
      </div>
      <p className="mt-1 font-display text-lg uppercase">
        Grade {r.grade}
        {r.newBest && <span className="ml-2 text-primary">New Best!</span>}
      </p>
      <p className="text-xs text-muted">
        Touchdown {r.descent.toFixed(1)} · Drift {r.drift.toFixed(1)} · Tilt {Math.round(r.tiltDeg)}°
        {r.centerPct !== null ? ` · Center ${r.centerPct}%` : ""}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-display text-primary">+{formatInt(credits)} CR</span>
        {r.perfectBonus > 0 && <span className="text-muted"> (incl. {r.perfectBonus} perfect bonus)</span>}
      </p>
      {r.badgeNew && <p className="text-xs text-accent">Badge earned: Perfect Landing</p>}
      {r.assisted && <p className="text-xs text-muted">Landing assist caps stars at 2.</p>}
      <p className="text-xs text-muted">
        Score {formatInt(r.score)} · Best {formatInt(r.bestScore)} {"★".repeat(r.bestStars)}
      </p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1 border border-line px-3 py-1 text-xs uppercase active:bg-primary/30"
          onClick={(e) => {
            e.stopPropagation();
            act((en) => en.shareLanding());
          }}
        >
          <Share2 className="size-4" /> Share
        </button>
        <span className="text-xs text-muted">{instant ? "Tap to continue" : "Tap to skip"}</span>
      </div>
    </div>
  );
}
