const { clipboard } = require('electron')

class ClipboardMonitor {
  constructor() {
    this.lastText = ''
    this.interval = null
    this.listeners = []
    this.isWatching = false
    this.ignoreNextChange = false
  }

  start(intervalMs = 500) {
    if (this.isWatching) return
    this.lastText = clipboard.readText()
    this.isWatching = true
    this.interval = setInterval(() => {
      this.checkClipboard()
    }, intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.isWatching = false
  }

  checkClipboard() {
    const currentText = clipboard.readText()
    if (currentText !== this.lastText && currentText.length > 0) {
      if (this.ignoreNextChange) {
        this.ignoreNextChange = false
        this.lastText = currentText
        return
      }
      this.lastText = currentText
      this.notifyListeners(currentText)
    }
  }

  setText(text) {
    this.ignoreNextChange = true
    clipboard.writeText(text)
    this.lastText = text
  }

  getText() {
    return clipboard.readText()
  }

  onCopy(callback) {
    this.listeners.push(callback)
  }

  notifyListeners(text) {
    this.listeners.forEach(cb => {
      try {
        cb(text)
      } catch (e) {
        console.error('Clipboard listener error:', e)
      }
    })
  }
}

module.exports = ClipboardMonitor
