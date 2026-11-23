# Waqt

Waqt is an Android app for accurate prayer times and a calm Azan, built with Flutter. Prayer times are calculated on your phone, your prayer history stays on your phone, and there are no accounts and no ads.

Developed by **Fahad Apps** · Android only · Status: preparing for Google Play closed testing

## Features

- **Prayer times** calculated on-device, with 6 calculation methods, Hanafi or Shafi Asr, and per-prayer minute adjustments
- **Azan alarms** scheduled 30 days ahead, set again after a reboot or time zone change
- **Azan screen** that opens over the lock screen, from the background, and after swiping the app from recents
- **Vibration** that keeps going with the Azan even when the phone is on silent
- **Reminders** after the Azan if the prayer is not ticked, with "I prayed", "Remind again" and 10/20/30 minute options
- **Prayer log** with a month calendar and streaks
- **Qibla compass** using the phone's sensors, pointing to true north
- **Azan protection** check that shows which permissions are missing
- **Delete all data** in Settings
- Prayer Mode (app blocker) is planned and shown as "coming soon"

## Tech stack

- Flutter and Dart, feature-first folders (`lib/features/<feature>/{data,providers,presentation}`)
- Riverpod for state, GoRouter for navigation
- `adhan_dart` for prayer time calculation
- `flutter_local_notifications` and native Kotlin code for exact alarms and the lock-screen Azan
- Firebase Crashlytics for crash reports (release builds only)

## Getting started

Requirements: Flutter (Dart `^3.12`), Android SDK, a device or emulator.

```bash
git clone https://github.com/fahad2bhatti/waqt.git
cd waqt
flutter pub get
flutter run
```

Firebase config (`android/app/google-services.json`) is not in the repository. Create your own Firebase project, add an Android app with the package name `com.fahadapps.waqt`, and place its `google-services.json` in `android/app/`.

### Release build

Create an upload keystore, then add `android/key.properties` (this file and `*.jks` are git-ignored):

```properties
storeFile=/absolute/path/to/waqt-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

```bash
flutter build appbundle --release
```

## Tests

```bash
flutter analyze
flutter test
```

## Documentation

- [Roadmap](docs/ROADMAP.md)
- [Project documentation](docs/DOCUMENTATION.md)
- [Terms & Conditions](docs/terms.md)
- [Privacy Policy](docs/privacy.md)

## License

Copyright (c) 2026 Fahad Apps. All rights reserved. See [LICENSE](LICENSE). Third-party packages remain under their own licenses.

## Contact

Fahad Apps, Faisalabad, Pakistan · fahadsaeed2622@gmail.com
