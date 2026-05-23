import Fastify, { FastifyInstance } from 'fastify'
import prismaPlugin from './plugins/prisma'
import jwtPlugin from './plugins/jwt'
import cartRoutes from './routes/cart/cart.routes'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ─── Plugins ──────────────────────────────────────────────────────────────
  await app.register(prismaPlugin)
  await app.register(jwtPlugin)

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
