const fs = require('fs')
const path = require('path')
const os = require('os')

class DeviceManager {
  constructor() {
    this.dataPath = path.join(os.homedir(), '.lan-clipboard-sync')
    this.devicesFile = path.join(this.dataPath, 'devices.json')
    this.settingsFile = path.join(this.dataPath, 'settings.json')
    this.devices = []
    this.settings = {
      password: '',
      deviceName: os.hostname(),
      port: 37248,
      autoStart: true
    }
    this.ensureDataDir()
    this.loadDevices()
    this.loadSettings()
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true })
    }
  }

  loadDevices() {
    if (fs.existsSync(this.devicesFile)) {
      try {
        const data = fs.readFileSync(this.devicesFile, 'utf8')
        this.devices = JSON.parse(data)
      } catch (e) {
        this.devices = []
      }
    }
  }

  saveDevices() {
    fs.writeFileSync(this.devicesFile, JSON.stringify(this.devices, null, 2))
  }

  addDevice(device) {
    const exists = this.devices.find(d => d.id === device.id || d.ip === device.ip)
    if (!exists) {
      this.devices.push(device)
      this.saveDevices()
      return true
    }
    return false
  }

  removeDevice(deviceId) {
    this.devices = this.devices.filter(d => d.id !== deviceId)
    this.saveDevices()
  }

  getDevices() {
    return this.devices
  }

  loadSettings() {
    if (fs.existsSync(this.settingsFile)) {
      try {
        const data = fs.readFileSync(this.settingsFile, 'utf8')
        this.settings = { ...this.settings, ...JSON.parse(data) }
      } catch (e) {
        // use defaults
      }
    }
  }

  saveSettings() {
    fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2))
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
    this.saveSettings()
  }

  getSettings() {
    return { ...this.settings }
  }

  generateDeviceId() {
    return 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }
}

module.exports = DeviceManager
