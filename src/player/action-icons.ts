/** Fixed SVG geometry keeps projected action icons centered on every platform. */
const paths: Record<string, string> = {
  door: '<path d="M6 21V3h12v18M13 12h1"/>',
  ladder: '<path d="M7 3v18M17 3v18M7 6h10M7 12h10M7 18h10"/>',
  zipline: '<path d="M2 3l20 7M8 5l-1 4 5 2 1-4M10 10l-1 6 5 2m-5-2-4 5m9-3 3 3"/>',
  pickup: '<path d="M4 14v6h16v-6M12 3v11m-4-4 4 4 4-4"/>',
  mission: '<path d="M9 13V5a2 2 0 0 1 4 0v6l5 1v5l-4 4H9l-6-7a2 2 0 0 1 3-2l3 3"/>',
}

export const actionIcon = (kind: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind] ?? paths.mission}</svg>`
