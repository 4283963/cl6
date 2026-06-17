<script setup>
import { ref, onMounted, computed } from 'vue'

const settings = ref({
  deviceName: '',
  password: '',
  port: 37248
})

const devices = ref([])
const logs = ref([])
const localIPs = ref([])
const activeTab = ref('devices')
const history = ref([])
const showSidebar = ref(true)

const newDeviceIp = ref('')
const newDevicePort = ref(37248)
const isPinging = ref(false)
const pingMessage = ref('')

const statusText = computed(() => {
  if (!settings.value.password) return '未设置密码'
  if (devices.value.length === 0) return '无配对设备'
  return `已连接 ${devices.value.length} 台设备`
})

const statusClass = computed(() => {
  if (!settings.value.password) return 'warning'
  if (devices.value.length === 0) return 'warning'
  return 'success'
})

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function formatPreview(text, maxLen = 60) {
  if (!text) return ''
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > maxLen ? singleLine.substring(0, maxLen) + '...' : singleLine
}

function getSourceLabel(source) {
  const labels = {
    local: '本地复制',
    remote: '设备同步',
    manual: '手动恢复'
  }
  return labels[source] || source
}

function getSourceClass(source) {
  const classes = {
    local: 'source-local',
    remote: 'source-remote',
    manual: 'source-manual'
  }
  return classes[source] || ''
}

function addLog(text) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  logs.value.unshift({ time, text })
  if (logs.value.length > 50) {
    logs.value.pop()
  }
}

async function loadSettings() {
  settings.value = await window.electronAPI.getSettings()
}

async function saveSettings() {
  await window.electronAPI.updateSettings(settings.value)
  addLog('设置已保存')
}

async function loadDevices() {
  devices.value = await window.electronAPI.getDevices()
}

async function loadIPs() {
  localIPs.value = await window.electronAPI.getLocalIPs()
}

async function loadHistory() {
  history.value = await window.electronAPI.getHistory()
}

async function pingAndAddDevice() {
  if (!newDeviceIp.value.trim()) {
    pingMessage.value = '请输入设备 IP 地址'
    return
  }
  isPinging.value = true
  pingMessage.value = ''
  try {
    const result = await window.electronAPI.pingDevice(newDeviceIp.value.trim(), newDevicePort.value)
    if (result.success) {
      pingMessage.value = `已成功配对设备: ${result.device.name}`
      addLog(`发现新设备: ${result.device.name} (${result.device.ip})`)
      await loadDevices()
      newDeviceIp.value = ''
    } else {
      pingMessage.value = '配对失败: ' + result.error
    }
  } catch (e) {
    pingMessage.value = '配对失败: ' + e.message
  }
  isPinging.value = false
}

async function removeDevice(deviceId) {
  await window.electronAPI.removeDevice(deviceId)
  await loadDevices()
  addLog('已移除设备')
}

async function copyHistoryItem(item) {
  try {
    const success = await window.electronAPI.copyHistoryItem(item.id)
    if (success) {
      addLog(`已复制历史记录: ${formatPreview(item.text, 30)}`)
    } else {
      addLog('复制失败')
    }
  } catch (e) {
    addLog('复制失败: ' + e.message)
  }
}

async function removeHistoryItem(id) {
  await window.electronAPI.removeHistoryItem(id)
  await loadHistory()
}

async function clearHistory() {
  if (confirm('确定要清空所有历史记录吗？')) {
    await window.electronAPI.clearHistory()
    await loadHistory()
    addLog('已清空历史记录')
  }
}

function hideApp() {
  window.electronAPI.hideWindow()
}

function quitApp() {
  window.electronAPI.quitApp()
}

onMounted(async () => {
  await loadSettings()
  await loadDevices()
  await loadIPs()
  await loadHistory()

  window.electronAPI.onClipboardReceived((data) => {
    const preview = data.text.length > 50 ? data.text.substring(0, 50) + '...' : data.text
    addLog(`从 [${data.from}] 收到: ${preview}`)
  })

  window.electronAPI.onDeviceDiscovered(async (device) => {
    addLog(`设备自动发现: ${device.name} (${device.ip})`)
    await loadDevices()
  })

  window.electronAPI.onHistoryChanged((newHistory) => {
    history.value = newHistory
  })

  addLog('服务已启动')
})
</script>

<template>
  <div class="app-container">
    <div class="main-content" :class="{ 'sidebar-collapsed': !showSidebar }">
      <div class="card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div class="card-title">局域网剪贴板同步</div>
            <span class="status-badge" :class="statusClass">{{ statusText }}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" @click="hideApp">最小化</button>
            <button class="btn btn-danger btn-sm" @click="quitApp">退出</button>
          </div>
        </div>
        <div v-if="localIPs.length > 0" style="margin-top: 10px;">
          <div style="font-size: 12px; color: #666;">本机 IP 地址:</div>
          <div class="ip-list">
            <span v-for="ip in localIPs" :key="ip" class="ip-item">{{ ip }}</span>
          </div>
        </div>
      </div>

      <div class="tabs">
        <div class="tab" :class="{ active: activeTab === 'devices' }" @click="activeTab = 'devices'">设备管理</div>
        <div class="tab" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">设置</div>
        <div class="tab" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">日志</div>
      </div>

      <div v-show="activeTab === 'devices'">
        <div class="card">
          <div class="card-title">添加设备</div>
          <div class="row">
            <div class="form-group">
              <label class="form-label">设备 IP</label>
              <input type="text" class="form-input" v-model="newDeviceIp" placeholder="例如 192.168.1.100">
            </div>
            <div class="form-group" style="max-width: 100px;">
              <label class="form-label">端口</label>
              <input type="number" class="form-input port-input" v-model.number="newDevicePort">
            </div>
            <div class="form-group" style="max-width: 100px;">
              <button class="btn btn-primary" @click="pingAndAddDevice" :disabled="isPinging" style="width: 100%;">
                {{ isPinging ? '配对中...' : '配对' }}
              </button>
            </div>
          </div>
          <div v-if="pingMessage" style="font-size: 12px; color: #666; margin-top: 4px;">
            {{ pingMessage }}
          </div>
        </div>

        <div class="card">
          <div class="card-title">已配对设备 ({{ devices.length }})</div>
          <div v-if="devices.length === 0" class="empty-state">
            暂无配对设备，请在上方添加同一局域网内的其他设备
          </div>
          <div v-for="device in devices" :key="device.id" class="device-item">
            <div class="device-info">
              <div class="device-name">{{ device.name }}</div>
              <div class="device-ip">{{ device.ip }}:{{ device.port }}</div>
            </div>
            <div class="device-actions">
              <button class="btn btn-danger btn-sm" @click="removeDevice(device.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'settings'">
        <div class="card">
          <div class="card-title">基本设置</div>
          <div class="form-group">
            <label class="form-label">设备名称</label>
            <input type="text" class="form-input" v-model="settings.deviceName">
          </div>
          <div class="form-group">
            <label class="form-label">监听端口</label>
            <input type="number" class="form-input port-input" v-model.number="settings.port">
          </div>
        </div>

        <div class="card">
          <div class="card-title">加密设置</div>
          <div class="form-group">
            <label class="form-label">加密密码（所有设备必须一致）</label>
            <input type="password" class="form-input" v-model="settings.password" placeholder="请输入加密密码">
            <div style="font-size: 11px; color: #999; margin-top: 4px;">
              使用 AES-256-CBC 加密，所有配对设备需使用相同密码才能解密
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <button class="btn btn-primary" @click="saveSettings">保存设置</button>
        </div>
      </div>

      <div v-show="activeTab === 'logs'">
        <div class="card">
          <div class="card-title">活动日志</div>
          <div v-if="logs.length === 0" class="empty-state">暂无日志</div>
          <div v-for="(log, idx) in logs" :key="idx" class="log-item">
            <span class="log-time">[{{ log.time }}]</span>
            <span class="log-content">{{ log.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar" :class="{ collapsed: !showSidebar }">
      <div class="sidebar-header">
        <span class="sidebar-title">剪贴板历史</span>
        <div class="sidebar-actions">
          <button class="btn btn-secondary btn-sm" @click="clearHistory" :disabled="history.length === 0" title="清空历史">
            清空
          </button>
          <button class="btn btn-secondary btn-sm sidebar-toggle" @click="showSidebar = !showSidebar" :title="showSidebar ? '收起' : '展开'">
            {{ showSidebar ? '◀' : '▶' }}
          </button>
        </div>
      </div>

      <div v-if="showSidebar" class="sidebar-content">
        <div v-if="history.length === 0" class="empty-state history-empty">
          暂无历史记录<br>
          <span style="font-size: 11px;">复制的内容会自动保存在这里</span>
        </div>
        <div v-for="item in history" :key="item.id" class="history-item">
          <div class="history-item-header">
            <span class="history-time">{{ formatTime(item.timestamp) }}</span>
            <span class="history-source" :class="getSourceClass(item.source)">{{ getSourceLabel(item.source) }}</span>
          </div>
          <div class="history-text" :title="item.text">{{ formatPreview(item.text, 80) }}</div>
          <div class="history-item-actions">
            <button class="btn btn-primary btn-sm" @click="copyHistoryItem(item)">
              复制
            </button>
            <button class="btn btn-secondary btn-sm" @click="removeHistoryItem(item.id)">
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
  background: #f5f5f5;
}

.main-content {
  flex: 1;
  padding: 20px;
  transition: all 0.3s ease;
  overflow-y: auto;
}

.main-content.sidebar-collapsed {
  margin-right: 0;
}

.sidebar {
  width: 280px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.sidebar.collapsed {
  width: 50px;
}

.sidebar-header {
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar.collapsed .sidebar-header {
  justify-content: center;
  padding: 12px 8px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.sidebar.collapsed .sidebar-title {
  display: none;
}

.sidebar-actions {
  display: flex;
  gap: 4px;
}

.sidebar.collapsed .sidebar-actions {
  flex-direction: column;
}

.sidebar.collapsed .sidebar-actions .btn:not(.sidebar-toggle) {
  display: none;
}

.sidebar-toggle {
  min-width: 24px;
  padding: 4px 6px;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.sidebar.collapsed .sidebar-content {
  display: none;
}

.history-item {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid #e9ecef;
  transition: all 0.2s ease;
}

.history-item:hover {
  background: #e9ecef;
  border-color: #dee2e6;
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.history-time {
  font-size: 11px;
  color: #868e96;
  font-family: 'Monaco', 'Menlo', monospace;
}

.history-source {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.source-local {
  background: #e3f2fd;
  color: #1565c0;
}

.source-remote {
  background: #e8f5e9;
  color: #2e7d32;
}

.source-manual {
  background: #fff3e0;
  color: #ef6c00;
}

.history-text {
  font-size: 12px;
  color: #495057;
  line-height: 1.5;
  word-break: break-all;
  max-height: 48px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.history-item-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.history-item-actions .btn {
  flex: 1;
  font-size: 11px;
  padding: 4px 8px;
}

.history-empty {
  text-align: center;
  padding: 40px 10px;
  color: #adb5bd;
  font-size: 13px;
  line-height: 1.8;
}
</style>
