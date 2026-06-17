const crypto = require('crypto')

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function deriveKey(password) {
  return crypto.createHash('sha256').update(password).digest()
}

function encrypt(text, password) {
  const key = deriveKey(password)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(encryptedText, password) {
  const parts = encryptedText.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted format')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]
  const key = deriveKey(password)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

module.exports = { encrypt, decrypt }
