# Android app (Trusted Web Activity → Play Store)

A real native Android app — not a fake wrapper — built with Google's own
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) tool, using the
PWA manifest/service worker already set up in `src/app/manifest.ts` and
`public/sw.js`. It renders `https://prakashanalyser.duckdns.org` full-screen,
verified against that domain via Digital Asset Links.

**This needed the site live on HTTPS first** — Bubblewrap reads the real
`manifest.webmanifest` from the live URL, and Android verifies the app
against a file hosted on the domain. It won't work against `localhost`.

## What's already built

The `android/` folder has a working, signed build pipeline:
- `android/generate.cjs` — generates the full Android Studio project
- `android/build.cjs` + `android/run-build.sh` — builds and signs both a
  `.apk` (for local testing) and `.aab` (for Play Store) from it
- A release keystore at
  `C:\Users\Archana Arjunraj\Documents\PrakashAnalyser-signing\release-keystore.jks`
  (outside the git repo, never committed)

Running `bash android/run-build.sh` produces:
- `android/app-release-signed.apk` — sideload this on a phone to test
- `android/app-release-bundle.aab` — upload this to Play Console

Both are gitignored (binary build output, not source) — rerun the build to
regenerate them any time.

## Why this doesn't just use `bubblewrap init` / `bubblewrap build`

The straightforward path — running Bubblewrap's CLI wizard interactively —
doesn't work in this environment: the harness's shell runs each command as a
separate non-interactive process, so there's no way to answer Bubblewrap's
inquirer-based prompts (domain, app name, signing key, etc.) turn-by-turn.
Piping canned answers via stdin doesn't work either — inquirer's readline
interface closes as soon as the invoking shell process ends, which happens
after every single command here.

The fix: call Bubblewrap's own underlying library functions directly
(`@bubblewrap/core`'s `TwaManifest`, `TwaGenerator`, `AndroidSdkTools`, etc.)
from a plain Node script, setting all the "wizard answers" as object fields
instead of prompt responses. That's what `generate.cjs` and `build.cjs` do —
each one's top comment explains exactly which interactive step it's
replacing and why.

## Known environment quirks (documented in case a rebuild breaks)

A few Windows/sandbox-specific bugs had to be worked around; they're also
commented inline in `build.cjs`, but summarized here:

1. **Spaces in file paths break `execFile(..., {shell:true})`.** This
   machine's user folder is `C:\Users\Archana Arjunraj\...` — the space
   means any full path passed as a shell command gets silently split apart.
   Fixed by using Windows' short (8.3) path form everywhere a full path is
   needed, e.g. `C:\Users\ARCHAN~1\...` instead of
   `C:\Users\Archana Arjunraj\...`. Get a folder's short path via PowerShell:
   `(New-Object -ComObject Scripting.FileSystemObject).GetFolder("<path>").ShortPath`

2. **`@bubblewrap/core`'s `GradleWrapper` hardcodes the bare command
   `gradlew.bat`**, which this environment's `execFile` can't resolve via
   cwd search (confirmed: the full path works, the bare name doesn't, for
   reasons unrelated to the spaces issue above). `build.cjs` bypasses
   `GradleWrapper` and calls `gradlew.bat` via its full short path directly.

3. **`JdkHelper.getEnv()` / `AndroidSdkTools.getEnv()` set `env['Path']`**
   (capital P only) while this shell's real variable is `env['PATH']` (all
   caps) — JS object keys are case-sensitive even though Windows env vars
   aren't, so this creates a second, malformed `Path` entry instead of
   extending the real one, breaking any bare-name tool lookup (like
   `jarsigner`) that depends on it. `build.cjs` builds its own clean env
   instead and calls `jarsigner.exe` via its full path.

4. **Gradle's daemon IPC fails with "Unable to establish loopback
   connection"** — a known issue in this specific sandboxed environment
   (see [anthropics/claude-code#44857](https://github.com/anthropics/claude-code/issues/44857)
   and [#77508](https://github.com/anthropics/claude-code/issues/77508)): the
   JVM's NIO Selector pipe tries a Unix-domain socket that fails here. Fixed
   with `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/Temp` (set in
   `build.cjs`'s env) plus `org.gradle.daemon=false` in `gradle.properties`.

5. **`androidbrowserhelper` (the TWA library Bubblewrap depends on) needs
   `minSdkVersion 24`+**, but Bubblewrap's own default is 21. Set explicitly
   in `generate.cjs`.

None of this should matter on a normal machine (a Mac, a regular Windows
box without spaces in the username, Android Studio's own built-in tooling)
— it's specific to running Bubblewrap through this particular automated
shell environment. If you ever run `bubblewrap init`/`bubblewrap build`
yourself interactively from a real terminal instead, none of these
workarounds should be necessary.

## Rebuilding after a web app update

The Android app just renders the live site — most changes to the web app
need **no Android rebuild at all**. You only need to regenerate/rebuild if
you change something native-side: app name, icon, package ID, signing key,
or Bubblewrap/TWA version.

```bash
cd android
node generate.cjs   # regenerates the project from the live manifest
bash run-build.sh    # needs the keystore password file back temporarily —
                      # see "Keystore password" below
```

## Keystore password

The keystore password isn't stored anywhere on disk (deliberately — it was
shown once in chat and should be in your password manager). To rebuild:

1. Create `C:\Users\Archana Arjunraj\Documents\PrakashAnalyser-signing\keystore-password.txt`
   containing just the password, one line
2. Run `bash android/run-build.sh`
3. Delete that file again once the build finishes

**Losing this password permanently loses the ability to update the Play
Store app under this listing** — Google can't reset it. If it's genuinely
lost, see "What to do if the password is lost" below.

## What to do if the password is lost

Before any Play Store release exists, this is a non-issue: just delete
`release-keystore.jks`, run `keytool -genkeypair` again for a fresh one
(update the path in `generate.cjs`), and rebuild. No harm done.

After a Play Store release exists under the original key, losing the
password means you can never update that listing again with a different
key — Play Store release signing is permanently tied to the first key you
upload with (unless you've opted into Play App Signing with Google holding
the upload key, which has its own recovery path through Play Console
support).

## Uploading to Play Store

Open your existing Play Console listing → **Production** (or **Internal
testing** first, to try it safely before a public release) → **Create new
release** → upload `android/app-release-bundle.aab` → fill in release notes
→ submit for review.

## Digital Asset Links (full-screen verification)

Already set up: `public/.well-known/assetlinks.json` contains the signing
key's SHA-256 fingerprint, verifying to Android that this app and
`prakashanalyser.duckdns.org` are controlled by the same party — so the app
opens full-screen instead of falling back to a browser-chrome Custom Tab.

If you ever regenerate the keystore (new signing key), this file needs
updating too. Get the new fingerprint without needing the keystore password
— it's public info, readable straight off any already-signed build:
```bash
keytool -printcert -jarfile android/app-release-signed.apk
```
Copy the `SHA256:` value into `public/.well-known/assetlinks.json` and
redeploy (see `DEPLOY_ORACLE.md`).
