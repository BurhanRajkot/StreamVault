import dotenv from 'dotenv'
dotenv.config() // ✅ MUST be first

import { auth } from 'express-oauth2-jwt-bearer'

export const checkJwt = auth({
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL!,
  audience: process.env.AUTH0_AUDIENCE!,
})
