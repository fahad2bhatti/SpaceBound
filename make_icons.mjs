// SPACEBOUND: generates the app icon + splash source images into ./assets (needs sharp, installed with @capacitor/assets)
import fs from "node:fs";
import sharp from "sharp";

const BG = "#07090D";
const BLUE = "#8ECFFF";
const ORANGE = "#E8893A";
fs.mkdirSync("assets", { recursive: true });

// The mark: a planet with a glowing rim and an orange orbit with a small ship.
// Drawn on a 1024x1024 canvas; `scale` shrinks it toward the centre (safe zone for adaptive icons).
function mark(scale) {
  return `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <defs>
      <radialGradient id="planet" cx="38%" cy="34%" r="75%">
        <stop offset="0" stop-color="#4FA3F0"/>
        <stop offset="0.55" stop-color="#1B4F8F"/>
        <stop offset="1" stop-color="#08203F"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0.7" stop-color="${BLUE}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="512" cy="512" r="330" fill="url(#glow)"/>
    <circle cx="512" cy="512" r="250" fill="url(#planet)" stroke="${BLUE}" stroke-width="12"/>
    <ellipse cx="512" cy="512" rx="370" ry="120" fill="none" stroke="${ORANGE}" stroke-width="16" transform="rotate(-24 512 512)"/>
    <g transform="rotate(-24 512 512)">
      <path d="M 905 512 l -78 -40 l 26 40 l -26 40 z" fill="${ORANGE}"/>
    </g>
  </g>`;
}
const svg = (inner, w = 1024, h = 1024, bg = BG) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "") +
  inner +
  "</svg>";

async function png(file, markup, size) {
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(file);
  console.log("wrote " + file);
}

// Full icon (legacy launchers), adaptive foreground (transparent, inside safe zone), adaptive background
await png("assets/icon-only.png", svg(mark(1.0)), 1024);
await png("assets/icon-foreground.png", svg(mark(0.62), 1024, 1024, null), 1024);
await png("assets/icon-background.png", svg("", 1024, 1024, BG), 1024);

// Splash: dark with the mark in the middle (2732 is what @capacitor/assets expects)
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${BG}"/>
  <g transform="translate(866 866) scale(1)">
    <svg width="1000" height="1000" viewBox="0 0 1024 1024">${mark(1.0)}</svg>
  </g>
</svg>`;
await sharp(Buffer.from(splash)).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash-dark.png");
console.log("wrote assets/splash.png, assets/splash-dark.png");
