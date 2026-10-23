const { app, BrowserWindow, ipcMain, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const webRoot = path.resolve(__dirname, "../dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const filePath = path.resolve(webRoot, `.${pathname}`);
  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const resolvedPath = filePath === webRoot ? path.join(webRoot, "index.html") : filePath;
  fs.readFile(resolvedPath, (error, contents) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(resolvedPath)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  });
});

function createWindow() {
  const window = new BrowserWindow({
    width: 940,
    height: 780,
    minWidth: 360,
    minHeight: 520,
    title: "Blomo · 随手记",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.loadURL("http://localhost:4317/");
}

ipcMain.handle("blomo:open-dropbox-authorization", async (_event, url) => {
  const authorizationUrl = new URL(url);
  if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "www.dropbox.com") {
    throw new Error("Invalid Dropbox authorization URL");
  }
  await shell.openExternal(authorizationUrl.toString());
});

app.whenReady().then(() => {
  server.listen(4317, "127.0.0.1", () => {
    createWindow();
  });

  server.on("error", (error) => {
    console.error("Unable to start the local app server:", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => server.close());
