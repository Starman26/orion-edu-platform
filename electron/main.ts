import { app, BrowserWindow, ipcMain, shell, screen, Menu } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// Dev vs empaquetada
const isDev = !app.isPackaged;

// Deep link protocol
const PROTOCOL = "cora";

// Windows/Linux: si llega un deep link antes de tener ventana, lo guardamos
let pendingAuthCallbackUrl: string | null = null;

let mainWindow: BrowserWindow | null;
let widgetWindow: BrowserWindow | null;
let answerWindow: BrowserWindow | null;
let toastWindow: BrowserWindow | null = null;

function extractDeepLink(argv: string[]): string | undefined {
  return argv.find((a) => typeof a === "string" && a.startsWith(`${PROTOCOL}://`));
}

function sendAuthCallbackToRenderer(url: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:callback", url);
  } else {
    pendingAuthCallbackUrl = url;
  }
}

function registerProtocolClient() {
  // En Windows DEV, Electron necesita pasar execPath + entry para que funcione el protocolo
  if (process.platform === "win32" && isDev) {
    const appPath = process.argv[1]; // normalmente tu entry (ej: electron .)
    if (appPath) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath]);
      return;
    }
  }

  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Single instance lock (necesario para recibir second-instance en Windows/Linux)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = extractDeepLink(argv);
    if (url) sendAuthCallbackToRenderer(url);

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS: deep link llega por open-url
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (typeof url === "string" && url.startsWith(`${PROTOCOL}://`)) {
    sendAuthCallbackToRenderer(url);
  }
});

const createMainWindow = async () => {
  const iconPath = isDev
    ? join(__dirname, "../src/assets/logo10.png")
    : join(process.resourcesPath, "assets", "logo_v2.png");

  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    title: "CORA Desktop",
    backgroundColor: "#FFFFFF",

    frame: false,
    resizable: true,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    icon: iconPath,

    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
    },
  });

  mainWindow.center();

  Menu.setApplicationMenu(null);

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Si llegó un deep link antes de cargar la ventana, lo enviamos al renderer ya listo
  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingAuthCallbackUrl) {
      mainWindow?.webContents.send("auth:callback", pendingAuthCallbackUrl);
      pendingAuthCallbackUrl = null;
    }
  });
};

const createWidgetWindow = async () => {
  const FAB_W = 100,
    FAB_H = 100;

  widgetWindow = new BrowserWindow({
    width: FAB_W,
    height: FAB_H,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
    },
  });

  const { workAreaSize } = screen.getPrimaryDisplay();
  const centerX = Math.round(workAreaSize.width / 2 - FAB_W / 2);
  const topY = 5;

  widgetWindow.setPosition(centerX, topY);

  widgetWindow.setAlwaysOnTop(true, "screen-saver");
  widgetWindow.setVisibleOnAllWorkspaces(true);

  if (process.env.VITE_DEV_SERVER_URL) {
    await widgetWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "#/widget");
  } else {
    await widgetWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "widget",
    });
  }
};

const createAnswerWindow = async (payload: { html: string }) => {
  answerWindow?.close();
  answerWindow = new BrowserWindow({
    width: 560,
    height: 680,
    title: "Respuesta FrEDie",
    backgroundColor: "#FFFFFF",

    modal: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await answerWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "#/answer");
  } else {
    await answerWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "answer",
    });
  }

  answerWindow.webContents.send("answer:render", payload);
};

async function createOrShowToast(message: string) {
  if (toastWindow && !toastWindow.isDestroyed()) {
    const url = process.env.VITE_DEV_SERVER_URL
      ? process.env.VITE_DEV_SERVER_URL + "#/toast?msg=" + encodeURIComponent(message)
      : "file://" +
        join(__dirname, "../renderer/index.html") +
        "#/toast?msg=" +
        encodeURIComponent(message);

    if (toastWindow.webContents.getURL() !== url) {
      await toastWindow.loadURL(url);
    }
    toastWindow.showInactive();
    toastWindow.setAlwaysOnTop(true, "screen-saver");
    return;
  }

  const disp = screen.getPrimaryDisplay();
  const { x, y, width, height } = disp.workArea;
  const W = 360,
    H = 96,
    M = 20;

  toastWindow = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(x + width - W - M),
    y: Math.round(y + height - H - M),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
    },
  });

  toastWindow.on("closed", () => {
    toastWindow = null;
  });

  toastWindow.on("unresponsive", () => {
    try {
      toastWindow?.destroy();
    } finally {
      toastWindow = null;
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await toastWindow.loadURL(
      process.env.VITE_DEV_SERVER_URL + "#/toast?msg=" + encodeURIComponent(message),
    );
  } else {
    await toastWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "toast?msg=" + encodeURIComponent(message),
    });
  }

  toastWindow.showInactive();
  toastWindow.setAlwaysOnTop(true, "screen-saver");
}

function closeToastWindow(force = false) {
  if (!toastWindow) return;
  try {
    if (!toastWindow.isDestroyed()) {
      force ? toastWindow.destroy() : toastWindow.close();
    }
  } finally {
    toastWindow = null;
  }
}

app.whenReady().then(async () => {
  registerProtocolClient();

  // En Windows, si la app arrancó desde un deep link, viene en process.argv
  if (process.platform === "win32" || process.platform === "linux") {
    const url = extractDeepLink(process.argv);
    if (url) pendingAuthCallbackUrl = url;
  }

  await createMainWindow();
  await createWidgetWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
});

ipcMain.handle("widget:submit", async (_e, data: { text: string; files: string[] }) => {
  await createOrShowToast("Consulta enviada");

  await new Promise((r) => setTimeout(r, 3000));

  await createAnswerWindow({
    html: `<h2>Respuesta FrEDie</h2><p><b>Consulta:</b> ${data.text || "(sin texto)"}.</p>
           <p>Archivos: ${data.files?.length || 0}</p>
           <p><i>Luego conectamos Azure/Claude y guardamos en [CHAT].</i></p>`,
  });

  closeToastWindow();
  return { ok: true };
});

ipcMain.on("toast:close", () => closeToastWindow());

ipcMain.on("open:external", (_e, url: string) => shell.openExternal(url));

ipcMain.handle("widget:resize", async (_e, size: { w: number; h: number }) => {
  if (!widgetWindow) return { ok: false };
  const { w, h } = size;
  widgetWindow.setSize(Math.max(10, w), Math.max(16, h), true);
  return { ok: true };
});

ipcMain.on("widget:set-position", (_event, { x, y }) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setPosition(Math.round(x), Math.round(y));
  }
});

ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

ipcMain.on("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on("window:set-size", (_event, { width, height }) => {
  if (!mainWindow) return;

  if (mainWindow.isMaximized()) mainWindow.unmaximize();

  mainWindow.setContentSize(Math.round(width), Math.round(height));
  mainWindow.center();
});
