#!/usr/bin/env bash
set -euo pipefail

echo "1/3 Compilation de l'interface web OW'Beloty..."
npm run build

echo "2/3 Synchronisation Capacitor vers Android..."
npx cap sync android

echo "3/3 Construction de l'APK Debug..."
cd android
chmod +x ./gradlew
./gradlew assembleDebug

echo "APK généré : android/app/build/outputs/apk/debug/app-debug.apk"
