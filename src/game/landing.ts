export type LandingGrade = "S" | "A" | "B";
export type Stars = 1 | 2 | 3;

export type LandingReport = { grade: LandingGrade; bonus: number };

/**
 * landing-stars-v1: every number that decides stars, Perfect Landing, score and the contract multiplier lives here,
 * so it can be tuned without touching the engine. Descent / drift are the vertical and sideways speed at contact,
 * tilt is the angle between the ship's up axis and the surface normal (degrees), center is the distance from the
 * zone centre as a fraction of the zone radius (only used when the touchdown is inside a marked zone).
 * A tier needs ALL of its numbers. The 3-star and 2-star descent/drift limits are also the S and A grade limits.
 */
export const LANDING_CFG = {
  stars: {
    three: { descent: 1.2, drift: 1.5, tilt: 10, center: 0.65 },
    two: { descent: 2.6, drift: 3, tilt: 25, center: 1 },
  },
  perfect: { descent: 0.6, drift: 0.8, tilt: 5, center: 0.35, bonus: 150, badge: "perfect-landing" },
  /** Contract reward multiplier by stars (applied to the contract credits when the landing finishes the contract). */
  multiplier: { 0: 1, 1: 1, 2: 1.15, 3: 1.3 } as Record<0 | 1 | 2 | 3, number>,
  /** Score weights: stars dominate, the rest rewards a clean touchdown. */
  score: { perStar: 1000, speed: 300, drift: 200, tilt: 200, center: 300, fuel: 100 },
} as const;

const BASE: Record<LandingGrade, number> = { S: 200, A: 120, B: 50 };
const BODY_MULT: Partial<Record<string, number>> = { earth: 0.25, mars: 1.5 };

/**
 * Grade a successful touchdown. `descent` and `drift` are the vertical and sideways speed at contact,
 * `fuelFrac` is the tank fill (0..1). Landing assist caps the grade at A so S stays a manual skill.
 */
export function gradeLanding(
  descent: number,
  drift: number,
  fuelFrac: number,
  assisted: boolean,
  body: string,
): LandingReport {
  const d = Math.max(0, descent);
  const h = Math.abs(drift);
  const { three, two } = LANDING_CFG.stars;
  let grade: LandingGrade = "B";
  if (d < three.descent && h < three.drift) grade = "S";
  else if (d < two.descent && h < two.drift) grade = "A";
  if (assisted && grade === "S") grade = "A";
  const fuelBonus = Math.round(Math.max(0, Math.min(1, fuelFrac)) * 80);
  const bonus = Math.round((BASE[grade] + fuelBonus) * (BODY_MULT[body] ?? 1));
  return { grade, bonus };
}

export type LandingMetrics = {
  descent: number;
  drift: number;
  tiltDeg: number;
  /** Distance from the zone centre / zone radius, or null when the touchdown is outside every marked zone. */
  centerFrac: number | null;
  fuelFrac: number;
  assisted: boolean;
};

export type LandingRating = { stars: Stars; perfect: boolean; score: number };

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** 1-3 stars (a crash is 0 stars and never reaches this), Perfect Landing flag and a numeric score. */
export function rateLanding(m: LandingMetrics): LandingRating {
  const c = LANDING_CFG;
  const d = Math.max(0, m.descent);
  const h = Math.abs(m.drift);
  const t = Math.abs(m.tiltDeg);
  const f = m.centerFrac;
  const meets = (x: { descent: number; drift: number; tilt: number; center: number }): boolean =>
    d < x.descent && h < x.drift && t <= x.tilt && (f === null || f <= x.center);
  let stars: Stars = meets(c.stars.three) ? 3 : meets(c.stars.two) ? 2 : 1;
  if (m.assisted && stars === 3) stars = 2; // assist caps stars like it caps the grade
  const p = c.perfect;
  const perfect = !m.assisted && stars === 3 && f !== null && d < p.descent && h < p.drift && t <= p.tilt && f <= p.center;
  const w = c.score;
  const score =
    w.perStar * stars +
    Math.round(w.speed * clamp01(1 - d / c.stars.two.descent)) +
    Math.round(w.drift * clamp01(1 - h / c.stars.two.drift)) +
    Math.round(w.tilt * clamp01(1 - t / c.stars.two.tilt)) +
    (f === null ? 0 : Math.round(w.center * clamp01(1 - f))) +
    Math.round(w.fuel * clamp01(m.fuelFrac));
  return { stars, perfect, score };
}

/** Contract credit multiplier for a landing of this many stars (1 star x1.0, 2 x1.15, 3 x1.3). */
export function starMultiplier(stars: number): number {
  const s = Math.max(0, Math.min(3, Math.round(stars))) as 0 | 1 | 2 | 3;
  return LANDING_CFG.multiplier[s];
}

export type LandingBest = { stars: number; score: number };
export type LandingBests = Record<string, LandingBest>;

/**
 * Update the best stars / score for each key (a planet id and, inside a zone, the zone id: most specific key last).
 * Returns true when the most specific key had an older record and this landing beat it ("New Best!").
 */
export function updateBest(best: LandingBests, keys: string[], stars: number, score: number): boolean {
  let record = false;
  keys.forEach((k, i) => {
    const prev = best[k];
    best[k] = { stars: Math.max(stars, prev?.stars ?? 0), score: Math.max(score, prev?.score ?? 0) };
    if (i === keys.length - 1) record = !!prev && score > prev.score;
  });
  return record;
}

/** Everything the landing result panel and the share text need. */
export type LandingResult = {
  id: number;
  body: string;
  bodyName: string;
  zoneName: string | null;
  grade: LandingGrade;
  stars: Stars;
  perfect: boolean;
  score: number;
  descent: number;
  drift: number;
  tiltDeg: number;
  centerPct: number | null;
  fuelPct: number;
  assisted: boolean;
  /** Credits from the grade, and the extra Perfect Landing credits. */
  bonus: number;
  perfectBonus: number;
  badgeNew: boolean;
  newBest: boolean;
  bestStars: number;
  bestScore: number;
};
