# Android app (Trusted Web Activity → Play Store)

The PWA groundwork is already in place (`src/app/manifest.ts`, icons,
service worker) — this wraps that into a signed Android App Bundle using
Google's own tool for exactly this, [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
A TWA isn't a fake wrapper: it's a real native Android app that happens to
render your live site full-screen, verified against your domain so Android
knows the app and the website are the same thing.

**This needs the site live on HTTPS first** (see `DEPLOY_ORACLE.md`) —
Bubblewrap reads your real `manifest.webmanifest` from the live URL to set
the project up, and Android verifies the app against a file hosted on your
domain. Nothing here will work against `localhost`.

## 1. Install prerequisites (one-time)

- **JDK 17+** and **Android Studio** (bundles the JDK and the Android SDK
  you need) — [developer.android.com/studio](https://developer.android.com/studio)
- Confirm after installing: `keytool -version` and `java -version` both
  work from a terminal.

## 2. Generate your release keystore

This is the key that proves every future update to the app comes from you.
**Losing it means you can never update the app again** — Google can't
reset it for you. Store the file and the two passwords somewhere durable
(password manager + an offline backup), never in git.

```bash
keytool -genkeypair -v -keystore release-keystore.jks \
  -alias prakashanalyser -keyalg RSA -keysize 2048 -validity 10000
```

It'll ask for a keystore password, your name/org details, and a key
password — write all of it down now.

## 3. Generate the TWA project

Once your domain is live (e.g. `https://prakashanalyser.duckdns.org`):

```bash
npx @bubblewrap/cli init --manifest=https://your-domain/manifest.webmanifest
```

Answer its prompts — it'll suggest sensible defaults pulled from your
manifest (app name, package ID like `com.prakashanalyser.twa`, theme color).
When it asks for a signing key, point it at `release-keystore.jks` from
step 2.

This creates an `android/` folder in this repo with a real Android Studio
project.

## 4. Verify domain ownership (Digital Asset Links)

Bubblewrap prints a snippet for `assetlinks.json` containing your app's
package name and the SHA-256 fingerprint of your signing key. That file
needs to be served from your own domain at exactly:
```
https://your-domain/.well-known/assetlinks.json
```

In this Next.js project, drop it at `public/.well-known/assetlinks.json`
and redeploy (see `DEPLOY_ORACLE.md` step 8) so it's live at that URL.
Without this, Android shows the site in a browser with a URL bar instead of
as a full-screen app.

## 5. Build the release AAB

```bash
cd android
./gradlew bundleRelease
```

The signed `.aab` lands in `android/app/build/outputs/bundle/release/`.
That's the file you upload to Play Console.

## 6. Upload to Play Console

You mentioned you already have a Play Console listing — open it, go to
**Production** (or **Internal testing** first, to try it safely before a
public release) → **Create new release** → upload the `.aab` → fill in the
release notes → submit for review.

## Updating the app later

Any time you ship a real site change and want the Android app to reflect
it immediately, you don't need a new Play Store release — TWA just renders
your live site. You only need a new Play Store release when you change the
*native* wrapper itself (app name, icon, package id, signing).
