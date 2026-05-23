import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config'

export interface JwtPayload {
  sub: string
  userId: number
  email: string
  roles: string[]
  iat?: number
  exp?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: {
      public: config.jwt.publicKey,
    },
    sign: {
      algorithm: config.jwt.algorithm,
    },
  })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' })
    }
  })
})
