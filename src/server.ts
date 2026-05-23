import { buildApp } from './app'
import { config } from './config'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.app.port, host: config.app.host })
    app.log.info(`SS-CartService running on port ${config.app.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
