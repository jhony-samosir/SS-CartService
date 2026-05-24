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
      // In a real system, you'd pass product_id or variant_id.
      // Assuming variant_id is optional and can be used to filter.
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
      
      const res = (await response.json()) as InventoryResponse
      if (!res.data || res.data.length === 0) return 0
      
      // Sum available stock across all warehouses (quantity - reserved_quantity)
      return res.data.reduce((sum, item) => sum + Math.max(0, item.quantity - item.reserved_quantity), 0)
    } catch (error) {
      console.error('CatalogClient getInventory error:', error)
      return 0
    }
  }
}
