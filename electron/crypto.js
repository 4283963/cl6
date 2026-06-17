const crypto = require('crypto')

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16
const SALT_LENGTH = 16
const HMAC_ALGORITHM = 'sha256'
const HMAC_LENGTH = 32

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
}

function safeBufferToString(buffer) {
  try {
    const str = buffer.toString('utf8')
    const check = Buffer.from(str, 'utf8')
    if (check.equals(buffer)) {
      return str
    }
    return buffer.toString('binary')
  } catch (e) {
    return buffer.toString('binary')
  }
}

function encrypt(text, password) {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = deriveKey(password, salt)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const textBuffer = Buffer.from(text, 'utf8')
  const encrypted = Buffer.concat([
    cipher.update(textBuffer),
    cipher.final()
  ])

  const hmacKey = crypto.createHash('sha256').update(key).digest()
  const hmac = crypto.createHmac(HMAC_ALGORITHM, hmacKey)
    .update(Buffer.concat([salt, iv, encrypted]))
    .digest()

  const packet = Buffer.concat([salt, iv, encrypted, hmac])
  return packet.toString('base64')
}

function decrypt(encryptedBase64, password) {
  let packet
  try {
    packet = Buffer.from(encryptedBase64, 'base64')
  } catch (e) {
    throw new Error('Invalid base64 encoding')
  }

  const minLength = SALT_LENGTH + IV_LENGTH + HMAC_LENGTH + 1
  if (packet.length < minLength) {
    throw new Error('Encrypted data too short')
  }

  const salt = packet.slice(0, SALT_LENGTH)
  const iv = packet.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const hmac = packet.slice(packet.length - HMAC_LENGTH)
  const encrypted = packet.slice(SALT_LENGTH + IV_LENGTH, packet.length - HMAC_LENGTH)

  const key = deriveKey(password, salt)

  const hmacKey = crypto.createHash('sha256').update(key).digest()
  const expectedHmac = crypto.createHmac(HMAC_ALGORITHM, hmacKey)
    .update(Buffer.concat([salt, iv, encrypted]))
    .digest()

  if (!crypto.timingSafeEqual(hmac, expectedHmac)) {
    throw new Error('HMAC verification failed - data may be tampered or wrong password')
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    const decryptedBuffer = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    return safeBufferToString(decryptedBuffer)
  } catch (e) {
    throw new Error('Decryption failed: ' + e.message)
  }
}

module.exports = { encrypt, decrypt }
