export type HintId = "walk" | "board" | "preflight" | "land" | "throttle" | "steer";

export type HintCtx = {
  phase: string;
  prompt: string | null;
  /** Close to the ground and coming down (see Game.tsx). */
  landing: boolean;
  touch: boolean;
  seen: readonly string[];
};

type HintDef = { id: HintId; when: (c: HintCtx) => boolean; touch: string; desktop: string };

// Order matters: the first unseen hint whose condition holds is shown.
const HINTS: readonly HintDef[] = [
  {
    id: "walk",
    when: (c) => c.phase === "pad" && c.prompt === null,
    touch: "Drag the joystick to walk to your ship.",
    desktop: "Walk with WASD. Click the scene to look around.",
  },
  {
    id: "board",
    when: (c) => c.phase === "pad" && !!c.prompt?.includes("Board"),
    touch: "Tap E to board the ship.",
    desktop: "Press E to board the ship.",
  },
  {
    id: "preflight",
    when: (c) => c.phase === "cockpit",
    touch: "Tap Tanks, Arm engines and Nav, then Ignite countdown.",
    desktop: "Confirm Tanks, Arm engines and Nav, then Ignite countdown.",
  },
  {
    id: "land",
    when: (c) => c.phase === "flight" && c.landing,
    touch: "Almost down: slow down over the beacon. ASSIST (top) levels the ship and softens touchdown.",
    desktop: "Almost down: slow down over the beacon. Press S to cut thrust and V to level the ship.",
  },
  {
    id: "throttle",
    when: (c) => c.phase === "flight",
    touch: "Hold THR+ to add thrust. THR- slows you down.",
    desktop: "Hold W to add thrust. S slows you down.",
  },
  {
    id: "steer",
    when: (c) => c.phase === "flight",
    touch: "Use the arrows to steer and follow the diamond marker. MAP (top) changes the destination.",
    desktop: "A/D steer, arrow keys pitch. Follow the diamond marker.",
  },
];

export const HINT_IDS: readonly HintId[] = HINTS.map((h) => h.id);

export function pickHint(c: HintCtx): { id: HintId; text: string } | null {
  for (const h of HINTS) {
    if (!c.seen.includes(h.id) && h.when(c)) return { id: h.id, text: c.touch ? h.touch : h.desktop };
  }
  return null;
}
