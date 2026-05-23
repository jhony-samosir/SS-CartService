import Fastify, { FastifyInstance } from 'fastify'
import prismaPlugin from './plugins/prisma'
import jwtPlugin from './plugins/jwt'
import loggerPlugin from './plugins/logger'
import cartRoutes from './routes/cart/cart.routes'
import { config } from './config'

function buildLoggerConfig() {
  const isProd = config.app.env === 'production'

  if (isProd) {
    // Production: plain JSON (Docker logging driver → Fluent-bit → Loki)
    return {
      level: 'info',
    }
  }

  // Development: pretty-printed with pino-pretty
  return {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerConfig(),
    // Expose elapsedTime on reply for response logging
    disableRequestLogging: true, // we handle it manually in logger plugin
    genReqId: () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  })

  // ─── Plugins ──────────────────────────────────────────────────────────────
  await app.register(prismaPlugin)
  await app.register(jwtPlugin)
  await app.register(loggerPlugin) // structured logging + correlationId

  // ─── Health Check ────────────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'ss-cart-service',
      timestamp: new Date().toISOString(),
    })
  })

  // ─── Routes ──────────────────────────────────────────────────────────────
  await app.register(cartRoutes, { prefix: '/cart' })

  return app
}
