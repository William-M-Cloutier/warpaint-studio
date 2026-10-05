import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  await server.ssrLoadModule('/scripts/check-cutout.ts')
  await server.ssrLoadModule('/scripts/check-sections.ts')
} finally {
  await server.close()
}
