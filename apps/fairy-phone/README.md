# Fairy phone app

An Android app for the fairy companion that runs on the PC (`apps/stage-tamagotchi`). It shows the phone page that
the PC serves on the Tailscale network, so the phone and the PC share one character, one memory, and every tool.

## What it does

- Shows the phone page as an app: the chat with photos and voice messages, the list of chats, the character's card to
  edit her personality, and switches for her modes.
- Can be the phone's **digital assistant**, in place of Google's. A long press of the side button then opens the
  character, and she listens at once. Recording stops after a short silence.
- Listens for the character's **wake word**, also with the screen off, when the owner turns it on in Controls. A small
  keyword spotting model runs on the phone (sherpa-onnx, the same model and wake words as the PC), so nothing leaves
  the phone before the wake word. Android shows a notification while it listens, and the listener pauses while the app
  is open. The wake word opens the app straight away only when it is the phone's assistant. Otherwise a notification
  asks for a tap.
- Takes shares from other apps: a link, some text, or a picture goes to the character, who reacts to it.
- Opens links to other sites in the browser, never inside the app.

## When to use it

Use it on an Android phone that can reach the PC over Tailscale. Use the phone page in a browser instead on other
phones, or when you want the browser's push notifications, because the app's web view has no Web Push.

## Build

Needs the toolchain in the repository's `tools/` folder, which git ignores:

- `tools/jdk`: a Java JDK 21
- `tools/android-sdk`: the Android command-line tools with `platform-tools`, `platforms;android-35`, and
  `build-tools;35.0.0`
- `tools/sherpa/sherpa-onnx.aar`: `sherpa-onnx-static-link-onnxruntime-2.0.3.aar` from the
  [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases)
- `tools/sherpa/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20`: the unpacked model pack from the `kws-models` release
  of sherpa-onnx. `build-app.cmd` copies its small int8 files into the app.

Then run `build-app.cmd`. It writes `fairy-data/phone/fairy-phone.apk`, and keeps the signing key in
`fairy-data/android`, so each new build installs over the old app.

## Install and pair

1. Open the phone page in Chrome on the phone and tap 📱.
2. Tap "Download the app" and install it. Android asks once to allow installs from Chrome.
3. Tap "Connect the app". The app opens with the page.
4. To make it the assistant: Settings, Apps, Choose default apps, Digital assistant app, then pick the app. On a
   Samsung phone, also set Settings, Advanced features, Side button, Press and hold, to the digital assistant.
5. For the wake word: Controls, then the "Hey …" switch. After a restart of the phone, open the app once, because
   Android lets an app start its microphone listener only while the app shows.
