import { PrismaClient } from '@prisma/client'
import { AddCartItemInput } from '../schemas/cart.schema'

export class CartRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Cart ────────────────────────────────────────────────────────────────

  async findActiveCartByUserId(userId: number) {
    return this.prisma.cart.findFirst({
      where: { userId, status: 'active', deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  }

  async createCart(userId: number, createdBy: string) {
    return this.prisma.cart.create({
      data: {
        userId,
        status: 'active',
        createdBy,
      },
      include: { items: true },
    })
  }

  async clearCart(cartId: number, deletedBy: string, cartItems: any[]) {
    const now = new Date()
    return this.prisma.$transaction(async (tx) => {
      await tx.cartItem.updateMany({
        where: { cartId, deletedAt: null },
        data: { deletedAt: now, deletedBy },
      })
      const cart = await tx.cart.update({
        where: { id: cartId },
        data: { deletedAt: now, deletedBy },
      })

      // Insert outbox event
      const payload = {
        cart_id: cartId,
        items: cartItems.map(i => ({ product_id: i.productId, quantity: i.quantity }))
      }

      await tx.outboxEvent.create({
        data: {
          eventType: 'cart.checked_out',
          aggregateType: 'cart',
          aggregateId: cartId,
          payload,
          createdBy: deletedBy,
        }
      })

      return cart
    })
  }

  // ─── Cart Items ──────────────────────────────────────────────────────────

  async addItem(cartId: number, input: AddCartItemInput, createdBy: string) {
    // Upsert: if same product+variant already in cart, update quantity
    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        deletedAt: null,
      },
    })

    if (existing) {
      return this.prisma.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + input.quantity,
          updatedBy: createdBy,
        },
      })
    }

    return this.prisma.cartItem.create({
      data: {
        cartId,
        productId: input.productId,
        productPublicId: input.productPublicId,
        variantId: input.variantId,
        variantPublicId: input.variantPublicId,
        productName: input.productName,
        variantName: input.variantName,
        sku: input.sku,
        imageUrl: input.imageUrl,
        unitPrice: input.unitPrice,
        currencyCode: input.currencyCode,
        quantity: input.quantity,
        sellerId: input.sellerId,
        sellerName: input.sellerName,
        createdBy,
      },
    })
  }

  async findItemByPublicId(publicId: string) {
    return this.prisma.cartItem.findFirst({
      where: { publicId, deletedAt: null },
    })
  }

  async updateItemQuantity(itemId: number, quantity: number, updatedBy: string) {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, updatedBy },
    })
  }

  async removeItem(itemId: number, deletedBy: string) {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date(), deletedBy },
    })
  }
}
