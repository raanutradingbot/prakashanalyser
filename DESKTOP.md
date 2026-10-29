# Desktop app (Windows, macOS, Linux)

An Electron wrapper around the exact same production build used for Docker
and Oracle hosting (`.next/standalone`) — not a separate codebase. The
desktop app runs that build locally and opens a window pointing at it.

## Run it locally

```bash
npm run desktop:install   # one-time: installs Electron into desktop/
npm run desktop           # builds the app, then launches it
```

By default the desktop build has no API keys baked in, so it runs on demo
(synthetic) data — same as a fresh checkout. To ship a build with real data
pre-configured, put your keys in `.env.local` before running `npm run
build` (the Next.js build inlines what it needs at build time; the rest is
read from `process.env` at runtime inside the packaged app).

## Build installers

```bash
npm run desktop:dist:win     # -> desktop/dist/*.exe (NSIS installer)
npm run desktop:dist:mac     # -> desktop/dist/*.dmg
npm run desktop:dist:linux   # -> desktop/dist/*.AppImage
```

**Important:** `electron-builder` can only reliably produce a **macOS**
build when run *on* macOS (code signing and some packaging steps need
Apple's own tools) — you can't produce a `.dmg` from this Windows machine.
Options once you want a real cross-platform release:
- Run `npm run desktop:dist:mac` on an actual Mac
- Or use GitHub Actions with a `macos-latest` runner to build it in CI — ask
  me and I'll set up the workflow file when you're ready

Windows and Linux builds work fine from this machine right now.

## Unsigned-installer warnings

None of these builds are code-signed (that needs a paid certificate — a few
hundred dollars/year on Windows, an Apple Developer account on macOS).
Unsigned installers will trigger a Windows SmartScreen warning and a macOS
Gatekeeper warning on first run. Users can click through ("More info → Run
anyway" / right-click → Open), but it looks unpolished for a public release.
Worth revisiting if this becomes a real product people download cold.
