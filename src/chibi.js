/**
 * Чиби Человека-паука: большая круглая голова, миндалевидные глаза,
 * жирный контур и паутина — как на референсе костюмов.
 */

export function spiderSVG(colors, { rainbow = false, torn = false } = {}) {
  const red = colors.body || '#e11d48'
  const blue = colors.accent || '#2563eb'
  const glow = colors.glow && colors.glow !== 'transparent' ? colors.glow : ''
  const cls = rainbow ? 'spider-svg rainbow-suit' : 'spider-svg'
  const hole = torn
    ? `<path d="M46 112 C50 104 58 106 60 116 C56 118 50 118 46 112Z" fill="#121218" stroke="#111" stroke-width="2"/>`
    : ''
  const aura = glow
    ? `<ellipse cx="60" cy="78" rx="52" ry="72" fill="${glow}" opacity=".28"/>`
    : ''

  return `
  <svg class="${cls}" viewBox="0 0 120 168" aria-hidden="true">
    ${aura}
    <ellipse cx="60" cy="160" rx="26" ry="5" fill="rgba(0,0,0,.4)"/>

    <path d="M40 114 L34 142 Q38 152 48 150 L52 118Z" fill="${blue}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M80 114 L86 142 Q82 152 72 150 L68 118Z" fill="${blue}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M34 140 Q28 154 38 158 L50 152 Q44 146 48 140Z" fill="${red}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M86 140 Q92 154 82 158 L70 152 Q76 146 72 140Z" fill="${red}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <ellipse cx="42" cy="148" rx="5" ry="2.2" fill="#fff" opacity=".4"/>
    <ellipse cx="78" cy="148" rx="5" ry="2.2" fill="#fff" opacity=".4"/>

    <ellipse cx="26" cy="104" rx="11" ry="17" fill="${red}" stroke="#111" stroke-width="3.2"/>
    <ellipse cx="94" cy="104" rx="11" ry="17" fill="${red}" stroke="#111" stroke-width="3.2"/>
    <path d="M26 116 Q14 128 20 140" fill="none" stroke="#111" stroke-width="2.2"/>
    <path d="M94 116 Q106 128 100 140" fill="none" stroke="#111" stroke-width="2.2"/>
    <path d="M22 98 L22 112 M26 96 L26 114 M30 98 L30 112" stroke="#111" stroke-width="1.4" opacity=".55"/>
    <path d="M90 98 L90 112 M94 96 L94 114 M98 98 L98 112" stroke="#111" stroke-width="1.4" opacity=".55"/>

    <path d="M40 92 Q60 108 80 92 L84 118 Q60 132 36 118Z" fill="${blue}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M38 84 Q60 72 82 84 L80 100 Q60 112 40 100Z" fill="${red}" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M60 86 L51 100 L60 95 L69 100Z" fill="#111"/>
    <path d="M51 100 L46 110 M69 100 L74 110 M60 95 L60 112 M48 104 L72 104" stroke="#111" stroke-width="2" stroke-linecap="round"/>
    ${hole}

    <ellipse cx="60" cy="48" rx="42" ry="44" fill="${red}" stroke="#111" stroke-width="4.2"/>
    <path d="M60 8 L60 90
             M24 34 Q60 48 96 34
             M26 52 Q60 66 94 52
             M32 70 Q60 82 88 70
             M28 20 Q18 48 28 78
             M92 20 Q102 48 92 78" fill="none" stroke="#111" stroke-width="2.5"/>

    <path d="M22 50 C24 26 50 20 54 50 C50 72 30 74 22 50Z" fill="#fff" stroke="#111" stroke-width="3.6" stroke-linejoin="round"/>
    <path d="M98 50 C96 26 70 20 66 50 C70 72 90 74 98 50Z" fill="#fff" stroke="#111" stroke-width="3.6" stroke-linejoin="round"/>
    <ellipse cx="40" cy="42" rx="5" ry="7" fill="#fff" opacity=".9"/>
    <ellipse cx="80" cy="42" rx="5" ry="7" fill="#fff" opacity=".9"/>
    <ellipse cx="74" cy="22" rx="10" ry="6" fill="#fff" opacity=".32"/>
  </svg>`
}
