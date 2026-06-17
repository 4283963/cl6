const fs = require('fs')
const path = require('path')
const os = require('os')

class HistoryManager {
  constructor() {
    this.maxItems = 10
    this.dataPath = path.join(os.homedir(), '.lan-clipboard-sync')
    this.historyFile = path.join(this.dataPath, 'history.json')
    this.history = []
    this.onHistoryChange = null
    this.loadHistory()
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true })
    }
  }

  loadHistory() {
    this.ensureDataDir()
    if (fs.existsSync(this.historyFile)) {
      try {
        const data = fs.readFileSync(this.historyFile, 'utf8')
        this.history = JSON.parse(data)
        this.cleanOldItems()
      } catch (e) {
        this.history = []
      }
    }
  }

  saveHistory() {
    try {
      this.ensureDataDir()
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2))
    } catch (e) {
      console.error('Error saving history:', e)
    }
  }

  cleanOldItems() {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    this.history = this.history.filter(item => (now - item.timestamp) < oneDayMs)
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems)
    }
    this.saveHistory()
  }

  addItem(text, source = 'local') {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return null
    }

    const normalizedText = text
    const existingIndex = this.history.findIndex(item => item.text === normalizedText)

    if (existingIndex !== -1) {
      const item = this.history.splice(existingIndex, 1)[0]
      item.timestamp = Date.now()
      item.source = source
      this.history.unshift(item)
    } else {
      const item = {
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        text: normalizedText,
        timestamp: Date.now(),
        source: source
      }
      this.history.unshift(item)
      if (this.history.length > this.maxItems) {
        this.history.pop()
      }
    }

    this.cleanOldItems()

    if (this.onHistoryChange) {
      try {
        this.onHistoryChange(this.getHistory())
      } catch (e) {
        console.error('Error in history change callback:', e)
      }
    }

    return this.history[0]
  }

  getHistory() {
    this.cleanOldItems()
    return [...this.history]
  }

  getItem(id) {
    return this.history.find(item => item.id === id) || null
  }

  removeItem(id) {
    const index = this.history.findIndex(item => item.id === id)
    if (index !== -1) {
      this.history.splice(index, 1)
      this.saveHistory()
      if (this.onHistoryChange) {
        try {
          this.onHistoryChange(this.getHistory())
        } catch (e) {
          console.error('Error in history change callback:', e)
        }
      }
      return true
    }
    return false
  }

  clearAll() {
    this.history = []
    this.saveHistory()
    if (this.onHistoryChange) {
      try {
        this.onHistoryChange(this.getHistory())
      } catch (e) {
        console.error('Error in history change callback:', e)
      }
    }
  }

  setMaxItems(max) {
    this.maxItems = max
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems)
      this.saveHistory()
    }
  }
}

module.exports = HistoryManager
