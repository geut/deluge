import { dirname } from 'path'
import { fileURLToPath } from 'url'
import esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

esbuild.serve({
  host: 'localhost',
  port: 4000,
  servedir: '.'
}, {
  absWorkingDir: __dirname,
  entryPoints: ['src/index.js'],
  outdir: 'dist',
  bundle: true
}).then(server => {
  console.log(`Listening on: http://${server.host}:${server.port}`)
})
