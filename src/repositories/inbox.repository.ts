import { PrismaClient } from '@prisma/client'

export class InboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isProcessed(messageId: string): Promise<boolean> {
    const existing = await this.prisma.inboxEvent.findUnique({
      where: { messageId },
    })
    return !!existing
  }

  async saveProcessedEvent(messageId: string, eventType: string, payload: any) {
    return this.prisma.inboxEvent.upsert({
      where: { messageId },
      update: {}, // do nothing if it exists
      create: {
        messageId,
        eventType,
        payload,
        status: 'processed',
      },
    })
  }
}
