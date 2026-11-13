// contracts-v1: ALL contract content lives here. Adding a mission = adding one object to CONTRACTS.
// No engine change needed as long as it only uses existing objective types (see objectives.ts).
//
// Example (copy, change, done):
//   {
//     id: "moon-rush", title: "Moon Rush", description: "Quick hop to the Moon and back.",
//     type: "delivery", difficulty: "normal", planet: "moon", target: "Tranquil Flats",
//     timeLimit: 600,                                   // seconds at normal difficulty
//     objectives: [
//       { id: "land", type: "landAtZone", label: "Land at Tranquil Flats", params: { body: "moon", zone: "moon-flats" } },
//       { id: "home", type: "returnToEarth", label: "Return to Earth", params: {} },
//     ],
//     reward: { credits: 1500, xp: 120 },
//     requirements: { minRange: 210 },                  // Moon route rating
//   },
import type { ContractDef, Difficulty, Spot } from "./types";

/** Time (and EVA oxygen) multiplier per difficulty. Bigger = more generous. */
export const DIFFICULTY: Record<Difficulty, { label: string; time: number }> = {
  easy: { label: "Easy", time: 1.4 },
  normal: { label: "Normal", time: 1 },
  hard: { label: "Hard", time: 0.75 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];

// Cargo crate on the Northline pad, between the walk-in point and the ship.
const PAD_CRATE: Spot = { scene: "pad", x: 6.2, z: 3.2, label: "Load cargo" };
// Drop marker on the Moon/Mars surface, 9 m from the landed ship on open ground (clear of rocks and craters).
const dropPoint = (body: "moon" | "mars", label: string): Spot => ({ scene: "surface", body, x: -9, z: 0, label });

// Stranded crew stand in a row around this point, 9 m from the landed ship (same clear ground as dropPoint).
const crewPoint = (body: "moon" | "mars"): Spot => ({ scene: "surface", body, x: -9, z: 0, label: "Rescue crew member" });

// Spacewalk repair points, in station-local units (see buildStation in engine.ts: the module lies along x, panels along +-z).
const evaPoint = (x: number, y: number, z: number, label: string): Spot => ({ scene: "eva", x, y, z, label });
const SP_ANTENNA = (): Spot => evaPoint(-1.8, 1.4, 0, "Repair antenna relay");
const SP_HULL = (): Spot => evaPoint(1.5, 0.1, 1.4, "Patch hull seam");
const SP_PANEL = (): Spot => evaPoint(0.8, 0.6, 3.4, "Re-seat solar panel");
const SP_UNDER = (): Spot => evaPoint(-0.4, -1.4, 0, "Replace coolant valve");

// Moon route rating is 210, Mars 470 (catalog BODIES). Starter ship range is only 90, so the farther
// contracts need a bigger ship: that is what "requirements.minRange" is for.
export const CONTRACTS: ContractDef[] = [
  // ---------------------------------------------------------------- EASY
  {
    id: "orbital-cargo",
    title: "Orbital Cargo Run",
    description: "Load a sealed crate, carry it up to the parking orbit and bring the ship home.",
    type: "delivery",
    difficulty: "easy",
    planet: "earth",
    target: "Low Earth orbit",
    timeLimit: 360,
    objectives: [
      { id: "load", type: "collectItem", label: "Load the cargo crate on the pad", params: { item: "cargo", at: PAD_CRATE } },
      { id: "orbit", type: "reachLocation", label: "Reach the parking orbit", params: { dest: "orbit", radius: 12 } },
      { id: "home", type: "returnToEarth", label: "Land back on Earth", params: {} },
    ],
    reward: { credits: 600, xp: 60 },
  },
  {
    id: "station-courier",
    title: "Station Courier",
    description: "Take the diplomatic pouch up to the crewed platform and come straight back.",
    type: "delivery",
    difficulty: "easy",
    planet: "earth",
    target: "Orbital station",
    timeLimit: 420,
    objectives: [
      { id: "load", type: "collectItem", label: "Pick up the courier pouch", params: { item: "pouch", at: PAD_CRATE } },
      { id: "station", type: "reachLocation", label: "Close in on the station", params: { dest: "station", radius: 9, maxSpeed: 10 } },
      { id: "home", type: "returnToEarth", label: "Land back on Earth", params: {} },
    ],
    reward: { credits: 750, xp: 75 },
  },
  {
    id: "moon-rescue-solo",
    title: "Lone Survivor",
    description: "A technician is stranded at Tranquil Flats with a failing air supply. Land, pick them up and fly home before the air runs out.",
    type: "rescue",
    difficulty: "easy",
    planet: "moon",
    target: "Tranquil Flats",
    timeLimit: 540,
    objectives: [
      { id: "land", type: "landAtZone", label: "Land at Tranquil Flats", params: { body: "moon", zone: "moon-flats" } },
      { id: "crew", type: "rescueCrew", label: "Rescue the stranded technician", params: { at: crewPoint("moon"), count: 1 } },
      { id: "home", type: "returnToEarth", label: "Bring them home to Earth", params: {} },
    ],
    reward: { credits: 1200, xp: 100, crewBonus: { credits: 200, xp: 20 } },
    requirements: { minRange: 210 },
  },
  // -------------------------------------------------------------- NORMAL
  {
    // The end-to-end test mission: pick up -> land in a marked zone -> deliver on foot -> come home.
    id: "moon-cargo",
    title: "Cargo Delivery to Moon",
    description: "A research crate is waiting on the pad. Land it at Tranquil Flats, hand it over on foot, then fly home.",
    type: "delivery",
    difficulty: "normal",
    planet: "moon",
    target: "Tranquil Flats",
    timeLimit: 600,
    objectives: [
      { id: "load", type: "collectItem", label: "Load the cargo crate on the pad", params: { item: "cargo", at: PAD_CRATE } },
      { id: "land", type: "landAtZone", label: "Land at Tranquil Flats", params: { body: "moon", zone: "moon-flats" } },
      { id: "deliver", type: "deliverTo", label: "Deliver the cargo at the marker", params: { item: "cargo", at: dropPoint("moon", "Deliver cargo") } },
      { id: "home", type: "returnToEarth", label: "Return to Earth", params: {} },
    ],
    reward: { credits: 1800, xp: 150 },
    requirements: { minRange: 210 },
  },
  {
    id: "lunar-survey",
    title: "Lunar Survey Walk",
    description: "Set down near the beacon and log twenty-five seconds of suit time on the surface. Mind your oxygen.",
    type: "survey",
    difficulty: "normal",
    planet: "moon",
    target: "Beacon Pad",
    timeLimit: 600,
    oxygenLimit: 120,
    objectives: [
      { id: "land", type: "landAtZone", label: "Land on the Moon", params: { body: "moon" } },
      { id: "walk", type: "surviveTime", label: "Survey on foot", params: { seconds: 25, where: "surface" } },
      { id: "home", type: "returnToEarth", label: "Return to Earth", params: {} },
    ],
    reward: { credits: 1500, xp: 130 },
    requirements: { minRange: 210 },
  },
  {
    id: "moon-rescue-pair",
    title: "Crater Rescue",
    description: "Two crew are cut off near the Beacon Pad and their oxygen is draining. Pick up both and make it back to Earth.",
    type: "rescue",
    difficulty: "normal",
    planet: "moon",
    target: "Beacon Pad",
    timeLimit: 480,
    objectives: [
      { id: "land", type: "landAtZone", label: "Land at the Beacon Pad", params: { body: "moon", zone: "moon-beacon" } },
      { id: "crew", type: "rescueCrew", label: "Rescue both stranded crew", params: { at: crewPoint("moon"), count: 2 } },
      { id: "home", type: "returnToEarth", label: "Bring them home to Earth", params: {} },
    ],
    reward: { credits: 2400, xp: 190, crewBonus: { credits: 300, xp: 30 } },
    requirements: { minRange: 210 },
  },
  // ---------------------------------------------------------------- HARD
  {
    id: "mars-supply",
    title: "Mars Supply Drop",
    description: "Haul a supply crate to Dune Basin on Mars, deliver it on foot and make it back.",
    type: "delivery",
    difficulty: "hard",
    planet: "mars",
    target: "Dune Basin",
    timeLimit: 960,
    oxygenLimit: 150,
    objectives: [
      { id: "load", type: "collectItem", label: "Load the supply crate on the pad", params: { item: "supplies", at: PAD_CRATE } },
      { id: "land", type: "landAtZone", label: "Land at Dune Basin", params: { body: "mars", zone: "mars-dunes" } },
      { id: "deliver", type: "deliverTo", label: "Deliver the supplies at the marker", params: { item: "supplies", at: dropPoint("mars", "Deliver supplies") } },
      { id: "home", type: "returnToEarth", label: "Return to Earth", params: {} },
    ],
    reward: { credits: 4200, xp: 320 },
    requirements: { minRange: 470 },
  },
  {
    id: "rille-ridge",
    title: "Rille Ridge Precision",
    description: "A survey beacon needs to sit on Rille Ridge. Tight landing limits, so fly it by hand.",
    type: "delivery",
    difficulty: "hard",
    planet: "moon",
    target: "Rille Ridge",
    timeLimit: 720,
    objectives: [
      { id: "load", type: "collectItem", label: "Load the survey beacon on the pad", params: { item: "beacon", at: PAD_CRATE } },
      { id: "land", type: "landAtZone", label: "Land inside Rille Ridge", params: { body: "moon", zone: "moon-rille" } },
      { id: "home", type: "returnToEarth", label: "Return to Earth", params: {} },
    ],
    reward: { credits: 3400, xp: 260 },
    requirements: { minRange: 210 },
  },
  {
    id: "mars-rescue-trio",
    title: "Dune Basin Rescue",
    description: "Three crew are stranded on Mars and the clock is against you. Land at Dune Basin, get all three aboard and fly home.",
    type: "rescue",
    difficulty: "hard",
    planet: "mars",
    target: "Dune Basin",
    timeLimit: 800,
    oxygenLimit: 150,
    objectives: [
      { id: "land", type: "landAtZone", label: "Land at Dune Basin", params: { body: "mars", zone: "mars-dunes" } },
      { id: "crew", type: "rescueCrew", label: "Rescue all three crew", params: { at: crewPoint("mars"), count: 3 } },
      { id: "home", type: "returnToEarth", label: "Bring them home to Earth", params: {} },
    ],
    reward: { credits: 5200, xp: 380, crewBonus: { credits: 400, xp: 40 } },
    requirements: { minRange: 470 },
  },
  // ------------------------------------------------------------ EVA REPAIR (station sits on the Earth-Moon route, route rating 80)
  {
    id: "eva-quick-fix",
    title: "Antenna Quick Fix",
    description: "Vesper Station lost its antenna relay. Park close, suit up, fix it and come back inside.",
    type: "eva-repair",
    difficulty: "easy",
    planet: "earth",
    target: "Vesper Station",
    timeLimit: 600,
    oxygenLimit: 180,
    objectives: [
      { id: "station", type: "reachLocation", label: "Park next to Vesper Station", params: { dest: "station", radius: 9, maxSpeed: 8 } },
      { id: "r1", type: "repairPoint", label: "Repair the antenna relay", params: { at: SP_ANTENNA(), seconds: 4, label: "Repair antenna relay" } },
      { id: "back", type: "returnToShuttle", label: "Return to the shuttle airlock", params: {} },
      { id: "home", type: "returnToEarth", label: "Land back on Earth", params: {} },
    ],
    reward: { credits: 1100, xp: 90 },
    requirements: { minRange: 80 },
  },
  {
    id: "eva-station-service",
    title: "Station Service Call",
    description: "Three faults on the outside of the station. The solar panel needs three bolts re-seated in order.",
    type: "eva-repair",
    difficulty: "normal",
    planet: "earth",
    target: "Vesper Station",
    timeLimit: 720,
    oxygenLimit: 170,
    objectives: [
      { id: "station", type: "reachLocation", label: "Park next to Vesper Station", params: { dest: "station", radius: 9, maxSpeed: 8 } },
      { id: "r1", type: "repairPoint", label: "Repair the antenna relay", params: { at: SP_ANTENNA(), seconds: 4, label: "Repair antenna relay" } },
      { id: "r2", type: "repairPoint", label: "Patch the hull seam", params: { at: SP_HULL(), seconds: 5, label: "Patch hull seam" } },
      { id: "r3", type: "repairPoint", label: "Re-seat the solar panel (3 bolts)", params: { at: SP_PANEL(), seconds: 3, label: "Re-seat solar panel", bolts: 3 } },
      { id: "back", type: "returnToShuttle", label: "Return to the shuttle airlock", params: {} },
      { id: "home", type: "returnToEarth", label: "Land back on Earth", params: {} },
    ],
    reward: { credits: 2600, xp: 200 },
    requirements: { minRange: 80 },
  },
  {
    id: "eva-debris-storm",
    title: "Debris Field Repair",
    description: "A debris cloud shredded the station. Four repairs, loose debris drifting around, and very little air.",
    type: "eva-repair",
    difficulty: "hard",
    planet: "earth",
    target: "Vesper Station",
    timeLimit: 780,
    oxygenLimit: 200,
    hazards: { debris: 3 },
    objectives: [
      { id: "station", type: "reachLocation", label: "Park next to Vesper Station", params: { dest: "station", radius: 9, maxSpeed: 8 } },
      { id: "r1", type: "repairPoint", label: "Repair the antenna relay", params: { at: SP_ANTENNA(), seconds: 5, label: "Repair antenna relay" } },
      { id: "r2", type: "repairPoint", label: "Patch the hull seam", params: { at: SP_HULL(), seconds: 6, label: "Patch hull seam" } },
      { id: "r3", type: "repairPoint", label: "Re-seat the solar panel (3 bolts)", params: { at: SP_PANEL(), seconds: 4, label: "Re-seat solar panel", bolts: 3 } },
      { id: "r4", type: "repairPoint", label: "Replace the coolant valve", params: { at: SP_UNDER(), seconds: 6, label: "Replace coolant valve" } },
      { id: "back", type: "returnToShuttle", label: "Return to the shuttle airlock", params: {} },
      { id: "home", type: "returnToEarth", label: "Land back on Earth", params: {} },
    ],
    reward: { credits: 5000, xp: 360 },
    requirements: { minRange: 80 },
  },
];

export function findContract(id: string): ContractDef | undefined {
  return CONTRACTS.find((c) => c.id === id);
}

/** Effective time / oxygen allowance for a contract after the difficulty multiplier, in whole seconds. */
export function scaledLimit(def: ContractDef, base: number | undefined): number | null {
  if (base === undefined) return null;
  return Math.round(base * DIFFICULTY[def.difficulty].time);
}
