// autopilot-v1: pure math for the AUTO button. No three.js, so it can be tested in Node.
// The engine asks plan() every frame and turns the answer into steering, throttle and braking.
//
// What it does, in order:
//   1. Climb: near a planet that is not the target, point mostly "up" until the ship is clear of its atmosphere.
//   2. Avoid: if a planet sits on the straight line to the target, aim for a point beside that planet instead.
//   3. Cruise: full throttle towards the target.
//   4. Approach: slow down so the ship arrives at about `arriveSpeed`, then report "arrived" (the engine hands control back).

export type V3 = [number, number, number];

export type ApBody = {
  id: string;
  /** Centre of the planet. */
  c: V3;
  /** Planet radius. */
  r: number;
  /** Altitude above the surface that counts as "clear" (top of the atmosphere plus a margin). */
  clear: number;
};

export type ApInput = {
  pos: V3;
  vel: V3;
  /** The point to fly to (already lifted above the surface for landing targets). */
  target: V3;
  /** Distance from the target that counts as arrived. */
  arrive: number;
  /** Max speed the ship may fly right now. */
  cap: number;
  bodies: ApBody[];
  /** Planet the target belongs to (allowed to fly close to it), or null (station, deep-space gate). */
  targetBody: string | null;
  /** Lowest altitude over the target planet the autopilot may go. Below it, it climbs. 0 = no floor. */
  floor: number;
};

export type ApPhase = "climb" | "cruise" | "approach" | "arrived";

export type ApOutput = {
  phase: ApPhase;
  /** Unit vector the nose should point at. */
  dir: V3;
  /** 0..1 */
  throttle: number;
  /** 0..1, how hard to brake this frame. */
  brake: number;
  /** Distance to the target. */
  dist: number;
};

/** How fast the autopilot plans to slow down (units / s^2). Lower = earlier, gentler braking. */
export const AP_DECEL = 1.8;
/** Near a planet gravity also pulls, so plan the braking earlier. */
export const AP_DECEL_PLANET = 1.2;
/** Speed the autopilot aims to have when it reaches the target. */
export const AP_ARRIVE_SPEED = 2.5;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};

/** Any vector at right angles to `a`. */
function perp(a: V3): V3 {
  const p: V3 = Math.abs(a[1]) < 0.9 ? [a[2], 0, -a[0]] : [0, a[2], -a[1]];
  return norm(p);
}

/**
 * If a planet blocks the straight line pos -> goal, return a detour point beside it. Otherwise null.
 * The planet the target belongs to is only an obstacle for its solid body (we may fly through its atmosphere to land).
 */
export function detour(pos: V3, goal: V3, bodies: ApBody[], targetBody: string | null): V3 | null {
  const d = sub(goal, pos);
  const dist = len(d);
  if (dist < 1e-6) return null;
  const dn = mul(d, 1 / dist);
  let best: { t: number; point: V3 } | null = null;
  for (const b of bodies) {
    const safe = b.id === targetBody ? b.r + 2.5 : b.r + b.clear * 0.8 + 2;
    // We are already inside that zone (just took off, or landing there): the climb rule handles it.
    if (len(sub(pos, b.c)) < safe) continue;
    // The goal itself sits inside the zone (a beacon low over this planet): only the solid ball blocks.
    const goalInside = len(sub(goal, b.c)) < safe;
    const keep = goalInside ? b.r + 2.5 : safe;
    const t = dot(sub(b.c, pos), dn);
    if (t <= 0 || t >= dist) continue;
    const closest = add(pos, mul(dn, t));
    const off = sub(closest, b.c);
    const m = len(off);
    if (m >= keep) continue;
    if (goalInside && t > dist - (b.r + 2.5)) continue; // the goal is on the near side of the ball
    const away = m > 1e-6 ? mul(off, 1 / m) : perp(dn);
    const point = add(b.c, mul(away, keep + 4));
    if (!best || t < best.t) best = { t, point };
  }
  return best ? best.point : null;
}

export function plan(i: ApInput): ApOutput {
  const toT = sub(i.target, i.pos);
  const dist = len(toT);
  const speed = len(i.vel);
  if (dist <= i.arrive) {
    return { phase: "arrived", dir: norm(speed > 0.1 ? i.vel : toT), throttle: 0, brake: 1, dist };
  }

  // 1. Climb out of a planet we are leaving.
  let nearest: ApBody | null = null;
  let nearestAlt = Infinity;
  for (const b of i.bodies) {
    const alt = len(sub(i.pos, b.c)) - b.r;
    if (alt < nearestAlt) {
      nearestAlt = alt;
      nearest = b;
    }
  }
  if (nearest && nearest.id !== i.targetBody && nearestAlt < nearest.clear) {
    const up = norm(sub(i.pos, nearest.c));
    const side = sub(toT, mul(up, dot(toT, up)));
    const sideN = len(side) > 1e-6 ? norm(side) : perp(up);
    // Mostly up, leaning a little towards the target so the turn later is short.
    const dir = norm(add(mul(up, 1), mul(sideN, 0.35)));
    return { phase: "climb", dir, throttle: 1, brake: 0, dist };
  }

  // 1b. Floor over the target planet: never sink below it (gravity + overshoot used to fly it into the ground).
  const tb = i.targetBody ? i.bodies.find((b) => b.id === i.targetBody) : undefined;
  if (tb && i.floor > 0) {
    const rel = sub(i.pos, tb.c);
    const alt = len(rel) - tb.r;
    if (alt < i.floor) {
      const up = norm(rel);
      const side = sub(toT, mul(up, dot(toT, up)));
      const dir = norm(add(up, len(side) > 1e-6 ? mul(norm(side), 0.6) : [0, 0, 0]));
      const sinking = dot(i.vel, up) < 0;
      return { phase: "approach", dir, throttle: 1, brake: sinking ? 0.6 : 0, dist };
    }
  }

  // 2. Go round planets in the way.
  const via = detour(i.pos, i.target, i.bodies, i.targetBody);
  const aim = via ?? i.target;
  const dir = norm(sub(aim, i.pos));

  // 3 / 4. Speed: the fastest speed from which we can still slow to AP_ARRIVE_SPEED by the target.
  const room = Math.max(0, dist - i.arrive);
  const decel = tb ? AP_DECEL_PLANET : AP_DECEL;
  const want = Math.min(i.cap, Math.sqrt(AP_ARRIVE_SPEED * AP_ARRIVE_SPEED + 2 * decel * room));
  const approach = want < i.cap * 0.98 && !via;
  // Speed in the direction we want to go: moving the wrong way counts as "too slow".
  const along = dot(i.vel, dir);
  let throttle = along < want ? 1 : 0;
  // Close to the target, ease the throttle instead of on/off.
  if (approach && along < want) throttle = Math.min(1, 0.35 + (want - along) / Math.max(1, want));
  const brake = speed > want ? Math.min(1, (speed - want) / Math.max(1.5, want)) : 0;
  // Never push and brake at the same time.
  if (brake > 0.05) throttle = 0;
  return { phase: approach ? "approach" : "cruise", dir, throttle, brake, dist };
}
