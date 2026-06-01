# TalentRayz Demo Mobile App

A high-performance, premium React Native mobile application wrapper built using **Expo SDK 56** and **react-native-webview**. It is designed to package the TalentRayz portal (`https://app.talentrayz.com/en/login`) as a native Android application.

## ✨ Features

*   **📱 Full-Screen Native Look:** A complete edge-to-edge full-screen web portal integration that adapts to native notches, status bars, and navigation margins using `SafeAreaView`.
*   **⚡ Premium Progress Bar:** A sleek, 3px thin progress indicator at the top of the screen that advances in real-time as pages load, exactly like native Safari or Chrome.
*   **🔄 Custom Route Loader:** Seamless spinner overlays for background page transitions and initial load.
*   **🔌 Intelligent Offline Detection:** Integrated with `@react-native-community/netinfo` to track connection state dynamically. Shows a gorgeous, state-of-the-art **Offline Overlay** with built-in networking advice and an interactive "Try Again" reload trigger.
*   **🤖 Android Back Button Support:** Completely handles the native hardware back key to navigate through the web portal history instead of quitting the application.
*   **📦 Ready for Production Builds:** Prefitted with pre-configured `eas.json` for generating installable test `.apk` files and store-ready `.aab` bundles.

---

## 🚀 Quick Start

Ensure you have [Node.js](https://nodejs.org/) and [Android Studio](https://developer.android.com/studio) (for emulator testing) installed.

1.  **Install dependencies** (if not already done):
    ```bash
    npm install
    ```
2.  **Start the Expo Development Server**:
    ```bash
    npm run start
    ```
3.  **Run on Android Device or Emulator**:
    *   **Emulator:** Open Android Studio's Emulator, then press **`a`** in your computer terminal.
    *   **Physical Device:** Install the **Expo Go** app from the Google Play Store on your device, and scan the QR code displayed in the terminal.

---

## 🛠️ Project Structure

*   `App.js` — Core application logic including network listener state, Android hardware back press registrations, custom loading status, progress bars, and custom styled components.
*   `app.json` — Expo app settings, custom adaptive application icons, and build permissions.
*   `eas.json` — EAS Build configuration profiles for APK preview and production builds.
*   `package.json` — JavaScript dependencies and project execution scripts.

---

## 🛡️ License

This project is licensed under the MIT License.
