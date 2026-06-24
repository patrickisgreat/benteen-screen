import { describe, expect, it } from 'vitest'
import { DEFAULT_POSTER_DISPLAY, normalizePosterDisplay, posterFillStyle, posterRatioClass } from '../shared/utils/posterDisplay'

describe('posterDisplay', () => {
  it('falls back to the default for null or garbage input', () => {
    expect(normalizePosterDisplay(null)).toEqual(DEFAULT_POSTER_DISPLAY)
    expect(normalizePosterDisplay({ ratio: 'nope', posX: 'x' })).toEqual(DEFAULT_POSTER_DISPLAY)
  })

  it('clamps position (0–100) and zoom (0.5–3) into range', () => {
    expect(normalizePosterDisplay({ ratio: 'wide', posX: 150, posY: -10, zoom: 9 }))
      .toEqual({ ratio: 'wide', posX: 100, posY: 0, zoom: 3 })
    expect(normalizePosterDisplay({ zoom: 0.1 }).zoom).toBe(0.5)
  })

  it('keeps valid values unchanged', () => {
    expect(normalizePosterDisplay({ ratio: 'cinema', posX: 30, posY: 70, zoom: 1.2 }))
      .toEqual({ ratio: 'cinema', posX: 30, posY: 70, zoom: 1.2 })
  })

  it('maps each ratio to an aspect class', () => {
    expect(posterRatioClass('banner')).toBe('aspect-[3/1]')
    expect(posterRatioClass('tall')).toBe('aspect-[4/3]')
  })

  it('builds the fill style from focal point + zoom', () => {
    expect(posterFillStyle({ ratio: 'wide', posX: 25, posY: 75, zoom: 2 })).toEqual({
      objectPosition: '25% 75%',
      transform: 'scale(2)',
      transformOrigin: '25% 75%'
    })
  })
})
