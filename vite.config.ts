import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

/**
 * The game entry is a tiny bootstrap that import()s the real game so a failed load can show a fallback.
 * Without help the browser only learns about the game chunks after that bootstrap runs, and about the
 * clip chunk after the model has loaded. List them all in index.html so they download with the HTML.
 */
let base = '/'
const preloadGameChunks: Plugin = {
  name: 'preload-game-chunks',
  configResolved(config) { base = config.base },
  transformIndexHtml: {
    order: 'post',
    handler(html, { bundle, filename }) {
      if (!bundle || !filename.endsWith('index.html')) return
      const game = Object.values(bundle).find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith('/src/main.ts'))
      if (!game) throw new Error('preload-game-chunks: src/main.ts chunk not found')
      const files = new Set<string>()
      const visit = (file: string) => {
        const chunk = bundle[file]
        if (files.has(file) || chunk?.type !== 'chunk') return
        files.add(file)
        for (const next of [...chunk.imports, ...chunk.dynamicImports]) visit(next)
      }
      visit(game.fileName)
      // Vite already lists the bootstrap's own static imports.
      return [...files].filter(file => !html.includes(file)).map(file => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: base + file }, injectTo: 'head' as const }))
    },
  },
}

export default defineConfig({
  plugins: [preact(), preloadGameChunks],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', lab: 'lab.html' },
      output: {
        codeSplitting: {
          groups: [
            // three changes only on upgrade; app code changes every release. Keep their cache lifetimes apart.
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 2 },
            // Clips build from the loaded rest skeleton, so they must stay behind import() and never pull in
            // their shared dependencies (that would make the game chunk import them eagerly). One request instead of six.
            { name: 'clips', test: /src[\\/]lab[\\/](clips[\\/]|weapons[\\/]poses|postures|death-settle)/, priority: 1, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
})
