# SpaceBound – standalone static build (for APK)

## Web test
npm install
npm run build && npm run preview

## Android APK (Capacitor)
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android      # Android Studio -> Build > Build APK(s)
# or: npx cap run android  (phone connected, USB debugging on)

## After every code change
npm run build && npx cap sync android
