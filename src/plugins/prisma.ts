import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (app: FastifyInstance) => {
  const prisma = new PrismaClient({
    log: app.log.level === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  })

  await prisma.$connect()
  app.log.info('Prisma connected to PostgreSQL')

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
    app.log.info('Prisma disconnected')
  })
})
