import dotenv from 'dotenv'
dotenv.config() // ✅ MUST be first

import { auth } from 'express-oauth2-jwt-bearer'
import { Request, Response, NextFunction } from 'express'

let checkJwt: any

if (process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_AUDIENCE) {
  checkJwt = auth({
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    audience: process.env.AUTH0_AUDIENCE,
  })
} else {
  // Development mode: skip auth validation
  checkJwt = (_req: Request, _res: Response, next: NextFunction) => {
    next()
  }
}

export { checkJwt }
