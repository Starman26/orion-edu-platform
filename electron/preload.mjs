import { contextBridge, ipcRenderer } from "electron";

/* ============================================================
   1) Helper seguro para IPC (invoke, send, on, off)
   ============================================================ */
const safeIPC = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  },
  once: (channel, listener) => ipcRenderer.once(channel, listener),
  off: (channel, listener) => ipcRenderer.off(channel, listener),
};

contextBridge.exposeInMainWorld("electron", { ipcRenderer: safeIPC });

/* ============================================================
   2) API para CORA (widget, respuestas, enlaces...)
   ============================================================ */
contextBridge.exposeInMainWorld("CORA", {
  submitFromWidget: (data) => ipcRenderer.invoke("widget:submit", data),

  resizeWidget: (size) => ipcRenderer.invoke("widget:resize", size),

  onAnswer: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("answer:render", handler);
    return () => ipcRenderer.off("answer:render", handler);
  },

  openExternal: (url) => ipcRenderer.send("open:external", url),
});

/* ============================================================
   3) API para controles de ventana + auth callback (OAuth)
   ============================================================ */
contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),

  setWindowSize: (width, height) =>
    ipcRenderer.send("window:set-size", { width, height }),

  // OAuth deep link callback: main.ts -> webContents.send("auth:callback", url)
  onAuthCallback: (cb) => {
    const handler = (_event, url) => cb(url);
    ipcRenderer.on("auth:callback", handler);

    // Permite desuscribirse limpio
    return () => ipcRenderer.off("auth:callback", handler);
  },
});
