import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fredie', {
  submitFromWidget: (data: { text: string; files: string[] }) =>
    ipcRenderer.invoke('widget:submit', data),
  onAnswer: (cb: (p: any) => void) => ipcRenderer.on('answer:render', (_e, p) => cb(p)),
  openExternal: (url: string) => ipcRenderer.send('open:external', url),
});
