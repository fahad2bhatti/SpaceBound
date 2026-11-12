// planet-zones-v1: per-planet boundary + landing zone config. Add a planet by adding one entry here.
import type { BodyId } from "./catalog";

export type ZoneKind = "easy" | "hard" | "bonus";

export type ZoneDef = {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Surface distance (world units) from the primary zone (index 0). 0 = the primary zone itself. */
  arc: number;
  /** Direction around the primary zone, degrees. */
  az: number;
  /** Landing disc radius (surface units). Landing assist widens it by 1.5x. */
  radius: number;
  /** Touchdown limits inside this zone. Hard zones are tighter. */
  maxDescent: number;
  maxDrift: number;
  /** One-time credits the first time the zone is landed on. */
  reward: number;
};

export type PlanetCfg = {
  /** Altitude above the surface where the boundary sphere starts. */
  boundary: number;
  /** HUD word: "Entering Mars Atmosphere" / "Entering Moon Boundary". */
  label: string;
  /** Scanner reach, in surface units, measured from the point under the ship. */
  scanRange: number;
  /** Seconds between automatic scanner pings. */
  scanEvery: number;
  /** HUD edge-glow colour. */
  tint: string;
  /** Zone 0 is the beacon pad that navigation already points at (always known). No zones = no surface. */
  zones: ZoneDef[];
};

export const KIND_LABEL: Record<ZoneKind, string> = { easy: "EASY", hard: "HARD", bonus: "BONUS" };
export const ZONE_COLORS: Record<ZoneKind, number> = { easy: 0x8ecfff, hard: 0xe8893a, bonus: 0xffd166 };

const EASY = { maxDescent: 6, maxDrift: 4.8 };
const HARD = { maxDescent: 4.3, maxDrift: 3.1 };
const BONUS = { maxDescent: 4.6, maxDrift: 3.4 };

export const PLANETS: Record<BodyId, PlanetCfg> = {
  earth: {
    boundary: 14,
    label: "Atmosphere",
    scanRange: 0,
    scanEvery: 4,
    tint: "#7eb6ff",
    // Earth stays a single pad: landing there always returns you to the Northline spaceport.
    zones: [{ id: "earth-pad", name: "Northline Pad", kind: "easy", arc: 0, az: 0, radius: 4.4, ...EASY, reward: 0 }],
  },
  moon: {
    boundary: 9,
    label: "Boundary",
    scanRange: 9,
    scanEvery: 4,
    tint: "#c5c8ce",
    zones: [
      { id: "moon-beacon", name: "Beacon Pad", kind: "easy", arc: 0, az: 0, radius: 3.2, ...EASY, reward: 0 },
      { id: "moon-flats", name: "Tranquil Flats", kind: "easy", arc: 8, az: 30, radius: 2.7, ...EASY, reward: 0 },
      { id: "moon-rille", name: "Rille Ridge", kind: "hard", arc: 8.4, az: 140, radius: 2.0, ...HARD, reward: 250 },
      { id: "moon-crater", name: "Shadow Crater", kind: "hard", arc: 8, az: 235, radius: 1.9, ...HARD, reward: 300 },
      { id: "moon-mesa", name: "Silver Mesa", kind: "bonus", arc: 12.5, az: 330, radius: 2.2, ...BONUS, reward: 800 },
    ],
  },
  mars: {
    boundary: 11,
    label: "Atmosphere",
    scanRange: 11.5,
    scanEvery: 4,
    tint: "#c4654a",
    zones: [
      { id: "mars-beacon", name: "Beacon Plain", kind: "easy", arc: 0, az: 0, radius: 3.2, ...EASY, reward: 0 },
      { id: "mars-dunes", name: "Dune Basin", kind: "easy", arc: 10, az: 40, radius: 2.8, ...EASY, reward: 0 },
      { id: "mars-canyon", name: "Canyon Rim", kind: "hard", arc: 10.5, az: 150, radius: 2.0, ...HARD, reward: 250 },
      { id: "mars-ridge", name: "Ares Ridge", kind: "hard", arc: 10, az: 250, radius: 1.9, ...HARD, reward: 300 },
      { id: "mars-olympus", name: "Olympus Foot", kind: "bonus", arc: 15.5, az: 320, radius: 2.3, ...BONUS, reward: 900 },
    ],
  },
  // Gas giants: atmosphere effects only, no surface, so no zones.
  jupiter: { boundary: 16, label: "Atmosphere", scanRange: 0, scanEvery: 4, tint: "#d2b48c", zones: [] },
  saturn: { boundary: 14, label: "Atmosphere", scanRange: 0, scanEvery: 4, tint: "#e6d3a3", zones: [] },
  uranus: { boundary: 12, label: "Atmosphere", scanRange: 0, scanEvery: 4, tint: "#9fd6d2", zones: [] },
  neptune: { boundary: 12, label: "Atmosphere", scanRange: 0, scanEvery: 4, tint: "#3d6fbf", zones: [] },
};
