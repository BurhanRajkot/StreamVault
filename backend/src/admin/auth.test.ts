import { describe, it, expect, afterEach } from 'bun:test'
import jwt from 'jsonwebtoken'

// Mock environment variables before importing the module
// Using bun:test's mock utilities or setting process.env directly before any top-level imports

const originalEnv = { ...process.env }

// Setup the env vars before importing the module so it passes top-level validation
process.env.ADMIN_SECRET = 'test-secret'
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret'

// Use require or dynamic import to load auth after env vars are set
const authModule = require('./auth.ts')

describe('Admin Auth - generateAdminToken', () => {
  afterEach(() => {
    // Restore original environment variables manually without destroying process.env
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const key in originalEnv) {
      process.env[key] = originalEnv[key]
    }
  })

  it('should generate a valid JWT with the correct payload and expiration', () => {
    const token = authModule.generateAdminToken()

    expect(typeof token).toBe('string')

    // Verify and decode the token
    const decoded = jwt.verify(token, 'test-jwt-secret') as any

    expect(decoded.role).toBe('admin')
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()

    // Determine expected expiration by examining the decoded object
    // JWT exp is in seconds, iat is in seconds.
    // The source code sets `expiresIn: '30m'`, so exp should be iat + 30 * 60.
    expect(decoded.exp).toBe(decoded.iat + 30 * 60)
  })
})
