import { FastifyInstance } from 'fastify'
import { InboxRepository } from '../repositories/inbox.repository'

export class InboxConsumer {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: InboxRepository
  ) {}

  async start() {
    this.app.log.info('InboxConsumer started')

    const ch = this.app.amqp

    try {
      await ch.consume('cart-service.catalog-events', async (msg) => {
        if (!msg) return

        const messageId = msg.properties.messageId
        if (!messageId) {
          this.app.log.warn('Message received without messageId, rejecting')
          ch.reject(msg, false)
          return
        }

        const eventType = msg.properties.headers?.event_type || msg.fields.routingKey

        try {
          // Idempotency check
          const isProcessed = await this.repo.isProcessed(messageId)
          if (isProcessed) {
            this.app.log.debug(`Message ${messageId} already processed (idempotent)`)
            ch.ack(msg)
            return
          }

          const payload = JSON.parse(msg.content.toString())
          this.app.log.info(`Processing inbox event: ${eventType} (${messageId})`)

          // Save to inbox first
          await this.repo.saveProcessedEvent(messageId, eventType, payload)

          // Domain Logic
          if (eventType === 'catalog.product.updated') {
            const { public_id, status } = payload
            if (status === 'archived') {
              // Optionally mark cart items as unavailable
              await this.app.prisma.cartItem.updateMany({
                where: { productPublicId: public_id, deletedAt: null },
                data: { deletedAt: new Date(), deletedBy: 'system (product archived)' }
              })
            }
          }

          ch.ack(msg)
        } catch (err) {
          this.app.log.error(err, `Error processing inbox event ${messageId}`)
          ch.nack(msg, false, true) // requeue
        }
      })
    } catch (err) {
      this.app.log.error(err, 'InboxConsumer setup failed')
    }
  }
}
