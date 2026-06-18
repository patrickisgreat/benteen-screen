import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from '../app/utils/download'

describe('downloadTextFile', () => {
  let clicked: HTMLAnchorElement | null = null

  beforeEach(() => {
    clicked = null
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('clicks an anchor pointing at an object URL with the given filename, then revokes it', () => {
    downloadTextFile('BEGIN:VCALENDAR', 'movie-night.ics', 'text/calendar;charset=utf-8')

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clicked).not.toBeNull()
    expect(clicked!.getAttribute('href')).toBe('blob:mock-url')
    expect(clicked!.download).toBe('movie-night.ics')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
