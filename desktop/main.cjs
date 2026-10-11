const { app, BrowserWindow, ipcMain, screen, session, desktopCapturer, globalShortcut } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

// Task execution runs in backend services; hidden renderers can sleep.




// Enable GPU and WebGL for transparent frameless overlay windows
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-webgl");
app.commandLine.appendSwitch("enable-gpu-rasterization");

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

async function serverUp() {
  try {
    const res = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function portTaken() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
  });
}

let server, mainWin, overlayWin;
const services = [];
let isQuitting = false;
let cursorPollTimer = null;

const REPO = (() => {
  try { return require("./repo.json").path; }
  catch { return path.resolve(__dirname, ".."); }
})();

async function ensureService(port, script) {
  const ready = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      const data = await response.json();
      return response.ok && data.ok && (data.harness === "micky-full-windows-harness");
    } catch { return false; }
  };
  if (await ready()) return;
  fs.mkdirSync(path.join(REPO, ".logs"), { recursive: true });
  const log = fs.createWriteStream(path.join(REPO, ".logs", `${script}.native.log`), { flags: "a" });
  const child = spawn(process.env.MICKY_PYTHON || "python", [path.join(REPO, "scripts", script)], { cwd: REPO, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false }); child.once("exit", () => log.end());
  child.on("error", e => console.error(script, e));
  services.push(child);
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${script} exited during startup`);
    if (await ready()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${script} did not become ready`);
}
const fs = require("node:fs");
try {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = /^(BOPS_\w+|MICKY_\w+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
} catch {}

try{const models=JSON.parse(fs.readFileSync(path.join(REPO,'.data/model-selection.json'),'utf8'));for(const [role,key] of Object.entries({chat:'BOPS_LOCAL_MODEL',worker:'BOPS_WORKER_MODEL',reasoning:'BOPS_REASONING_MODEL',vision:'BOPS_VISION_MODEL'}))if(models[role])process.env[key]=models[role];}catch{}
async function ensureOllama() {
  if (!(process.env.BOPS_LOCAL_LLM_URL || "http://127.0.0.1:11434/v1").includes("127.0.0.1:11434")) return;
  const ready = async () => { try { return (await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } };
  if (await ready()) return;
  const installed = path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe");
  const child = spawn(fs.existsSync(installed) ? installed : "ollama", ["serve"], { windowsHide: true, stdio: "ignore" });
  child.on("error", error => console.error("Ollama startup", error)); services.push(child);
  for (let i = 0; i < 30; i++) { if (await ready()) return; await new Promise(resolve => setTimeout(resolve, 500)); }
  throw new Error("The local language model service did not start");
}

async function startServer() {
  if (await serverUp()) return;
  if (await portTaken()) {
    for (let i = 0; i < 240 && !(await serverUp()); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await serverUp())) throw new Error("Micky local service did not become ready");
    return;
  }
  const built = fs.existsSync(path.join(REPO, ".next-native", "BUILD_ID"));
  fs.mkdirSync(path.join(REPO, ".logs"), { recursive: true });
  const rendererLog = fs.createWriteStream(path.join(REPO, ".logs", "renderer.native.log"), { flags: "a" });
  server = spawn(process.execPath, [path.join(REPO, "node_modules/next/dist/bin/next"), built ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: REPO,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...(built ? { MICKY_BUILD_DIR: ".next-native" } : {}) },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  server.stdout.pipe(rendererLog, { end: false }); server.stderr.pipe(rendererLog, { end: false });
  server.once("exit", () => rendererLog.end());
  for (let i = 0; i < 240 && !(await serverUp()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await serverUp())) throw new Error("Micky local service failed to start");
}

function stopServer() {
  try { server?.kill("SIGTERM"); } catch {}
  for (const child of services) { try { child.kill(); } catch {} }
}

function stopGlobalCursorTracking() {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "Micky",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#141416",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  mainWin = win;
  win.webContents.setBackgroundThrottling(true);

  win.webContents.setWindowOpenHandler(({ url }) => {
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  // When closing main window, IMMEDIATELY destroy overlay and quit app completely
  win.on("close", () => {
    isQuitting = true;
    stopGlobalCursorTracking();
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.destroy();
      overlayWin = null;
    }
    app.quit();
  });

  // When minimizing, keep floating 3D Mickey active on desktop
  win.on("minimize", () => createOverlay());
  win.on("restore", () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.hide();
    }
    stopGlobalCursorTracking();
  });

  const splash = `data:text/html,${encodeURIComponent(
    `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#141416;font:14px system-ui;color:#a1a1aa">Starting Micky Desktop…</body>`
  )}`;
  await win.loadURL(splash);
  await ensureOllama();
  await ensureService(Number(process.env.BOPS_HARNESS_PORT || 8766), "harness-server.py");
  await startServer();
  await win.loadURL(process.argv.includes('--heyjev')?URL+'/?voice=heyjev':URL);
  require('./bigfoot-runtime.cjs').start({repo:REPO,ipcMain,getWindow:()=>mainWin,mickyUrl:URL});
  require('./native-apps.cjs').install({repo:REPO,ipcMain,getWindow:()=>mainWin});
  void require('./brain-lifecycle.cjs').startApplications({repo:REPO,window:win,services,mickyUrl:URL}).catch(error=>console.error('Application startup:',error.message));
}

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.show();
    
    return;
  }
  const display = screen.getDisplayMatching(mainWin?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 });
  const area = display.workArea;

  const width = 200;
  const height = 200;

  overlayWin = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 25,
    y: area.y + area.height - height - 25,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: "#00000000",
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlayWin.setAlwaysOnTop(true, "floating");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadURL(`${URL}/overlay`);
  overlayWin.on("closed", () => {
    overlayWin = undefined;
    stopGlobalCursorTracking();
  });
  
}

ipcMain.handle("minimize-main", (event) => {
  if(mainWin&&!mainWin.isDestroyed()&&event.sender===mainWin.webContents)mainWin.minimize();
});
ipcMain.handle("show-main", () => {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.hide();
  }
  stopGlobalCursorTracking();
});

ipcMain.handle("close-overlay", () => {
  stopGlobalCursorTracking();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
  }
});

ipcMain.handle("move-overlay", (_event, { dx, dy }) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const [x, y] = overlayWin.getPosition();
  const bounds = overlayWin.getBounds();
  const pt = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(pt);
  const area = display.workArea;

  const newX = Math.max(area.x, Math.min(area.x + area.width - bounds.width, x + dx));
  const newY = Math.max(area.y, Math.min(area.y + area.height - bounds.height, y + dy));
  overlayWin.setPosition(Math.round(newX), Math.round(newY));
});

ipcMain.handle("quit-app", () => {
  isQuitting = true;
  stopGlobalCursorTracking();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
  }
  app.quit();
});

require('./maus-native.cjs').register({ ipcMain, getWindow: () => mainWin, repo: REPO, mickyUrl: URL, services });

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (mainWin) { mainWin.restore(); mainWin.show(); mainWin.focus(); } });
app.on("ready", () => {
  globalShortcut.register("CommandOrControl+Alt+Space",()=>mainWin?.webContents.send("micky:voice-wake"));
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.frame.url.startsWith(URL)) { callback({}); return; }
    desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }).then(sources => {
      const primary = sources.find(source => source.display_id === String(screen.getPrimaryDisplay().id)) ?? sources[0];
      callback(primary ? { video: primary } : {});
    }).catch(() => callback({}));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return !!webContents && webContents.getURL().startsWith(URL) && ["clipboard-sanitized-write","media"].includes(permission);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(!!webContents && webContents.getURL().startsWith(URL) && ["clipboard-sanitized-write","media"].includes(permission));
  });
  void createWindow().catch(error => {
    console.error(error);
    if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`data:text/html,${encodeURIComponent(`<body style="background:#141416;color:#eee;font:16px system-ui;padding:40px">Micky could not start: ${String(error.message).replace(/[<>&]/g, "")}<p>Check the local services and restart Micky.</p></body>`)}`);
  });
});

app.on("window-all-closed", () => {
  stopServer();
  stopGlobalCursorTracking();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWin || mainWin.isDestroyed()) {
    void createWindow().catch(error => {
    console.error(error);
    if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`data:text/html,${encodeURIComponent(`<body style="background:#141416;color:#eee;font:16px system-ui;padding:40px">Micky could not start: ${String(error.message).replace(/[<>&]/g, "")}<p>Check the local services and restart Micky.</p></body>`)}`);
  });
  } else {
    mainWin.show();
    mainWin.focus();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  isQuitting = true;
  stopGlobalCursorTracking();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
  }
  require("./native-apps.cjs").stop();
  stopServer();
});

