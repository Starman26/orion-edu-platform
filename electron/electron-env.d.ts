/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    VITE_PUBLIC: string;
  }
}

// Used in Renderer process, expose in `preload.ts` / `preload.mjs`
interface Window {
  // (si lo estabas usando así, lo dejamos)
  ipcRenderer: import("electron").IpcRenderer;

  //  lo que usas en Login.tsx (min/max/close + setWindowSize)
  electronAPI?: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    setWindowSize: (width: number, height: number) => void;

    //  NUEVO: listener para deep link OAuth callback (devuelve unsubscribe)
    onAuthCallback: (cb: (url: string) => void) => () => void;
  };

  // (Opcional) ya lo expones en preload.mjs: window.electron.ipcRenderer.safeIPC
  electron?: {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => () => void;
      once: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
    };
  };

  // (Opcional) ya lo expones en preload.mjs: window.fredie....
  fredie?: {
    submitFromWidget: (data: any) => Promise<any>;
    resizeWidget: (size: any) => Promise<any>;
    onAnswer: (cb: (payload: any) => void) => () => void;
    openExternal: (url: string) => void;
  };
}
