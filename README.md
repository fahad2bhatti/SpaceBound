# SpaceBound: Beyond Earth

A 3D space-shuttle game for Android. Walk the spaceport, pick a ship, launch, fly to Earth orbit, the Moon and the planets, land, explore on foot and fly home.

Developed by **Fahad Apps** · Android · Status: Google Play closed testing

## Features

- **Flight**: countdown and launch, throttle, RCS, pitch and steer (the ship goes where the nose points), an on-screen destination marker, a corner mini-map and a solar-system map that shows where you are
- **Autopilot**: one AUTO button climbs off the planet, flies round planets in the way and slows down at the target. Touch any control to take over
- **Places**: Earth orbit, Vesper Station, the Moon, Mars, and cloud-deck landings on Jupiter, Saturn, Uranus and Neptune. Flying too close to the Sun overheats the ship
- **Landing**: 1 to 3 stars per landing, a Perfect Landing bonus, and best scores saved per planet and landing zone
- **On foot**: explore planet surfaces with an oxygen limit
- **Missions and contracts**: a campaign, rescue contracts (crew oxygen timer) and EVA station repairs (repair points, debris)
- **Ships**: 12 ships to buy, unlock and upgrade, plus paints and stickers (cosmetic only)
- **Store**: Nova currency packs and one-time deals (Starter Pack, Remove Ads, Commander Bundle) through Google Play Billing, with restore after reinstall
- **Ads (AdMob)**: a banner on the main menu only, an interstitial at most every second mission end (3 minutes apart), and optional reward videos. Remove Ads turns off the banner and interstitials
- **Age gate**: players under 13 get no ads and no Store. Teen players get teen-rated ads only. EEA players see a consent form
- **Phone friendly**: landscape fullscreen, touch controls, hardware Back button, and low graphics by default on touch screens

## Tech stack

- Vite 8, React 19, TypeScript, Tailwind 4
- three.js, with all models built in code (no external 3D assets)
- Capacitor 8 for Android (`com.fahadapps.spacebound`)
- `@capgo/native-purchases` (Play Billing Library 9) and `@capacitor-community/admob`
- The save is kept on the phone in `localStorage`. No server, no login

## Getting started

Requirements: Node 22, Android Studio with the Android SDK, and a phone with USB debugging (or an emulator).

```bash
git clone https://github.com/fahad2bhatti/SpaceBound.git
cd SpaceBound
npm install
npm run dev                         # play in the browser (Store runs in test mode, no ads)
npm run build && npx cap sync android
npx cap run android                 # install on the phone
```

Uninstalling the app deletes the local save. Paid one-time items come back with **Restore purchases** in the Store.

## Release build (AAB for Google Play)

1. Create an upload key and `android/keystore.properties` (this file and `*.jks` are git-ignored):

   ```properties
   storeFile=spacebound-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```

2. Raise `versionCode` (and `versionName` if you want) in `android/app/build.gradle`.
3. Build:

   ```bash
   VITE_ADS_REAL=1 npm run android:aab
   ```

   `scripts/check-release.mjs` stops the build if test billing is on, real ads are off, or the upload key is missing. The AAB is at `android/app/build/outputs/bundle/release/app-release.aab`.

## Tests

```bash
npx tsx scripts/contracts.test.mts
npx tsx scripts/landing.test.mts
npx tsx scripts/looks.test.mts
npx tsx scripts/missions.test.mts
npx tsx scripts/welcome.test.mts
npx tsx scripts/autopilot.test.mts
npx tsc --noEmit
```

## Code map

- `src/game/engine.ts`: the game loop, screens, flight physics, purchases and ads flow
- `src/game/catalog.ts`, `planets.ts`, `landing.ts`: ships, destinations, landing zones and scoring
- `src/game/contracts/`: contract data and objectives
- `src/game/store.ts`, `billing.ts`, `ads.ts`: Store products, Google Play Billing, AdMob
- `src/game/save.ts`: save format and migration
- `src/components/spacebound/`: the React UI
- `docs/`: privacy policy, terms and support page (GitHub Pages)
- `HANDOFF.md`: detailed developer notes

## Legal

- [Privacy Policy](https://fahad2bhatti.github.io/SpaceBound/privacy.html)
- [Terms of Service](https://fahad2bhatti.github.io/SpaceBound/terms.html)

Copyright (c) 2026 Fahad Apps. All rights reserved. Third-party packages remain under their own licenses.

## Contact

Fahad Apps · fahadsaeed2622@gmail.com
