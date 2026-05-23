import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import amqplib, { Channel, Connection } from 'amqplib'

declare module 'fastify' {
  interface FastifyInstance {
    amqp: Channel
  }
}

export default fp(async (app: FastifyInstance) => {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@host.docker.internal:5672/'
  
  let conn: any
  let ch: any
  const maxRetries = 5

  const connect = async () => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        app.log.info(`Connecting to RabbitMQ (attempt ${i + 1})...`)
        conn = await amqplib.connect(url)
        ch = await conn.createChannel()
        
        // Setup exchange
        await ch.assertExchange('samstore.events', 'topic', { durable: true })
        
        // Setup inbox queue
        const q = await ch.assertQueue('cart-service.catalog-events', { durable: true })
        await ch.bindQueue(q.queue, 'samstore.events', 'catalog.product.updated')
        
        app.decorate('amqp', ch)
        app.log.info('RabbitMQ connected successfully')

        conn.on('error', (err: any) => {
          app.log.error(err, 'RabbitMQ connection error')
        })

        conn.on('close', () => {
          app.log.warn('RabbitMQ connection closed')
          // Basic reconnect logic could go here
        })

        return
      } catch (err) {
        app.log.warn(`RabbitMQ connection failed: ${(err as Error).message}`)
        await new Promise((res) => setTimeout(res, 2000 * (i + 1)))
      }
    }
    throw new Error('Could not connect to RabbitMQ after max retries')
  }

  await connect()

  app.addHook('onClose', async (instance) => {
    if (ch) await ch.close()
    if (conn) await conn.close()
  })
})
