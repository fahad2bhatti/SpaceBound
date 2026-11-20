// release-signing-v1: AAB banane se pehle khatarnak ghaltiyan pakdo.
import fs from "node:fs";

const fail = (msg) => {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
};

const billing = fs.readFileSync("src/game/billing.ts", "utf8");
if (/const FORCE_TEST_BILLING\s*=\s*true/.test(billing))
  fail("src/game/billing.ts mein FORCE_TEST_BILLING = true hai. Release se pehle false karo, warna sab purchases muft hongi.");

if (!fs.existsSync("android/keystore.properties"))
  fail("android/keystore.properties nahi mili. Pehle upload key banao (steps chat mein hain).");

const props = fs.readFileSync("android/keystore.properties", "utf8");
const storeFile = /storeFile\s*=\s*(.+)/.exec(props)?.[1]?.trim();
if (!storeFile) fail("android/keystore.properties mein storeFile nahi likha.");
const keyPath = storeFile.startsWith("/") ? storeFile : "android/app/" + storeFile;
if (!fs.existsSync(keyPath)) fail("Upload key file nahi mili: " + keyPath);

const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
const code = /versionCode\s+(\d+)/.exec(gradle)?.[1];
const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
console.log(`✅ Release check theek hai. versionCode ${code}, versionName ${name}. Har naye upload par versionCode +1 karna yaad rakho.`);
