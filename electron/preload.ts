import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("paperReader", {
  platform: process.platform,
  openPdf: () => ipcRenderer.invoke("pdf:open"),
  loadState: (documentId: string) => ipcRenderer.invoke("state:load", documentId),
  saveState: (documentId: string, state: unknown) =>
    ipcRenderer.invoke("state:save", documentId, state),
  lookupDictionary: (word: string) => ipcRenderer.invoke("dictionary:lookup", word),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  onCloseRequest: (handler: () => void | Promise<void>) => {
    const listener = () => {
      void handler();
    };
    ipcRenderer.on("window:close-request", listener);
    return () => ipcRenderer.removeListener("window:close-request", listener);
  },
  confirmClose: () => ipcRenderer.send("window:close-confirmed"),
});
