import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'

dotenv.config()

function getJwtPublicKey(): string {
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH
  if (keyPath) {
    const resolved = path.resolve(keyPath)
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf-8')
    }
  }
  throw new Error(
    'JWT public key not found. Set JWT_PUBLIC_KEY_PATH in .env pointing to the RSA public key PEM file.'
  )
}

export const config = {
  app: {
    port: parseInt(process.env.APP_PORT ?? '8083', 10),
    host: process.env.APP_HOST ?? '0.0.0.0',
    env: process.env.NODE_ENV ?? 'development',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    publicKey: getJwtPublicKey(),
    algorithm: 'RS256' as const,
  },
  hmac: {
    secret: process.env.GATEWAY_HMAC_SECRET ?? '',
  },
} as const
