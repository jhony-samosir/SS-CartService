# SS-CartService

Shopping Cart microservice untuk platform **SamStore**, dibangun dengan **Node.js**, **Fastify**, **TypeScript**, **Prisma ORM**, dan **PostgreSQL**. Layanan ini mengelola keranjang belanja pengguna, termasuk penambahan, pembaruan, dan penghapusan item, serta integrasi dengan sistem pesanan melalui event-driven messaging (RabbitMQ) menggunakan pola Inbox/Outbox untuk keandalan pesan.

## Features

- Manajemen Keranjang Belanja: Lihat, tambah, update, hapus item, bersihkan keranjang
- Validasi Input menggunakan Zod
- Otentikasi melalui verifikasi token JWT RS256 dari API Gateway
- Publikasi Event Checkout Keranjang ke RabbitMQ (topik samstore.events dengan routing key cart.checked_out)
- Konsumsi Event dari layanan lain via Inbox Pattern (idempotensi)
- Integrasi OpenTelemetry untuk tracing dan metrik
- Health Check endpoint
- Dokumentasi API melalui Swagger/OpenAPI (jika diaktifkan)

## Tech Stack

- **Runtime:** Node.js v20+
- **HTTP Framework:** Fastify v5
- **Language:** TypeScript
- **ORM:** Prisma ORM
- **Database:** PostgreSQL
- **Message Broker:** RabbitMQ (amqplib client)
- **Validation:** Zod
- **Security:** JWT RS256 (verifikasi token dari API Gateway)
- **Observability:** OpenTelemetry SDK + Auto-instrumentations
- **Dev Tools:** Vitest (testing), ESLint, TSX, Prisma

## Project Structure

Struktur folder mengikuti prinsip separation of concerns:

- src/: Kode sumber utama
  - pp.ts: Factory untuk membuat instance Fastify dengan plugin pendaftaran
  - server.ts: Titik masuk aplikasi (memuat app.ts dan menjalankan server)
  - plugins/: Plugin Fastify (Prisma client, JWT verification)
  - outes/: Handler rute HTTP - cart/: Endpoint keranjang belanja
  - services/: Logika bisnis (misalnya: menambah item ke keranjang, menghitung total)
  - epositories/: Akses data menggunakan Prisma Client
  - schemas/: Skema validasi Zod untuk request payload
  -     racing.ts: Konfigurasi OpenTelemetry tracing
- prisma/: Definisi skema Prisma
  - schema.prisma: Model data Cart, CartItem, dll.
- docs/: Dokumen teknis (misalnya: migrasi skema awal)

## Installation

### Requirements

- Node.js >= 20.0.0
- PostgreSQL (instance lokal/docker)
- RabbitMQ (instance lokal/docker)
- JWT public key PEM file (yang sama dengan yang digunakan oleh API Gateway untuk verifikasi)

### Setup

1. Pastikan layanan PostgreSQL dan RabbitMQ berjalan.
2. Salin contoh file environment dan konfigurasikan:
   `ash
   cp .env.example .env
   # Edit variabel berikut sesuai lingkungan Anda:
   # DATABASE_URL, JWT_PUBLIC_KEY_PATH, GATEWAY_HMAC_SECRET, RABBITMQ_URL
   `
3. Instal dependensi Node.js:
   `ash
npm install
`
4. Hasilkan Prisma Client:
   `ash
npm run prisma:generate
`
5. Jalankan server dalam mode development:
   `ash
npm run dev
`

## Environment Variables

Variabel yang digunakan (diatur di .env atau ENV sistem):

| Variable                    | Description                                                              | Required |
| --------------------------- | ------------------------------------------------------------------------ | -------- |
| APP_PORT                    | Port HTTP layanan (default: 8082)                                        | Ya       |
| APP_HOST                    | Alamat bind HTTP (default: 0.0.0.0)                                      | Tidak    |
| NODE_ENV                    | Lingkungan aplikasi (development/production)                             | Ya       |
| DATABASE_URL                | Connection string PostgreSQL untuk ss_cart_db                            | Ya       |
| JWT_PUBLIC_KEY_PATH         | Path ke file PEM public key RSA (untuk verifikasi JWT)                   | Ya       |
| GATEWAY_HMAC_SECRET         | Kunci rahasia HMAC untuk memverifikasi request internal dari API Gateway | Ya       |
| RABBITMQ_URL                | URL koneksi RabbitMQ (format: amqp://user:pass@host:port/)               | Ya       |
| OTEL_SERVICE_NAME           | Nama layanan untuk OpenTelemetry (default: ss-cart-service)              | Ya       |
| OTEL_EXPORTER_OTLP_ENDPOINT | Endpoint collector OTLP (misal: http://otel-collector:4317)              | Ya       |
| OTEL_EXPORTER_OTLP_INSECURE | Gunakan koneksi tidak terenkripsi (set true untuk development tanpa TLS) | Ya       |

## API Documentation

Layanan menyediakan REST API berbasis JSON dengan prefix /cart (diasumsikan di-mounted oleh API Gateway):

| Method | Path                  | Auth   | Description                           |
| ------ | --------------------- | ------ | ------------------------------------- |
| GET    | /health               | —      | Health check                          |
| GET    | /cart                 | ✅ JWT | Dapatkan keranjang aktif pengguna     |
| POST   | /cart/items           | ✅ JWT | Tambah item ke keranjang              |
| PUT    | /cart/items/:publicId | ✅ JWT | Update kuantitas item dalam keranjang |
| DELETE | /cart/items/:publicId | ✅ JWT | Hapus item dari keranjang             |
| DELETE | /cart                 | ✅ JWT | Bersihkan seluruh keranjang           |

Semua endpoint yang membutuhkan autentikasi mengharapkan header Authorization: Bearer <JWT_TOKEN> dengan token yang diterbitkan oleh SS-AuthService dan divalidasi oleh middleware JWT di layanan ini.

## Database

Menggunakan **PostgreSQL** (ss_cart_db). Skema didefinisikan menggunakan Prisma ORM di prisma/schema.prisma. Untuk membuat/migrasi skema awal, lihat file SQL di docs/SS-CartService/001_create_cart_schema.up.sql.

## Authentication & Authorization

Layanan tidak menerbitkan token; ia hanya **memverifikasi** token JWT RS256 yang diterima dari header Authorization. Verifikasi dilakukan menggunakan public key yang disediakan via environment variable JWT_PUBLIC_KEY_PATH. Tidak ada otorisasi berbasis role di layanan ini—akses ke keranjang didasarkan pada klaim subjek (user ID) dalam token.

## Docker

Terdapat Dockerfile multi-stage build (build dengan Node.js, produksi dengan node:alpine). Layanan terintegrasi di docker-compose.yml utama SamStore yang berada di folder SS-APIGateway.

## Build & Deployment

- **Development:**
  pm run dev (menggunakan sx watch untuk hot reload)
- **Build Produksi:**
  pm run build (mengkompilasi TypeScript ke JavaScript di folder dist/)
- **Start Produksi:**
  pm start (menjalankan kode yang sudah dikompilasi dari dist/)

## Testing

Unit test ditulis menggunakan Vitest. Menjalankan test suite:
`ash
npm test
`
Untuk menjalankan test dalam mode watch:
`ash
npm run test:watch
`

## Monitoring & Observability

Layanan telah di-instrumentasikan dengan OpenTelemetry SDK:

- Tracing dikirim ke OpenTelemetry Collector melalui variabel OTEL_EXPORTER_OTLP_ENDPOINT
- Metrik juga dieksporter ke collector yang sama
- Log terstruktur dikirim ke stdout (ditangkap oleh Fluent Bit dalam infrastruktur logging)

## Troubleshooting

- **Koneksi Database Gagal**: Pastikan PostgreSQL berjalan dan DATABASE_URL benar.
- **Verifikasi JWT Gagal**: Pastikan JWT_PUBLIC_KEY_PATH menunjuk ke file PEM public key yang valid dan cocok dengan private key yang digunakan oleh AuthService.
- **RabbitMQ Tidak Terhubung**: Pastikan RabbitMQ berjalan dan RABBITMQ_URL benar.
- **Port Sudah Digunakan**: Ubah APP_PORT di .env jika konflik terjadi.
