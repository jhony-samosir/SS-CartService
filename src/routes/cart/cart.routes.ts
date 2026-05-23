import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { CartService } from '../../services/cart.service'
import { CartRepository } from '../../repositories/cart.repository'
import { OutboxRepository } from '../../repositories/outbox.repository'
import { CatalogClient } from '../../services/catalog-client'
import {
  AddCartItemSchema,
  UpdateCartItemSchema,
  CartItemParamsSchema,
  AddCartItemInput,
  UpdateCartItemInput,
  CartItemParams,
} from '../../schemas/cart.schema'

export default async function cartRoutes(app: FastifyInstance) {
  const repo = new CartRepository(app.prisma)
  const outboxRepo = new OutboxRepository(app.prisma)
  const catalogClient = new CatalogClient()
  const service = new CartService(repo, outboxRepo, catalogClient)

  // ─── GET /cart ────────────────────────────────────────────────────────────
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user.userId
      const result = await service.getCart(userId)
      return reply.send({ data: result })
    }
  )

  // ─── POST /cart/items ─────────────────────────────────────────────────────
  app.post<{ Body: AddCartItemInput }>(
    '/items',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Body: AddCartItemInput }>, reply: FastifyReply) => {
      const parsed = AddCartItemSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation Error', details: parsed.error.format() })
      }

      const userId = req.user.userId
      const actorEmail = req.user.email
      const result = await service.addItem(userId, parsed.data, actorEmail)

      if (result.validationError) {
        return reply.code(400).send({ error: result.validationError })
      }
      if (result.outOfStock) {
        return reply.code(409).send({ error: 'Out of stock', availableStock: result.availableStock })
      }

      return reply.code(201).send({ data: result.item })
    }
  )

  // ─── PUT /cart/items/:publicId ────────────────────────────────────────────
  app.put<{ Params: CartItemParams; Body: UpdateCartItemInput }>(
    '/items/:publicId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: CartItemParams; Body: UpdateCartItemInput }>,
      reply: FastifyReply
    ) => {
      const paramsParsed = CartItemParamsSchema.safeParse(req.params)
      if (!paramsParsed.success) {
        return reply.code(400).send({ error: 'Invalid publicId format' })
      }

      const bodyParsed = UpdateCartItemSchema.safeParse(req.body)
      if (!bodyParsed.success) {
        return reply.code(400).send({ error: 'Validation Error', details: bodyParsed.error.format() })
      }

      const userId = req.user.userId
      const actorEmail = req.user.email
      const result = await service.updateItem(
        paramsParsed.data.publicId,
        userId,
        bodyParsed.data,
        actorEmail
      )

      if (result.notFound) return reply.code(404).send({ error: 'Cart item not found' })
      if (result.forbidden) return reply.code(403).send({ error: 'Access denied' })

      return reply.send({ data: result })
    }
  )

  // ─── DELETE /cart/items/:publicId ─────────────────────────────────────────
  app.delete<{ Params: CartItemParams }>(
    '/items/:publicId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: CartItemParams }>, reply: FastifyReply) => {
      const paramsParsed = CartItemParamsSchema.safeParse(req.params)
      if (!paramsParsed.success) {
        return reply.code(400).send({ error: 'Invalid publicId format' })
      }

      const userId = req.user.userId
      const actorEmail = req.user.email
      const result = await service.removeItem(paramsParsed.data.publicId, userId, actorEmail)

      if (result.notFound) return reply.code(404).send({ error: 'Cart item not found' })
      if (result.forbidden) return reply.code(403).send({ error: 'Access denied' })

      return reply.code(204).send()
    }
  )

  // ─── DELETE /cart ─────────────────────────────────────────────────────────
  app.delete(
    '/',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user.userId
      const actorEmail = req.user.email
      const result = await service.clearCart(userId, actorEmail)

      if (result.notFound) return reply.code(404).send({ error: 'No active cart found' })

      return reply.code(204).send()
    }
  )
  // ─── POST /cart/checkout ──────────────────────────────────────────────────
  app.post(
    '/checkout',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user.userId
      const actorEmail = req.user.email
      const result = await service.checkout(userId, actorEmail)

      if (result.notFound) return reply.code(404).send({ error: 'No active cart found' })
      if (result.empty) return reply.code(400).send({ error: 'Cart is empty' })
      if (result.outOfStock) {
        return reply.code(409).send({ 
          error: 'Insufficient stock', 
          productName: result.productName,
          availableStock: result.availableStock 
        })
      }

      return reply.code(200).send({ data: result })
    }
  )
}
