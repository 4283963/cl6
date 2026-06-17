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

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  console.error('Stack:', error.stack)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

function createWindow() {
  try {
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

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Window load failed:', errorCode, errorDescription)
    })
  } catch (e) {
    console.error('Error creating window:', e)
  }
}

function createTray() {
  try {
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
  } catch (e) {
    console.error('Error creating tray:', e)
  }
}

function showWindow() {
  if (mainWindow) {
    try {
      mainWindow.show()
      mainWindow.focus()
    } catch (e) {
      console.error('Error showing window:', e)
    }
  }
}

function quitApp() {
  app.isQuitting = true
  try {
    if (clipboardMonitor) {
      clipboardMonitor.stop()
    }
    if (clipboardServer) {
      clipboardServer.stop()
    }
  } catch (e) {
    console.error('Error during shutdown:', e)
  }
  app.quit()
}

function getLocalIPs() {
  try {
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
  } catch (e) {
    console.error('Error getting local IPs:', e)
    return []
  }
}

function safeSendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, data)
    } catch (e) {
      console.error('Error sending to renderer:', channel, e)
    }
  }
}

function initServices() {
  try {
    deviceManager = new DeviceManager()
    clipboardMonitor = new ClipboardMonitor()

    const settings = deviceManager.getSettings()

    clipboardServer = new ClipboardServer(
      deviceManager,
      clipboardMonitor,
      () => deviceManager.getSettings().password
    )

    clipboardServer.onReceive = (data) => {
      safeSendToRenderer('clipboard:received', data)
    }

    clipboardServer.onDeviceDiscover = (device, added) => {
      if (added) {
        safeSendToRenderer('device:discovered', device)
      }
    }

    clipboardMonitor.onCopy((text) => {
      try {
        const devices = deviceManager.getDevices()
        const password = deviceManager.getSettings().password
        if (password && devices.length > 0) {
          devices.forEach(device => {
            clipboardServer.sendClipboard(device, text, password)
              .catch(err => {
                console.error('Send failed to', device ? device.name : 'unknown', ':', err.message)
              })
          })
        }
      } catch (e) {
        console.error('Error in onCopy handler:', e)
      }
    })

    clipboardMonitor.start()
    clipboardServer.start(settings.port)
  } catch (e) {
    console.error('Error initializing services:', e)
  }
}

function setupIpc() {
  ipcMain.handle('settings:get', () => {
    try {
      return deviceManager.getSettings()
    } catch (e) {
      console.error('Error in settings:get:', e)
      return { deviceName: '', password: '', port: 37248 }
    }
  })

  ipcMain.handle('settings:update', (_, newSettings) => {
    try {
      deviceManager.updateSettings(newSettings)
      const settings = deviceManager.getSettings()
      if (clipboardServer && settings.port !== clipboardServer.port) {
        clipboardServer.start(settings.port)
      }
      return settings
    } catch (e) {
      console.error('Error in settings:update:', e)
      return deviceManager.getSettings()
    }
  })

  ipcMain.handle('devices:get', () => {
    try {
      return deviceManager.getDevices()
    } catch (e) {
      console.error('Error in devices:get:', e)
      return []
    }
  })

  ipcMain.handle('devices:add', (_, device) => {
    try {
      return deviceManager.addDevice(device)
    } catch (e) {
      console.error('Error in devices:add:', e)
      return false
    }
  })

  ipcMain.handle('devices:remove', (_, deviceId) => {
    try {
      deviceManager.removeDevice(deviceId)
      return true
    } catch (e) {
      console.error('Error in devices:remove:', e)
      return false
    }
  })

  ipcMain.handle('devices:ping', async (_, ip, port) => {
    try {
      const device = await clipboardServer.pingDevice(ip, port || 37248)
      deviceManager.addDevice(device)
      return { success: true, device }
    } catch (e) {
      console.error('Error in devices:ping:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('clipboard:get', () => {
    try {
      return clipboardMonitor.getText()
    } catch (e) {
      console.error('Error in clipboard:get:', e)
      return ''
    }
  })

  ipcMain.handle('clipboard:set', (_, text) => {
    try {
      clipboardMonitor.setText(text)
      return true
    } catch (e) {
      console.error('Error in clipboard:set:', e)
      return false
    }
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
    try {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else if (mainWindow) {
        mainWindow.show()
      }
    } catch (e) {
      console.error('Error in activate handler:', e)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit, keep running in tray
  }
})

app.on('error', (error) => {
  console.error('App error:', error)
})
