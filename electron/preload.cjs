const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("blomo", {
  openDropboxAuthorization: (url) => ipcRenderer.invoke("blomo:open-dropbox-authorization", url),
});
