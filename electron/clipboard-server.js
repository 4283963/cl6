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
      try {
        this.server.close()
      } catch (e) {
        console.error('Error closing server:', e)
      }
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    this.server.on('error', (err) => {
      console.error('Server error:', err)
    })

    this.server.listen(port, '0.0.0.0', () => {
      console.log(`Clipboard server running on port ${port}`)
    })
  }

  stop() {
    if (this.server) {
      try {
        this.server.close()
      } catch (e) {
        console.error('Error stopping server:', e)
      }
      this.server = null
    }
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let totalLength = 0
      const maxSize = 10 * 1024 * 1024

      req.on('data', (chunk) => {
        try {
          if (totalLength + chunk.length > maxSize) {
            reject(new Error('Request body too large'))
            req.destroy()
            return
          }
          chunks.push(chunk)
          totalLength += chunk.length
        } catch (e) {
          reject(e)
        }
      })

      req.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks, totalLength)
          resolve(buffer.toString('utf8'))
        } catch (e) {
          reject(e)
        }
      })

      req.on('error', reject)
    })
  }

  handleRequest(req, res) {
    this.setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 200
      res.end()
      return
    }

    this.readBody(req)
      .then((body) => {
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
      })
      .catch((e) => {
        console.error('Error reading request body:', e)
        try {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid request body' }))
        } catch (err) {
          console.error('Error sending response:', err)
        }
      })
  }

  setCorsHeaders(res) {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Content-Type', 'application/json')
    } catch (e) {
      console.error('Error setting CORS headers:', e)
    }
  }

  handleClipboardPost(body, req, res) {
    try {
      let data
      try {
        data = JSON.parse(body)
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      if (!data || typeof data.encrypted !== 'string') {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Missing encrypted field' }))
        return
      }

      const password = this.passwordGetter()
      if (!password) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Password not set' }))
        return
      }

      let text
      try {
        text = decrypt(data.encrypted, password)
      } catch (e) {
        console.error('Decrypt error:', e.message)
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Decryption failed: ' + e.message }))
        return
      }

      if (typeof text !== 'string' || text.length === 0) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Empty or invalid decrypted content' }))
        return
      }

      try {
        this.clipboardMonitor.setText(text)
      } catch (e) {
        console.error('Clipboard write error:', e)
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Failed to write clipboard' }))
        return
      }

      try {
        if (this.onReceive) {
          this.onReceive({
            text: text.length > 500 ? text.substring(0, 500) + '...' : text,
            from: data.from || 'unknown',
            timestamp: Date.now()
          })
        }
      } catch (e) {
        console.error('Error in onReceive callback:', e)
      }

      res.statusCode = 200
      res.end(JSON.stringify({ success: true }))
    } catch (e) {
      console.error('Unexpected error in handleClipboardPost:', e)
      try {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Internal server error' }))
      } catch (err) {
        console.error('Error sending error response:', err)
      }
    }
  }

  handlePing(body, req, res) {
    try {
      let data
      try {
        data = JSON.parse(body)
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      const device = {
        id: data.id,
        name: data.name,
        ip: this.getClientIp(req),
        port: data.port || this.port
      }

      const added = this.deviceManager.addDevice(device)

      try {
        if (this.onDeviceDiscover) {
          this.onDeviceDiscover(device, added)
        }
      } catch (e) {
        console.error('Error in onDeviceDiscover callback:', e)
      }

      const settings = this.deviceManager.getSettings()
      res.statusCode = 200
      res.end(JSON.stringify({
        id: this.deviceManager.generateDeviceId(),
        name: settings.deviceName,
        port: this.port,
        added: added
      }))
    } catch (e) {
      console.error('Unexpected error in handlePing:', e)
      try {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Internal server error' }))
      } catch (err) {
        console.error('Error sending error response:', err)
      }
    }
  }

  handleInfo(req, res) {
    try {
      const settings = this.deviceManager.getSettings()
      res.statusCode = 200
      res.end(JSON.stringify({
        name: settings.deviceName,
        port: this.port
      }))
    } catch (e) {
      console.error('Error in handleInfo:', e)
      try {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Internal server error' }))
      } catch (err) {
        console.error('Error sending error response:', err)
      }
    }
  }

  getClientIp(req) {
    try {
      const ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null)
      return ip ? ip.replace('::ffff:', '').replace('::1', '127.0.0.1') : 'unknown'
    } catch (e) {
      return 'unknown'
    }
  }

  sendClipboard(device, text, password) {
    return new Promise((resolve, reject) => {
      try {
        if (!password) {
          reject(new Error('Password not set'))
          return
        }

        let encrypted
        try {
          encrypted = encrypt(text, password)
        } catch (e) {
          reject(new Error('Encryption failed: ' + e.message))
          return
        }

        const settings = this.deviceManager.getSettings()
        const payload = {
          encrypted,
          from: settings.deviceName
        }
        const data = JSON.stringify(payload)

        const options = {
          hostname: device.ip,
          port: device.port,
          path: '/clipboard',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          },
          timeout: 5000
        }

        const req = http.request(options, (res) => {
          const chunks = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                resolve()
              } else {
                const body = Buffer.concat(chunks).toString('utf8')
                reject(new Error(`Status ${res.statusCode}: ${body}`))
              }
            } catch (e) {
              reject(e)
            }
          })
        })

        req.on('error', reject)
        req.on('timeout', () => {
          try {
            req.destroy()
          } catch (e) {
            // ignore
          }
          reject(new Error('Request timeout'))
        })

        req.write(data)
        req.end()
      } catch (e) {
        reject(e)
      }
    })
  }

  pingDevice(ip, port) {
    return new Promise((resolve, reject) => {
      try {
        const settings = this.deviceManager.getSettings()
        const payload = {
          id: 'local_' + Date.now(),
          name: settings.deviceName,
          port: this.port
        }
        const data = JSON.stringify(payload)

        const options = {
          hostname: ip,
          port: port,
          path: '/ping',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          },
          timeout: 3000
        }

        const req = http.request(options, (res) => {
          const chunks = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf8')
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
        req.on('timeout', () => {
          try {
            req.destroy()
          } catch (e) {
            // ignore
          }
          reject(new Error('Ping timeout'))
        })

        req.write(data)
        req.end()
      } catch (e) {
        reject(e)
      }
    })
  }
}

module.exports = ClipboardServer
