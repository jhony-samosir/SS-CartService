import { FastifyInstance } from 'fastify'
import { OutboxRepository } from '../repositories/outbox.repository'

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null
  private isProcessing = false

  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: OutboxRepository
  ) {}

  start() {
    this.app.log.info('OutboxWorker started')
    this.timer = setInterval(() => this.processPending(), 5000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.app.log.info('OutboxWorker stopped')
  }

  private async processPending() {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      const events = await this.repo.fetchPending(50)
      if (events.length === 0) {
        this.isProcessing = false
        return
      }

      for (const event of events) {
        try {
          const routingKey = event.event_type.toLowerCase()
          
          const payload = Buffer.from(JSON.stringify(event.payload))
          
          const published = this.app.amqp.publish(
            'samstore.events',
            routingKey,
            payload,
            {
              messageId: event.public_id,
              persistent: true,
              headers: {
                event_type: event.event_type,
                service: 'ss-cart-service',
              },
            }
          )

          if (published) {
            await this.repo.markAsPublished(event.id)
            this.app.log.info(`Outbox event published: ${event.event_type} (${event.public_id})`)
          } else {
            throw new Error('RabbitMQ channel buffer full')
          }
        } catch (err) {
          this.app.log.error(err, `Failed to publish outbox event: ${event.id}`)
          await this.repo.markAsFailed(event.id, (err as Error).message)
        }
      }
    } catch (err) {
      this.app.log.error(err, 'Outbox worker error')
    } finally {
      this.isProcessing = false
    }
  }
}
