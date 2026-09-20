import { build } from 'rolldown'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const temporary = await mkdtemp(join(tmpdir(), 'stickman-player-'))
try {
  const output = join(temporary, 'checks.mjs')
  await build({
    input: process.argv[2] ?? 'scripts/player-checks.ts', platform: 'node',
    plugins: [{ name: 'shared-three', resolveId(id) {
      if (id === 'three' || id.startsWith('three/')) return { id: import.meta.resolve(id), external: true }
      if (id.endsWith('.css')) return '\0test-style:' + id + '.js'
    }, load(id) {
      // Node lifecycle checks exercise runtime logic; browser checks own CSS.
      if (id.startsWith('\0test-style:')) return 'export {}'
    } }],
    output: { dir: temporary, entryFileNames: 'checks.mjs', format: 'esm' },
  })
  await import(pathToFileURL(output).href)
} finally { await rm(temporary, { recursive: true, force: true }) }
