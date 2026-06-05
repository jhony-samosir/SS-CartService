# SS-CartService

## Overview

`SS-CartService` adalah microservice pengelola keranjang belanja (shopping cart) untuk platform e-commerce SamStore. Dibangun dengan **Node.js (Fastify v5)** dan **TypeScript**, service ini mengelola item yang dimasukkan pengguna ke keranjang, integrasi persediaan katalog, dan proses checkout awal.

Service ini terhubung secara ekstensif dengan infrastruktur event-driven (RabbitMQ) menggunakan pola **Inbox** untuk menerima sinkronisasi dari service lain, dan pola **Outbox** untuk menjamin pengiriman event (misalnya saat pengguna melakukan *checkout* keranjang).

---

## Tech Stack

| Kategori       | Teknologi                              |
| -------------- | -------------------------------------- |
| Runtime        | Node.js v20+                           |
| Web Framework  | Fastify v5                             |
| Bahasa         | TypeScript                             |
| ORM            | Prisma ORM                             |
| Database       | PostgreSQL                             |
| Message Broker | RabbitMQ (amqplib)                     |
| Validasi Data  | Zod                                    |
| Security       | JWT RS256 (Verifikasi)                 |
| Observability  | OpenTelemetry, Pino                    |

---

## Arsitektur

Struktur aplikasi diorganisir menggunakan pemisahan modular berdasarkan peran logika (domain-driven inspired):

```text
SS-CartService/
├── src/
│   ├── plugins/                 # Fastify plugins (Prisma client, JWT auth, RabbitMQ, Logger)
│   ├── routes/                  # Definisi route endpoint REST API (contoh: cart.routes.ts)
│   ├── services/                # Logika bisnis inti (CartService, CatalogClient)
│   ├── repositories/            # Layer akses data membungkus Prisma Client (CartRepository, dll)
│   ├── schemas/                 # Skema Zod untuk validasi request body/params
│   ├── workers/                 # Worker background (InboxConsumer, OutboxWorker)
│   ├── app.ts                   # Fastify app factory & plugin registration
│   ├── config.ts                # Konfigurasi terpusat dari process.env
│   ├── server.ts                # Entry point startup HTTP server
│   └── tracing.ts               # OpenTelemetry SDK bootstrap
├── prisma/
│   └── schema.prisma            # Model database relasional (PostgreSQL)
└── package.json
```

---

## Fitur Utama

- **Manajemen Keranjang Belanja**: Mendukung aksi CRUD untuk cart dan item (tambah item, update kuantitas, hapus item, kosongkan keranjang).
- **Fastify & Zod Validation**: Payload divalidasi dengan ketat pada *route level* menggunakan integrasi Zod, mencegah bad-data masuk ke service layer.
- **Idempotency dengan Inbox Pattern**: Konsumer RabbitMQ service ini (yang mendengarkan update dari katalog, misal harga/stok berubah) menggunakan tabel `inbox_events` untuk membatalkan event ganda (*duplicate messages*).
- **Reliability dengan Outbox Pattern**: Saat keranjang di-*checkout*, transaksi database menulis pesanan dan record `outbox_events` sekaligus. Worker akan mengirim pesan tersebut ke RabbitMQ.
- **Klien Katalog**: Berkomunikasi untuk memastikan harga item akurat atau mengecek sisa stok.

---

## Database Schema (Prisma)

- **`carts`**: Header keranjang berstatus (active/checked_out). Menggunakan UUID (`public_id`) sebagai identitas akses.
- **`cart_items`**: Baris item dalam keranjang, menunjuk ke ID Produk dan ID Varian (dari SS-CatalogService), mencatat `unit_price`, `quantity`, dll.
- **`outbox_events`**: Menyimpan event (contoh: `cart.checked_out`) secara lokal sebelum didistribusikan ke broker pesan.
- **`inbox_events`**: Menyimpan `message_id` event yang masuk untuk mencegah *double processing*.

---

## API Endpoints

Semua operasi keranjang membutuhkan token JWT RS256 yang sah, di-pass via HTTP Header `Authorization: Bearer <token>`. Base path di seting pada Gateway sebagai `/api/cart`.

| Method | Endpoint                        | Deskripsi                                                   |
| ------ | ------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/cart/health`              | Health check (Anonim)                                       |
| GET    | `/api/cart/`                    | Mengambil keranjang aktif pengguna saat ini                 |
| POST   | `/api/cart/items`               | Menambah item ke keranjang. Mengembalikan 409 bila *Out of stock* |
| PUT    | `/api/cart/items/:publicId`     | Mengubah kuantitas item (increment/decrement)               |
| DELETE | `/api/cart/items/:publicId`     | Menghapus satu baris item dari keranjang                    |
| DELETE | `/api/cart/`                    | Mengosongkan seluruh isi keranjang aktif                    |
| POST   | `/api/cart/checkout`            | Memvalidasi stok, menyegel keranjang, dan men-trigger pembuatan Order via RabbitMQ outbox |

---

## RabbitMQ Messaging

- **Outbox Publisher**:
  Service ini **mempublikasikan** event ke `samstore.events` exchange.
  - Routing key: `cart.checked_out`
  - Konsumer tujuan: SS-OrderService

- **Inbox Consumer**:
  Service ini **mengkonsumsi** event dari antrian (queue) yang disubsripsi.
  - Topic: `catalog.product.*` (contoh: sinkronisasi jika produk dihapus dari katalog)

---

## Environment Variables

| Variable                      | Deskripsi                                                        | Wajib |
| ----------------------------- | ---------------------------------------------------------------- | ----- |
| `NODE_ENV`                    | Environment mode (`development` / `production`)                  | ✅    |
| `PORT`                        | Port listening HTTP server (default: 8082)                       | ✅    |
| `DATABASE_URL`                | URL koneksi Prisma ke PostgreSQL (`postgresql://...`)            | ✅    |
| `RABBITMQ_URL`                | URL koneksi broker amqplib (`amqp://...`)                        | ✅    |
| `GATEWAY_HMAC_SECRET`         | Kunci verifikasi signature HTTP request dari API Gateway         | ✅    |
| `JWT_PUBLIC_KEY_PATH`         | Path absolte/relatif ke file PEM public key RSA untuk validasi JWT| ✅    |
| `OTEL_SERVICE_NAME`           | Nama layanan untuk telemetri trace (default: `ss-cart-service`)  | ✅    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP gRPC endpoint (misal: `http://otel-collector:4317`)         | ✅    |

---

## Instalasi & Menjalankan

### Prasyarat

- Node.js v20.0+
- PostgreSQL
- RabbitMQ
- Akses ke public RSA PEM (`jwt_public_key.pem`)

### Setup Proyek

```bash
git clone <repository>
cd SamStore/SS-CartService

# Instal dependensi
npm install

# Salin konfigurasi environment
cp .env.example .env

# Generate Prisma Client
npx prisma generate
```

### Menjalankan Server Lokal

**Development (dengan hot reload via tsx):**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

### Database Migrations

Skema sudah tersedia di `prisma/schema.prisma`. Untuk menyelaraskan database lokal:

```bash
npx prisma db push
# atau
npx prisma migrate dev
```

---

## Observability

- **Pino Logger**: Log format *pretty* saat development, namun berbentuk struktur JSON saat production, siap di-scrape oleh Fluent Bit.
- **OpenTelemetry SDK**: Setiap request HTTP (Fastify instrumentation) dan kueri database (Prisma instrumentation) dikirim ke Tempo / OTel Collector.
- **Health Check**: Tersedia di endpoint `/health`.
