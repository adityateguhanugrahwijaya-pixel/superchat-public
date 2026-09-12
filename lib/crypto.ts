import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const DEFAULT_SECRET = 'superchat_default_secret_key_bynara_auth_32bytes_min'
function key() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || DEFAULT_SECRET
  return Buffer.from(secret, 'utf8').subarray(0, 32)
}
export function encryptSecret(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}` }
export function decryptSecret(value: string) { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8') }
