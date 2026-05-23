import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  // Attach correlationId from API Gateway header to every request
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ??
      `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    req.log = req.log.child({
      correlationId,
      service: 'ss-cart-service',
    })
  })

  // Log request completed with duration and userId if available
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user?.userId ?? null
    req.log.info(
      {
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        userId,
      },
      'request completed'
    )
  })

  // Log unhandled errors with stack trace
  app.addHook('onError', async (req: FastifyRequest, _reply: FastifyReply, error: Error) => {
    req.log.error(
      {
        method: req.method,
        url: req.url,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      'request error'
    )
  })
})
