// Electron main process. Spawns the Next.js standalone production server
// (built by `npm run build`, prepared by scripts/prepare-standalone.mjs) as a
// child process using Electron's own bundled Node runtime, then opens a
// window pointing at it. This way the desktop app runs the exact same build
// as the Docker image / Oracle deployment, just locally instead of over a
// network.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

let serverProcess = null;
let mainWindow = null;

function resourcePath(...segments) {
  // Packaged: electron-builder copies .next/standalone to resources/standalone (see
  // desktop/package.json "extraResources"). Unpacked dev run: it's still at .next/standalone,
  // never copied, so the two cases need different base paths.
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", ".next");
  return path.join(base, ...segments);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function check() {
      const socket = net.createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error("The app's local server did not start in time."));
          return;
        }
        setTimeout(check, 200);
      });
    })();
  });
}

async function startServer() {
  const port = await getFreePort();
  const serverEntry = resourcePath("standalone", "server.js");

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      // No .env.local is bundled into the desktop build. Without a
      // DATA_PROVIDER / API keys baked in at build time, the app runs on
      // demo (synthetic) data, same as a fresh `npm run dev` checkout.
    },
    stdio: "inherit",
    windowsHide: true,
  });

  return port;
}

async function createWindow() {
  const port = await startServer();
  await waitForServer(port);

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 760,
    minHeight: 600,
    title: "PrakashAnalyser",
    backgroundColor: "#0f1521",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  if (process.env.DEBUG_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("did-fail-load:", code, desc);
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("render-process-gone:", details);
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`).catch((err) => {
    console.error("loadURL failed:", err);
  });

  // News headlines and any other outbound links open in the system browser,
  // not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

app.whenReady().then(createWindow).catch((err) => console.error("createWindow failed:", err));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
