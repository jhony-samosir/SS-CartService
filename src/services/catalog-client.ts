import { context, propagation } from '@opentelemetry/api'

export interface CatalogProductResponse {
  id: string
  name: string
  slug: string
  status: string
  price: number
  image_url: string
  brand_id?: number
}

export interface InventoryResponse {
  data: Array<{
    id: number
    product_id: number
    variant_id?: number
    warehouse_id: number
    quantity: number
    reserved_quantity: number
  }>
  total: number
}

export class CatalogClient {
  private readonly baseUrl: string

  constructor() {
    this.baseUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:8081'
  }

  async getProduct(publicId: string): Promise<CatalogProductResponse | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      propagation.inject(context.active(), headers)

      const response = await fetch(`${this.baseUrl}/api/catalog/v1/products/${publicId}`, { headers })
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to fetch product: ${response.statusText}`)
      }
      return (await response.json()) as CatalogProductResponse
    } catch (error) {
      console.error('CatalogClient getProduct error:', error)
      return null
    }
  }

  async getInventory(variantId?: number): Promise<number> {
    try {
      const query = variantId ? `?variant_id=${variantId}` : ''
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      propagation.inject(context.active(), headers)

      const response = await fetch(`${this.baseUrl}/api/catalog/v1/inventory${query}`, { headers })
      
      if (!response.ok) {
        console.error(`Failed to fetch inventory: ${response.statusText}`)
        return 0
      }
      
      const rawRes = (await response.json()) as any
      const items = rawRes?.data?.items
      if (!items || !Array.isArray(items) || items.length === 0) return 0
      
      // Sum available stock across all warehouses (quantity_on_hand - quantity_reserved)
      return items.reduce((sum: number, item: any) => {
        const qty = item.quantity_on_hand ?? item.quantity ?? 0
        const reserved = item.quantity_reserved ?? item.reserved_quantity ?? 0
        return sum + Math.max(0, qty - reserved)
      }, 0)
    } catch (error) {
      console.error('CatalogClient getInventory error:', error)
      return 0
    }
  }
}
