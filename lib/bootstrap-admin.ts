import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { sqlite } from './db'

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derivedKey}`
}

export function bootstrapAdminAccount() {
  try {
    let adminEmail = process.env.ADMIN_EMAIL
    let adminName = process.env.ADMIN_NAME || 'SuperChat Admin'
    let adminPassword = process.env.ADMIN_PASSWORD

    // Also check appconfig.json if present
    const configPath = path.join(process.cwd(), 'appconfig.json')
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        if (fileContent?.admin?.email) adminEmail = String(fileContent.admin.email)
        if (fileContent?.admin?.name) adminName = String(fileContent.admin.name)
        if (fileContent?.admin?.password) adminPassword = String(fileContent.admin.password)
      } catch (err) {
        console.error('[Admin Bootstrap] Error parsing appconfig.json:', err)
      }
    }

    if (!adminEmail || !adminEmail.trim()) {
      return
    }

    adminEmail = adminEmail.trim().toLowerCase()
    adminName = adminName.trim()

    // 1. Check if user exists by email
    const existingUser = sqlite
      .prepare('SELECT id, name, email, role FROM "user" WHERE LOWER(email) = ?')
      .get(adminEmail) as { id: string; name: string; email: string; role?: string } | undefined

    if (existingUser) {
      // Modify/Update existing account to role = 'admin' and update name
      sqlite
        .prepare('UPDATE "user" SET role = \'admin\', name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(adminName, existingUser.id)

      // If password specified, update account table
      if (adminPassword && adminPassword.trim()) {
        const hashedPassword = hashPassword(adminPassword.trim())
        const existingAccount = sqlite
          .prepare('SELECT id FROM account WHERE user_id = ? OR userId = ?')
          .get(existingUser.id, existingUser.id) as { id: string } | undefined

        if (existingAccount) {
          sqlite
            .prepare('UPDATE account SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hashedPassword, existingAccount.id)
        } else {
          const accountId = crypto.randomUUID()
          sqlite
            .prepare(
              `INSERT INTO account (id, userId, user_id, providerId, provider_id, accountId, account_id, password, created_at, updated_at)
               VALUES (?, ?, ?, 'credential', 'credential', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            )
            .run(accountId, existingUser.id, existingUser.id, adminEmail, adminEmail, hashedPassword)
        }
      }
      console.log(`[Admin Bootstrap] Verified & updated admin account: ${adminEmail} (role: admin)`)
    } else {
      // Create new user & account in SQLite database
      const userId = crypto.randomUUID()
      const accountId = crypto.randomUUID()
      const passwordToUse = adminPassword && adminPassword.trim() ? adminPassword.trim() : 'admin123456'
      const hashedPassword = hashPassword(passwordToUse)

      sqlite
        .prepare(
          `INSERT INTO "user" (id, name, email, email_verified, emailVerified, role, created_at, updated_at)
           VALUES (?, ?, ?, 1, 1, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .run(userId, adminName, adminEmail)

      sqlite
        .prepare(
          `INSERT INTO account (id, userId, user_id, providerId, provider_id, accountId, account_id, password, created_at, updated_at)
           VALUES (?, ?, ?, 'credential', 'credential', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .run(accountId, userId, userId, adminEmail, adminEmail, hashedPassword)

      console.log(`[Admin Bootstrap] Created new admin account: ${adminEmail} (role: admin)`)
    }
  } catch (err) {
    console.error('[Admin Bootstrap Failed]', err)
  }
}
