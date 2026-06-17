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
    try {
      this.lastText = this.safeReadText()
    } catch (e) {
      console.error('Error reading initial clipboard:', e)
      this.lastText = ''
    }
    this.isWatching = true
    this.interval = setInterval(() => {
      try {
        this.checkClipboard()
      } catch (e) {
        console.error('Error in clipboard check:', e)
      }
    }, intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.isWatching = false
  }

  safeReadText() {
    try {
      const text = clipboard.readText()
      if (typeof text === 'string') {
        return text
      }
      return ''
    } catch (e) {
      console.error('Error reading clipboard:', e)
      return ''
    }
  }

  checkClipboard() {
    const currentText = this.safeReadText()
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
    try {
      if (typeof text !== 'string') {
        throw new Error('Clipboard text must be a string')
      }
      this.ignoreNextChange = true
      clipboard.writeText(text)
      this.lastText = text
    } catch (e) {
      console.error('Error writing clipboard:', e)
      this.ignoreNextChange = false
      throw e
    }
  }

  getText() {
    return this.safeReadText()
  }

  onCopy(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback)
    }
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
