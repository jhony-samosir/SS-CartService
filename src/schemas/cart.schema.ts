import { z } from 'zod'

// ─── Add Item ────────────────────────────────────────────────────────────────
export const AddCartItemSchema = z.object({
  productId: z.number().int().positive(),
  productPublicId: z.string().uuid(),
  variantId: z.number().int().positive().optional(),
  variantPublicId: z.string().uuid().optional(),
  productName: z.string().min(1).max(500),
  variantName: z.string().max(255).optional(),
  sku: z.string().max(255).optional(),
  imageUrl: z.string().url().optional(),
  unitPrice: z.number().nonnegative(),
  currencyCode: z.string().length(3).default('IDR'),
  quantity: z.number().int().min(1).default(1),
  sellerId: z.number().int().positive().optional(),
  sellerName: z.string().max(255).optional(),
})

export type AddCartItemInput = z.infer<typeof AddCartItemSchema>

// ─── Update Item ─────────────────────────────────────────────────────────────
export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(1),
})

export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>

// ─── Params ──────────────────────────────────────────────────────────────────
export const CartItemParamsSchema = z.object({
  publicId: z.string().uuid(),
})

export type CartItemParams = z.infer<typeof CartItemParamsSchema>
