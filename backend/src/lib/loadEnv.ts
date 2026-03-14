import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

let envLoaded = false

/**
 * Load environment variables from both backend-local and project-root files.
 * Priority order (first wins unless process already has value):
 * 1) backend/.env.local
 * 2) backend/.env
 * 3) ../.env.local (project root)
 * 4) ../.env (project root)
 */
export function loadEnv() {
  if (envLoaded) return

  const cwd = process.cwd()
  const candidates = [
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '..', '.env.local'),
    path.resolve(cwd, '..', '.env'),
  ]

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false })
    }
  }

  envLoaded = true
}

// Execute immediately on import so dependent modules see env vars during evaluation.
loadEnv()
