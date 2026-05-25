import { CartRepository } from '../repositories/cart.repository'
import { OutboxRepository } from '../repositories/outbox.repository'
import { CatalogClient } from './catalog-client'
import { AddCartItemInput, UpdateCartItemInput } from '../schemas/cart.schema'
import crypto from 'crypto'

export class CartService {
  constructor(
    private readonly repo: CartRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly catalogClient: CatalogClient
  ) {}

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
    // 1. Validate Product Existence & Price from Catalog Service
    const product = await this.catalogClient.getProduct(input.productPublicId)
    if (!product || (product.status.toUpperCase() !== 'ACTIVE' && product.status.toUpperCase() !== 'PUBLISHED')) {
      return { validationError: 'Product is not available or inactive' }
    }

    // Override input price and name with authoritative data from Catalog
    if (product.price > 0) {
      input.unitPrice = product.price
    }
    input.productName = product.name

    // 2. Validate Inventory
    const availableStock = await this.catalogClient.getInventory(input.variantId)
    if (input.quantity > availableStock) {
      return { outOfStock: true, availableStock }
    }

    let cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart) {
      cart = await this.repo.createCart(userId, actorEmail)
    }

    // Check existing item quantity in cart to ensure total doesn't exceed stock
    const existingItem = cart.items.find(i => i.productPublicId === input.productPublicId && (i.variantId ?? undefined) === (input.variantId ?? undefined))
    const newTotalQuantity = existingItem ? existingItem.quantity + input.quantity : input.quantity
    if (newTotalQuantity > availableStock) {
       return { outOfStock: true, availableStock }
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

  async checkout(userId: number, actorEmail: string) {
    const cart = await this.repo.findActiveCartByUserId(userId)
    if (!cart) {
      return { notFound: true }
    }
    if (cart.items.length === 0) {
      return { empty: true }
    }

    // Re-validate stock for all items
    for (const item of cart.items) {
      const stock = await this.catalogClient.getInventory(item.variantId || undefined)
      if (item.quantity > stock) {
        return { 
          outOfStock: true, 
          productName: item.productName,
          availableStock: stock
        }
      }
    }

    // Calculate totals
    const totalAmount = cart.items.reduce((sum, i) => sum + (Number(i.unitPrice) * i.quantity), 0)
    const currencyCode = cart.items[0]?.currencyCode || 'IDR'
    const orderId = crypto.randomUUID()

    const payload = {
      correlationId: orderId,
      userId,
      cartPublicId: cart.publicId,
      items: cart.items.map(i => ({
        productPublicId: i.productPublicId,
        variantId: i.variantId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.unitPrice) * i.quantity
      })),
      totalAmount,
      currencyCode
    }

    // In a real app we'd use a single Prisma transaction across CartRepo and OutboxRepo.
    // For simplicity, we just mark it checkout and insert outbox event.
    await this.repo.updateCartStatus(cart.id, 'checked_out', actorEmail)
    await this.outboxRepo.createEvent(
      'order.checkout.initiated',
      'cart',
      cart.id,
      payload,
      actorEmail
    )

    return { 
      success: true, 
      orderId,
      totalAmount
    }
  }
}
