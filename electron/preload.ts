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
  close: () => ipcRenderer.send("window:close"),
});
