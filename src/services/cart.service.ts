import { CartRepository } from '../repositories/cart.repository'
import { AddCartItemInput, UpdateCartItemInput } from '../schemas/cart.schema'

export class CartService {
  constructor(private readonly repo: CartRepository) {}

  async getCart(userId: number) {
    const cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart) {
      return { cart: null, items: [], total: 0, itemCount: 0 }
    }

    const total = cart.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0
    )

    return {
      cart: {
        publicId: cart.publicId,
        status: cart.status,
        notes: cart.notes,
        expiresAt: cart.expiresAt,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
      items: cart.items.map((item) => ({
        publicId: item.publicId,
        productId: item.productId,
        productPublicId: item.productPublicId,
        variantId: item.variantId,
        variantPublicId: item.variantPublicId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        imageUrl: item.imageUrl,
        unitPrice: Number(item.unitPrice),
        currencyCode: item.currencyCode,
        quantity: item.quantity,
        subtotal: Number(item.unitPrice) * item.quantity,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
      })),
      total: parseFloat(total.toFixed(2)),
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      currencyCode: cart.items[0]?.currencyCode ?? 'IDR',
    }
  }

  async addItem(userId: number, input: AddCartItemInput, actorEmail: string) {
    let cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart) {
      cart = await this.repo.createCart(userId, actorEmail)
    }
    const item = await this.repo.addItem(cart.id, input, actorEmail)
    return { item }
  }

  async updateItem(publicId: string, userId: number, input: UpdateCartItemInput, actorEmail: string) {
    const item = await this.repo.findItemByPublicId(publicId)
    if (!item) {
      return { notFound: true }
    }

    // Ensure item belongs to the user's cart
    const cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart || cart.id !== item.cartId) {
      return { forbidden: true }
    }

    const updated = await this.repo.updateItemQuantity(item.id, input.quantity, actorEmail)
    return { item: updated }
  }

  async removeItem(publicId: string, userId: number, actorEmail: string) {
    const item = await this.repo.findItemByPublicId(publicId)
    if (!item) {
      return { notFound: true }
    }

    const cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart || cart.id !== item.cartId) {
      return { forbidden: true }
    }

    await this.repo.removeItem(item.id, actorEmail)
    return { success: true }
  }

  async clearCart(userId: number, actorEmail: string) {
    const cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart) {
      return { notFound: true }
    }
    await this.repo.clearCart(cart.id, actorEmail, cart.items)
    return { success: true }
  }
}
