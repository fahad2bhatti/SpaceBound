// missions-guide-v1: har planet ki guide + mission ko planet se jodne ke helpers. Pure TypeScript (no three.js / DOM).
// Numbers (route, SOI, gravity, zones, score multiplier) catalog / planets / landing se aate hain, taake config badle to guide khud sahi rahe.
import { BODIES, SHIP_LIST, gateShip, type BodyId, type DestId, type MissionDef, type ShipDef } from "./catalog";
import { BODY_MULT } from "./landing";
import { KIND_LABEL, PLANETS } from "./planets";

export type PlaceId = BodyId;

/** Order shown in the Missions screen strip. Earth also covers the parking orbit and Vesper Station. */
export const PLACE_ORDER: PlaceId[] = ["earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];

export const PLACE_TAG: Record<PlaceId, string> = {
  earth: "Home · orbit · station",
  moon: "Rock · 210 su",
  mars: "Rust · 470 su",
  jupiter: "Gas giant · 900 su",
  saturn: "Gas giant · 1380 su",
  uranus: "Ice giant · 2150 su",
  neptune: "Ice giant · 2700 su",
};

export type GuideSection = { title: string; lines: string[] };

export type Guide = {
  place: PlaceId;
  name: string;
  summary: string;
  facts: { label: string; value: string }[];
  sections: GuideSection[];
};

/** Destination point -> the planet it belongs to on the Missions screen. */
export function placeOfDest(dest: DestId | null): PlaceId {
  if (!dest || dest === "orbit" || dest === "station" || dest === "earth") return "earth";
  return dest as PlaceId;
}

export function placeOfMission(m: MissionDef): PlaceId {
  return placeOfDest(m.dest);
}

const SUN_WARNING =
  "Never fly toward the Sun. Heat drains life support fast, the ship shakes and an alarm sounds. A solar wall stops you and an overheated ship is sent back to Earth orbit.";

const STATIC: Record<PlaceId, { summary: string; reach: string[]; landing: string[]; onFoot: string[]; danger: string[] }> = {
  earth: {
    summary: "Northline Launch Complex. Every trip starts and ends here. Vesper Station waits on the Earth-Moon route.",
    reach: [
      "Walk to your ship, board, finish preflight and wait out the countdown.",
      "Raise throttle (W, or THR+ on the phone) and let the gravity turn carry you up. Up/Down arrows only pitch the nose.",
      "Parking orbit: hold between 5.4 and 18 altitude above Earth for about 6 seconds.",
      "Vesper Station is 75 su from Earth on the Moon route. Come within 8 su below 8 su/s to log the visit.",
    ],
    landing: [
      "Landing on Earth always sets you down at the Northline pad. Land the ship to finish a return mission.",
      "Earth landings pay a quarter of the normal grade bonus, so do not farm them.",
    ],
    onFoot: [
      "At the station, press E within 9 su and below 8 su/s to start a spacewalk (EVA). Hold E on the glowing marker to repair.",
      "EVA oxygen drains faster the farther you drift from the shuttle. Press E near the airlock to get back in.",
    ],
    danger: [SUN_WARNING],
  },
  moon: {
    summary: "Airless, sharp and close enough to get wrong in a hurry. The first real landing.",
    reach: [
      "Plot the Moon from the Solar chart (or the Plot button on a mission) and fly until the sphere of influence message appears.",
      "A starter-class hull cannot reach it: check that your ship's certified range covers the route.",
    ],
    landing: [
      "Hover over the beacon and bleed speed before touchdown. Too fast and the ship bounces back up.",
      "Landing assist helps near the ground, and widens every zone by 1.5x.",
    ],
    onFoot: [
      "Press E to step out. Collect the three glowing samples for the sample mission, then walk back to the ship.",
      "Oxygen drains while you are on foot. Watch the bar and head back early.",
    ],
    danger: ["Low gravity: the ship drifts more than you expect. Kill sideways speed before you commit to the descent."],
  },
  mars: {
    summary: "Thin air, rust dunes and a beacon on the dawn plain.",
    reach: [
      "Plot Mars and fly until its sphere of influence message appears. It is a long burn: refuel before you leave.",
      "Mars needs a bigger hull than the Moon. Check the range line on the Solar chart.",
    ],
    landing: [
      "The thin atmosphere gives a little drag, but not enough to brake for you. Slow down early.",
      "Landing score is multiplied 1.5x on Mars.",
    ],
    onFoot: ["Collect the three surface samples and return to the ship. Dune Basin is the open ground used by delivery and rescue contracts."],
    danger: ["Hard zones (Canyon Rim, Ares Ridge) are small and strict. Take them only with fuel to spare."],
  },
  jupiter: {
    summary: "The first gas giant. No rock to land on, but a cloud deck you can touch down on.",
    reach: [
      "Plot Jupiter and fly to the cloud-deck beacon. Passing within 8 su logs the flyby and pays the mission.",
      "Check the Needs line above: the route is 900 su, so a short-range hull will not make it.",
    ],
    landing: [
      "Hover over the storm bands and ease down slowly. Landing assist only switches on close to the cloud deck.",
      "The flyby beacon must be logged first, or the landing mission will not pay.",
    ],
    onFoot: ["You can step out on the cloud deck with E. Oxygen drains as on any surface, so keep the walk short."],
    danger: ["Strong gravity pulls the ship down hard. Keep throttle up while hovering and watch fuel."],
  },
  saturn: {
    summary: "Rings, a science beacon and a calm cloud-deck pad.",
    reach: [
      "Plot Saturn and thread the ring-plane beacon. Passing within 8 su logs the flyby.",
      "The route is 1380 su. Check the Needs line above before you plot it.",
    ],
    landing: ["The cloud-deck pad is the calmest deep-space landing in the catalog. Land gently and the bonus is worth it."],
    onFoot: ["Step out with E for survey contracts. Stay close to the ship."],
    danger: ["Do not cut through the ring plane at speed: slow down near the beacon, then break off."],
  },
  uranus: {
    summary: "Cold ice giant. A survey beacon and a frozen cloud-deck pad.",
    reach: [
      "Plot Uranus and reach the survey beacon (8 su) to log the survey.",
      "The route is 2150 su. Only the longest-range hulls are rated for it.",
    ],
    landing: ["Touch down on the frozen cloud deck. Fuel is the real problem here: plan the return burn before you descend."],
    onFoot: ["Survey contracts ask for a walk on the deck. Keep an eye on oxygen."],
    danger: ["Trip time is long. Contract timers are generous but not endless, so do not wander."],
  },
  neptune: {
    summary: "The far marker of this catalog. Fly the beacon, land on the cloud deck, come home.",
    reach: [
      "Plot Neptune and reach the final beacon (8 su) to finish the survey.",
      "The route is 2700 su. Only the longest-range hulls can fly it.",
    ],
    landing: [
      "The deepest cloud-deck landing pays the biggest landing multiplier.",
      "Fuel the ship fully before the trip. Refuelling far from Earth costs double.",
    ],
    onFoot: ["Survey contracts ask for a walk on the deck. Keep it short."],
    danger: ["This is the farthest point you can fly to. Finishing the Neptune survey opens the galaxy-class ships in the garage."],
  },
};

function zoneLines(id: PlaceId): string[] {
  const cfg = PLANETS[id];
  if (id === "earth" || !cfg.zones.length) return [];
  return cfg.zones.map((z) => {
    const pay = z.reward > 0 ? ` · first landing +${z.reward} CR` : "";
    return `${z.name} (${KIND_LABEL[z.kind]}) · descent ≤ ${z.maxDescent}, drift ≤ ${z.maxDrift}${pay}`;
  });
}

export function guideFor(place: PlaceId): Guide {
  const def = BODIES[place];
  const s = STATIC[place];
  const mult = BODY_MULT[place] ?? 1;
  const facts: Guide["facts"] = [];
  if (place !== "earth") {
    facts.push({ label: "Route", value: `${def.route} su` });
    facts.push({ label: "Needs", value: gateShip(def.route).name });
  }
  facts.push({ label: "Gravity", value: `${def.g}` });
  facts.push({ label: "Type", value: def.gas ? "Cloud deck" : def.atmo > 0 ? "Rock, thin air" : "Rock, airless" });
  facts.push({ label: "Landing pay", value: `x${mult}` });

  const sections: GuideSection[] = [
    { title: "Getting there", lines: s.reach },
    { title: "Landing", lines: s.landing },
  ];
  const zl = zoneLines(place);
  if (zl.length) sections.push({ title: "Landing zones", lines: zl });
  sections.push({ title: "On foot", lines: s.onFoot });
  sections.push({ title: "Dangers", lines: s.danger });

  return { place, name: def.name, summary: s.summary, facts, sections };
}

/** Ships that a given mission opens in the garage (SHIP_LIST[].unlock is the real gate). */
export function shipsUnlockedBy(missionId: string): ShipDef[] {
  return SHIP_LIST.filter((sh) => sh.unlock === missionId);
}

/** solar-sun-v1: Sun ka info card (Solar chart). Sun destination nahi hai, isliye DESTS mein nahi. */
export const SUN_GUIDE = {
  name: "Sun",
  summary: "The star at the centre of the chart. Not a destination: you cannot land on it, orbit it or set it as a nav target.",
  lines: [
    SUN_WARNING,
    "In the flight view the Sun sits far away in one fixed direction: the side the light comes from. The chart is not to scale.",
    "If you see the solar heat warning, turn away at once. Steering toward the nav marker keeps you well clear.",
  ],
} as const;
