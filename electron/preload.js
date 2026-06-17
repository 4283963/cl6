const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  getDevices: () => ipcRenderer.invoke('devices:get'),
  addDevice: (device) => ipcRenderer.invoke('devices:add', device),
  removeDevice: (deviceId) => ipcRenderer.invoke('devices:remove', deviceId),
  pingDevice: (ip, port) => ipcRenderer.invoke('devices:ping', ip, port),

  getClipboard: () => ipcRenderer.invoke('clipboard:get'),
  setClipboard: (text) => ipcRenderer.invoke('clipboard:set', text),

  getLocalIPs: () => ipcRenderer.invoke('network:ips'),

  quitApp: () => ipcRenderer.invoke('app:quit'),
  hideWindow: () => ipcRenderer.invoke('app:hide'),

  onClipboardReceived: (callback) => {
    ipcRenderer.on('clipboard:received', (_, data) => callback(data))
  },

  onDeviceDiscovered: (callback) => {
    ipcRenderer.on('device:discovered', (_, device) => callback(device))
  }
})
