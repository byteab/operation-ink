import { build } from 'rolldown'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const temporary = await mkdtemp(join(tmpdir(), 'stickman-player-'))
try {
  const output = join(temporary, 'checks.mjs')
  await build({
    input: 'scripts/player-checks.ts', platform: 'node',
    plugins: [{ name: 'shared-three', resolveId(id) {
      if (id === 'three' || id.startsWith('three/')) return { id: import.meta.resolve(id), external: true }
    } }],
    output: { file: output, format: 'esm' },
  })
  await import(pathToFileURL(output).href)
} finally { await rm(temporary, { recursive: true, force: true }) }
