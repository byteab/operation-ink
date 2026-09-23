/** Ink pictograms distinguish the weapons without visible labels. */
const paths: Record<string, string> = {
  fire: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  aim: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
  reload: '<path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/>',
  jump: '<circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/><path d="M12 7v6M7 4l5 5 5-5M12 13l-4 4-3-2m7-2 4 4 3-2"/>',
  use: '<path d="M9 13V5a2 2 0 0 1 4 0v6l5 1v5l-4 4H9l-6-7a2 2 0 0 1 3-2l3 3"/>',
  door: '<path d="M6 21V3h12v18M13 12h1"/>',
  ladder: '<path d="M7 3v18M17 3v18M7 6h10M7 12h10M7 18h10"/>',
  zipline: '<path d="M2 3l20 7M8 5l-1 4 5 2 1-4M10 10l-1 6 5 2m-5-2-4 5m9-3 3 3"/>',
  pickup: '<path d="M4 13v7h16v-7M12 2v13m-5-5 5 5 5-5"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  drop: '<path d="M3 5h15v5H9l-2 6H3l2-7H3ZM14 15l6 6m0-6v6h-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  'zoom-in': '<path d="M12 5v14M5 12h14"/>',
  'zoom-out': '<path d="M5 12h14"/>',
  empty: '<path d="M6 12h12"/>',
  pistol: '<path d="M3 6h18v5H10l-2 8H3l3-10H3Z"/>',
  ak: '<path d="M2 13l5-4h10v2h5v2h-6l3 6-4 1-3-7H9l-2 4H2Z"/>',
  smg: '<path d="M3 8h17v6h-6v6h-4v-6H7v3H3Z"/>',
  shotgun: '<path d="M2 14l5-4h15v3H9l-3 5H2Z"/>',
  sniper: '<path d="M2 14l5-4h15v3H11l-2 6H6l1-5-5 4ZM11 6h7m-3 0v4"/>',
}

export const touchIcon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.use}</svg>`
