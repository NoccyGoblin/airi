# Fairy phone app

An Android app for the fairy companion that runs on the PC (`apps/stage-tamagotchi`). It shows the phone page that
the PC serves on the Tailscale network, so the phone and the PC share one character, one memory, and every tool.

## What it does

- Shows the phone page: chat, photos, and voice messages.
- Can be the phone's **digital assistant**, in place of Google's. A long press of the side button then opens the
  character, and she listens at once. Recording stops after a short silence.
- Opens links to other sites in the browser, never inside the app.

## When to use it

Use it on an Android phone that can reach the PC over Tailscale. Use the phone page in a browser instead on other
phones, or when you want the browser's push notifications, because the app's web view has no Web Push.

## Build

Needs the toolchain in the repository's `tools/` folder, which git ignores:

- `tools/jdk`: a Java JDK 21
- `tools/android-sdk`: the Android command-line tools with `platform-tools`, `platforms;android-35`, and
  `build-tools;35.0.0`

Then run `build-app.cmd`. It writes `fairy-data/phone/fairy-phone.apk`, and keeps the signing key in
`fairy-data/android`, so each new build installs over the old app.

## Install and pair

1. Open the phone page in Chrome on the phone and tap 📱.
2. Tap "Download the app" and install it. Android asks once to allow installs from Chrome.
3. Tap "Connect the app". The app opens with the page.
4. To make it the assistant: Settings, Apps, Choose default apps, Digital assistant app, then pick the app. On a
   Samsung phone, also set Settings, Advanced features, Side button, Press and hold, to the digital assistant.
