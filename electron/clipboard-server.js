const http = require('http')
const os = require('os')
const { encrypt, decrypt } = require('./crypto')

class ClipboardServer {
  constructor(deviceManager, clipboardMonitor, passwordGetter) {
    this.server = null
    this.deviceManager = deviceManager
    this.clipboardMonitor = clipboardMonitor
    this.passwordGetter = passwordGetter
    this.port = 37248
    this.onReceive = null
    this.onDeviceDiscover = null
  }

  start(port = 37248) {
    this.port = port
    if (this.server) {
      this.server.close()
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    this.server.listen(port, '0.0.0.0', () => {
      console.log(`Clipboard server running on port ${port}`)
    })

    this.server.on('error', (err) => {
      console.error('Server error:', err)
    })
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  handleRequest(req, res) {
    this.setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 200
      res.end()
      return
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', () => {
      try {
        if (req.url === '/clipboard' && req.method === 'POST') {
          this.handleClipboardPost(body, req, res)
        } else if (req.url === '/ping' && req.method === 'POST') {
          this.handlePing(body, req, res)
        } else if (req.url === '/info' && req.method === 'GET') {
          this.handleInfo(req, res)
        } else {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Not found' }))
        }
      } catch (e) {
        console.error('Request handling error:', e)
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    })
  }

  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Content-Type', 'application/json')
  }

  handleClipboardPost(body, req, res) {
    const data = JSON.parse(body)
    const password = this.passwordGetter()

    if (!password) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Password not set' }))
      return
    }

    try {
      const text = decrypt(data.encrypted, password)
      this.clipboardMonitor.setText(text)

      if (this.onReceive) {
        this.onReceive({
          text,
          from: data.from || 'unknown',
          timestamp: Date.now()
        })
      }

      res.statusCode = 200
      res.end(JSON.stringify({ success: true }))
    } catch (e) {
      console.error('Decrypt error:', e)
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Decryption failed' }))
    }
  }

  handlePing(body, req, res) {
    const data = JSON.parse(body)
    const device = {
      id: data.id,
      name: data.name,
      ip: this.getClientIp(req),
      port: data.port || this.port
    }

    const added = this.deviceManager.addDevice(device)

    if (this.onDeviceDiscover) {
      this.onDeviceDiscover(device, added)
    }

    const settings = this.deviceManager.getSettings()
    res.statusCode = 200
    res.end(JSON.stringify({
      id: this.deviceManager.generateDeviceId(),
      name: settings.deviceName,
      port: this.port,
      added: added
    }))
  }

  handleInfo(req, res) {
    const settings = this.deviceManager.getSettings()
    res.statusCode = 200
    res.end(JSON.stringify({
      name: settings.deviceName,
      port: this.port
    }))
  }

  getClientIp(req) {
    const ip = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null)
    return ip.replace('::ffff:', '').replace('::1', '127.0.0.1')
  }

  sendClipboard(device, text, password) {
    return new Promise((resolve, reject) => {
      const encrypted = encrypt(text, password)
      const settings = this.deviceManager.getSettings()
      const data = JSON.stringify({
        encrypted,
        from: settings.deviceName
      })

      const options = {
        hostname: device.ip,
        port: device.port,
        path: '/clipboard',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }

      const req = http.request(options, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve()
          } else {
            reject(new Error(`Status ${res.statusCode}: ${body}`))
          }
        })
      })

      req.on('error', reject)
      req.setTimeout(5000, () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
      req.write(data)
      req.end()
    })
  }

  pingDevice(ip, port) {
    return new Promise((resolve, reject) => {
      const settings = this.deviceManager.getSettings()
      const data = JSON.stringify({
        id: 'local_' + Date.now(),
        name: settings.deviceName,
        port: this.port
      })

      const options = {
        hostname: ip,
        port: port,
        path: '/ping',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }

      const req = http.request(options, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          try {
            const result = JSON.parse(body)
            resolve({
              id: result.id,
              name: result.name,
              ip: ip,
              port: result.port || port
            })
          } catch (e) {
            reject(e)
          }
        })
      })

      req.on('error', reject)
      req.setTimeout(3000, () => {
        req.destroy()
        reject(new Error('Ping timeout'))
      })
      req.write(data)
      req.end()
    })
  }
}

module.exports = ClipboardServer
