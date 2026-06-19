import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from '../app/utils/download'

describe('downloadTextFile', () => {
  // Capture the anchor's properties at click time (reading them off `this`
  // directly, rather than aliasing `this` to a variable).
  let clickedHref: string | null = null
  let clickedDownload: string | null = null

  beforeEach(() => {
    clickedHref = null
    clickedDownload = null
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.getAttribute('href')
      clickedDownload = this.download
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('clicks an anchor pointing at an object URL with the given filename, then revokes it', () => {
    downloadTextFile('BEGIN:VCALENDAR', 'movie-night.ics', 'text/calendar;charset=utf-8')

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(clickedHref).toBe('blob:mock-url')
    expect(clickedDownload).toBe('movie-night.ics')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
