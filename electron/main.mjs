import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

let win = null;

function create() {
  const cursor = screen.getCursorScreenPoint();
  win = new BrowserWindow({
    width: 360,
    height: 520,
    x: Math.max(24, cursor.x - 180),
    y: Math.max(24, cursor.y - 160),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    title: "GrokBot",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(here, "../mac/index.html"), { query: { pet: "1" } });
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const [x, y] = w.getPosition();
  w.setPosition(Math.round(x + dx), Math.round(y + dy));
});

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
