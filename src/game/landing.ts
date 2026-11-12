export type LandingGrade = "S" | "A" | "B";

export type LandingReport = { grade: LandingGrade; bonus: number };

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
  let grade: LandingGrade = "B";
  if (d < 1.2 && h < 1.5) grade = "S";
  else if (d < 2.6 && h < 3) grade = "A";
  if (assisted && grade === "S") grade = "A";
  const fuelBonus = Math.round(Math.max(0, Math.min(1, fuelFrac)) * 80);
  const bonus = Math.round((BASE[grade] + fuelBonus) * (BODY_MULT[body] ?? 1));
  return { grade, bonus };
}
