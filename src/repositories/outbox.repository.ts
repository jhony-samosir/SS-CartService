import { PrismaClient, Prisma } from '@prisma/client'

export class OutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createEvent(eventType: string, aggregateType: string, aggregateId: number, payload: any, createdBy: string) {
    return this.prisma.outboxEvent.create({
      data: {
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as any,
        createdBy
      }
    })
  }

  async fetchPending(limit: number = 50) {
    // Prisma does not have raw FOR UPDATE SKIP LOCKED without $queryRaw
    // We will use queryRaw for safe fetching
    const events = await this.prisma.$queryRaw<
      {
        id: number
        public_id: string
        event_type: string
        aggregate_type: string
        aggregate_id: number
        payload: any
        status: string
        retry_count: number
      }[]
    >`
      SELECT * FROM "outbox_events"
      WHERE "status" = 'pending' AND "retry_count" < 5
      ORDER BY "created_at" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    return events
  }

  async markAsPublished(id: number) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date(),
      },
    })
  }

  async markAsFailed(id: number, errorMessage: string) {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } })
    if (!event) return

    const newRetryCount = event.retryCount + 1
    const newStatus = newRetryCount >= 5 ? 'failed' : 'pending'

    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: newStatus,
        retryCount: newRetryCount,
        errorMessage: errorMessage.substring(0, 500),
      },
    })
  }
}
