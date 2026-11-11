// Screen placement for the destination marker. Pure function, no dependencies.
export type WaypointInput = { x: number; y: number; cx: number; cy: number; behind: boolean };
export type WaypointPlacement = { x: number; y: number; off: boolean; angle: number };

export function placeWaypoint(p: WaypointInput, w: number, h: number): WaypointPlacement {
  const left = 64;
  const right = w - 64;
  const top = 96;
  const bottom = h - 150;
  let x = (p.x * 0.5 + 0.5) * w;
  let y = (0.5 - p.y * 0.5) * h;
  if (!p.behind && x >= left && x <= right && y >= top && y <= bottom) {
    return { x, y, off: false, angle: 0 };
  }
  let dx = p.behind ? p.cx : x - w / 2;
  let dy = p.behind ? -p.cy : y - h / 2;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const tx = dx > 1e-6 ? (right - w / 2) / dx : dx < -1e-6 ? (left - w / 2) / dx : Infinity;
  const ty = dy > 1e-6 ? (bottom - h / 2) / dy : dy < -1e-6 ? (top - h / 2) / dy : Infinity;
  const t = Math.min(tx, ty);
  x = w / 2 + dx * t;
  y = h / 2 + dy * t;
  return { x, y, off: true, angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
}
