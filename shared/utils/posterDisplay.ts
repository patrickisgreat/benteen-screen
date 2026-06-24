/**
 * Per-event control over how the poster fills the overview header: a header
 * aspect ratio, a focal point (which part of the poster shows), and a zoom.
 * Stored as the `events.poster_display` jsonb; both EventHero and the admin
 * PosterAdjuster render from the SAME helpers so the editor is WYSIWYG.
 */

export const POSTER_RATIOS = ['banner', 'wide', 'cinema', 'tall'] as const
export type PosterRatio = typeof POSTER_RATIOS[number]

export interface PosterDisplay {
  /** Header shape. */
  ratio: PosterRatio
  /** Focal point, 0–100 (% across / down the poster). */
  posX: number
  posY: number
  /** Scale multiplier; 1 = cover baseline, <1 shows more (letterboxed), >1 zooms in. */
  zoom: number
}

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3

export const DEFAULT_POSTER_DISPLAY: PosterDisplay = { ratio: 'banner', posX: 50, posY: 50, zoom: 1 }

export const POSTER_RATIO_LABELS: Record<PosterRatio, string> = {
  banner: 'Banner',
  wide: 'Wide',
  cinema: 'Cinematic',
  tall: 'Tall'
}

const RATIO_ASPECT: Record<PosterRatio, string> = {
  banner: '3 / 1',
  wide: '16 / 9',
  cinema: '21 / 9',
  tall: '4 / 3'
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Validate/clamp the stored jsonb (untrusted) into a safe PosterDisplay. */
export function normalizePosterDisplay(raw: unknown): PosterDisplay {
  const d = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const ratio = POSTER_RATIOS.includes(d.ratio as PosterRatio) ? d.ratio as PosterRatio : DEFAULT_POSTER_DISPLAY.ratio
  return {
    ratio,
    posX: clamp(d.posX as number, 0, 100, DEFAULT_POSTER_DISPLAY.posX),
    posY: clamp(d.posY as number, 0, 100, DEFAULT_POSTER_DISPLAY.posY),
    zoom: clamp(d.zoom as number, ZOOM_MIN, ZOOM_MAX, DEFAULT_POSTER_DISPLAY.zoom)
  }
}

/** Inline aspect-ratio style for the header container. Not a Tailwind class:
 *  the arbitrary `aspect-[x/y]` values only ever appeared in this .ts file, which
 *  Tailwind doesn't scan, so the class was never generated — collapsing the
 *  header to 0 height. An inline style works regardless of what Tailwind scans. */
export function posterRatioStyle(ratio: PosterRatio): Record<string, string> {
  return { aspectRatio: RATIO_ASPECT[ratio] }
}

/** Inline style for the poster <img> (object-cover): focal point + zoom. */
export function posterFillStyle(d: PosterDisplay): Record<string, string> {
  return {
    objectPosition: `${d.posX}% ${d.posY}%`,
    transform: `scale(${d.zoom})`,
    transformOrigin: `${d.posX}% ${d.posY}%`
  }
}
