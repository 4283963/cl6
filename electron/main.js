const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const os = require('os')

const DeviceManager = require('./device-manager')
const ClipboardMonitor = require('./clipboard-monitor')
const ClipboardServer = require('./clipboard-server')

let mainWindow = null
let tray = null
let deviceManager = null
let clipboardMonitor = null
let clipboardServer = null

const isDev = !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 650,
    resizable: true,
    minimizable: true,
    maximizable: false,
    title: '局域网剪贴板同步',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('局域网剪贴板同步')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => showWindow() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => showWindow())
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
}

function quitApp() {
  app.isQuitting = true
  if (clipboardMonitor) {
    clipboardMonitor.stop()
  }
  if (clipboardServer) {
    clipboardServer.stop()
  }
  app.quit()
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

function initServices() {
  deviceManager = new DeviceManager()
  clipboardMonitor = new ClipboardMonitor()

  const settings = deviceManager.getSettings()

  clipboardServer = new ClipboardServer(
    deviceManager,
    clipboardMonitor,
    () => deviceManager.getSettings().password
  )

  clipboardServer.onReceive = (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('clipboard:received', data)
    }
  }

  clipboardServer.onDeviceDiscover = (device, added) => {
    if (mainWindow && added) {
      mainWindow.webContents.send('device:discovered', device)
    }
  }

  clipboardMonitor.onCopy((text) => {
    const devices = deviceManager.getDevices()
    const password = deviceManager.getSettings().password
    if (password && devices.length > 0) {
      devices.forEach(device => {
        clipboardServer.sendClipboard(device, text, password)
          .catch(err => console.error('Send failed to', device.name, err.message))
      })
    }
  })

  clipboardMonitor.start()
  clipboardServer.start(settings.port)
}

function setupIpc() {
  ipcMain.handle('settings:get', () => {
    return deviceManager.getSettings()
  })

  ipcMain.handle('settings:update', (_, newSettings) => {
    deviceManager.updateSettings(newSettings)
    const settings = deviceManager.getSettings()
    if (clipboardServer && settings.port !== clipboardServer.port) {
      clipboardServer.start(settings.port)
    }
    return settings
  })

  ipcMain.handle('devices:get', () => {
    return deviceManager.getDevices()
  })

  ipcMain.handle('devices:add', (_, device) => {
    return deviceManager.addDevice(device)
  })

  ipcMain.handle('devices:remove', (_, deviceId) => {
    deviceManager.removeDevice(deviceId)
    return true
  })

  ipcMain.handle('devices:ping', async (_, ip, port) => {
    try {
      const device = await clipboardServer.pingDevice(ip, port || 37248)
      deviceManager.addDevice(device)
      return { success: true, device }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('clipboard:get', () => {
    return clipboardMonitor.getText()
  })

  ipcMain.handle('clipboard:set', (_, text) => {
    clipboardMonitor.setText(text)
    return true
  })

  ipcMain.handle('network:ips', () => {
    return getLocalIPs()
  })

  ipcMain.handle('app:quit', () => {
    quitApp()
  })

  ipcMain.handle('app:hide', () => {
    if (mainWindow) {
      mainWindow.hide()
    }
  })
}

app.whenReady().then(() => {
  initServices()
  setupIpc()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit, keep running in tray
  }
})
