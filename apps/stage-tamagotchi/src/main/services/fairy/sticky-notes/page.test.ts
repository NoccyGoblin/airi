import { describe, expect, it } from 'vitest'

import { escapeHtml, notePage } from './page'

describe('sticky note page', () => {
  it('escapes the note text, so it cannot add markup or scripts', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'hi\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;hi&#39;')
    const page = notePage('<img src=x onerror=alert(1)>', 'Lumi')
    expect(page).not.toContain('<img')
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('signs the note', () => {
    expect(notePage('Drink water', 'Lumi')).toContain('— Lumi ✨')
  })
})
