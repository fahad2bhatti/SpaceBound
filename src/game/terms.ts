// welcome-gate-v1: terms text, version and age helper.
import type { AgeGroup } from "./save";

/** Terms badalne par is number ko badhao: sab players se dobara accept karwaya jayega. */
export const TERMS_VERSION = 1;

/** Apna contact email yahan likho (khali ho to terms mein contact line nahi dikhti). */
export const CONTACT_EMAIL = "fahadsaeed2622@gmail.com";

export const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: "About the game",
    body: "SPACEBOUND: BEYOND EARTH is an original single-player space flight game by Fahad Apps. The ships, places and missions are fictional.",
  },
  {
    title: "Your data",
    body: "The game works offline. Your progress and settings are saved only on this device. We do not ask for your name, email or an account, we do not collect personal data, and there are no ads or tracking. If you uninstall the app or clear its data, your progress is lost. If online features (like leaderboards) are added later, you will be asked first and these terms will be updated.",
  },
  {
    title: "Age",
    body: "We ask your date of birth once, only to set up the right experience. Only your age group is kept on this device, not your birth date. If you are under 13 (or under the age of digital consent where you live), please ask a parent or guardian to read and agree to these terms with you.",
  },
  {
    title: "Credits and items",
    body: "Credits, ships and upgrades exist only inside the game. They have no real-world value and cannot be bought, sold or cashed out.",
  },
  {
    title: "Fair use",
    body: "You may play the game for personal, non-commercial use. Please do not copy, resell or redistribute the game, or pass it off as your own.",
  },
  {
    title: "No warranty",
    body: "The game is provided as is and may contain bugs. It includes camera shake and bright flashes, so take regular breaks and stop if you feel unwell.",
  },
  {
    title: "Changes",
    body: "We may update these terms. When they change in a meaningful way, the game will ask you to accept them again.",
  },
];

/** Date of birth -> age group. Galat tareekh (31 Feb, mustaqbil, 120 saal se purani) par null. */
export function ageGroupFromBirth(year: number, month: number, day: number, now: Date = new Date()): AgeGroup | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  let age = now.getFullYear() - year;
  if (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day)) age--;
  if (age < 0 || age > 120) return null;
  if (age < 13) return "child";
  if (age < 18) return "teen";
  return "adult";
}
