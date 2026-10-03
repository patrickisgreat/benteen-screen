import { describe, expect, it } from 'vitest'
import { personalFrom } from '../server/utils/email'

const from = 'Benteen Screen On The Green <movienight@benteen.example>'

describe('personalFrom', () => {
  it('leads the From name with the sender, keeping the verified address', () => {
    expect(personalFrom(from, 'Pat Smith')).toBe('Pat Smith via Benteen Screen On The Green <movienight@benteen.example>')
  })

  it('uses the name alone when the configured sender is a bare address', () => {
    expect(personalFrom('movienight@benteen.example', 'Pat Smith')).toBe('Pat Smith <movienight@benteen.example>')
  })

  it('keeps the configured sender when there is no usable name', () => {
    expect(personalFrom(from, null)).toBe(from)
    expect(personalFrom(from, '   ')).toBe(from)
    // inviterNameFromClaims falls back to the email — that is not a name.
    expect(personalFrom(from, 'pat@x.com')).toBe(from)
  })

  it('strips header-breaking characters from a profile name', () => {
    expect(personalFrom(from, 'Pat "The <Host>"\r\nBcc: evil, Smith'))
      .toBe('Pat The Host Bcc evil Smith via Benteen Screen On The Green <movienight@benteen.example>')
  })

  it('keeps accented letters, apostrophes and hyphens', () => {
    expect(personalFrom(from, 'Zoë O\'Brien-Núñez')).toBe('Zoë O\'Brien-Núñez via Benteen Screen On The Green <movienight@benteen.example>')
  })
})
