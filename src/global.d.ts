export {};

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
    };

    fredie?: {
      submitFromWidget: (data: { text: string; files: string[] }) => Promise<any>;
      onAnswer: (cb: (p: any) => void) => void;
      openExternal: (url: string) => void;
    };
  }
}
