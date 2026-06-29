import { Request } from 'express'
import type { AuthResult } from 'express-oauth2-jwt-bearer'

export function getUserId(req: Request) {
  // auth is attached by express-oauth2-jwt-bearer or our dev middleware
  const auth = (req as Request & { auth?: AuthResult }).auth
  return auth?.payload?.sub as string | undefined
}
