# SS-CartService

Shopping Cart microservice for **SamStore**, built with **Node.js + Fastify + TypeScript + Prisma + PostgreSQL**.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v24 |
| HTTP Framework | Fastify v5 |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL (`ss_cart_db`) |
| Validation | Zod |
| Auth | RS256 JWT (validated from API Gateway headers) |

## Project Structure

```
src/
├── plugins/        # Fastify plugins (prisma, jwt)
├── routes/
│   └── cart/       # Cart route handlers
├── services/       # Business logic
├── repositories/   # Prisma data access
├── schemas/        # Zod validation schemas
├── app.ts          # App factory
└── server.ts       # Server entrypoint

prisma/
└── schema.prisma   # Prisma schema

docs/
└── SS-CartService/
    └── 001_create_cart_schema.up.sql
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/cart` | ✅ JWT | Get active cart |
| `POST` | `/cart/items` | ✅ JWT | Add item to cart |
| `PUT` | `/cart/items/:publicId` | ✅ JWT | Update item quantity |
| `DELETE` | `/cart/items/:publicId` | ✅ JWT | Remove item |
| `DELETE` | `/cart` | ✅ JWT | Clear entire cart |

## Running Locally

### Prerequisites

- Node.js >= 20
- PostgreSQL with `ss_cart_db` database created
- JWT public key PEM file (same as used by API Gateway)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and configure
cp .env.example .env
# Edit DATABASE_URL and JWT_PUBLIC_KEY_PATH in .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Start dev server
npm run dev
```

### Dev Server

```bash
npm run dev      # tsx watch (hot reload)
npm run build    # compile TypeScript
npm start        # run compiled JS
```

### Tests

```bash
npm test         # run vitest
npm run test:watch
```

## Documentation

- [Database Schema](docs/SS-CartService/001_create_cart_schema.up.sql)
