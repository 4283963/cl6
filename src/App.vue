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

  window.electronAPI.onClipboardReceived((data) => {
    const preview = data.text.length > 50 ? data.text.substring(0, 50) + '...' : data.text
    addLog(`从 [${data.from}] 收到: ${preview}`)
  })

  window.electronAPI.onDeviceDiscovered(async (device) => {
    addLog(`设备自动发现: ${device.name} (${device.ip})`)
    await loadDevices()
  })

  addLog('服务已启动')
})
</script>

<template>
  <div id="app">
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
</template>
