import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type OfflineDictionaryRecord = [string, string, string, string, string, string];

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let storeWrite = Promise.resolve();
const dictionaryShards = new Map<string, Promise<Record<string, OfflineDictionaryRecord>>>();
const DICTIONARY_CACHE_LIMIT = 8;

type StoredState = Record<string, unknown>;

function storePath() {
  return path.join(app.getPath("userData"), "reader-state.json");
}

async function readStore(): Promise<Record<string, StoredState>> {
  try {
    return JSON.parse(await fs.readFile(storePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeStore(documentId: string, state: StoredState) {
  storeWrite = storeWrite.then(async () => {
    const store = await readStore();
    store[documentId] = state;
    await fs.mkdir(path.dirname(storePath()), { recursive: true });
    await fs.writeFile(storePath(), JSON.stringify(store), "utf8");
  });
  return storeWrite;
}

function dictionaryShardName(word: string) {
  return word.slice(0, 2).padEnd(2, "_").replace(/[^a-z0-9]/g, "_");
}

function dictionaryDirectory() {
  return app.isPackaged
    ? path.join(app.getAppPath(), "dist", "dictionary")
    : path.join(app.getAppPath(), "public", "dictionary");
}

function loadDictionaryShard(name: string) {
  const cached = dictionaryShards.get(name);
  if (cached) {
    dictionaryShards.delete(name);
    dictionaryShards.set(name, cached);
    return cached;
  }

  const pending: Promise<Record<string, OfflineDictionaryRecord>> = fs
    .readFile(path.join(dictionaryDirectory(), `${name}.json`), "utf8")
    .then((value) => JSON.parse(value) as Record<string, OfflineDictionaryRecord>)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return {} as Record<string, OfflineDictionaryRecord>;
      dictionaryShards.delete(name);
      throw error;
    });

  if (dictionaryShards.size >= DICTIONARY_CACHE_LIMIT) {
    const oldest = dictionaryShards.keys().next().value;
    if (oldest) dictionaryShards.delete(oldest);
  }
  dictionaryShards.set(name, pending);
  return pending;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#f3f4f6",
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(currentDir, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDir, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("pdf:open", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const data = await fs.readFile(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  });

  ipcMain.handle("state:load", async (_event, documentId: string) => {
    const store = await readStore();
    return store[documentId] ?? null;
  });
  ipcMain.handle("state:save", async (_event, documentId: string, state: StoredState) => {
    await writeStore(documentId, state);
  });
  ipcMain.handle("dictionary:lookup", async (_event, rawWord: unknown) => {
    if (typeof rawWord !== "string") return null;
    const word = rawWord.normalize("NFKC").toLowerCase();
    if (!/^[a-z]/.test(word) || word.length > 80) return null;
    const shard = await loadDictionaryShard(dictionaryShardName(word));
    return Object.hasOwn(shard, word) ? shard[word] : null;
  });

  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:toggle-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
