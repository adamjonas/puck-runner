import {
  BUILTIN_PROFILES,
  type PlayerProfile,
} from './profiles'
import {
  createProfileAvatar,
  css,
  div,
  FONT_TEXT,
  formatProfileLabel,
  GOLD,
  GREEN,
  scaled,
} from './overlay-utils'

interface ProfileCardOptions {
  profile: PlayerProfile
  isSelected: boolean
  onSelect: () => void
  onDelete: (() => void) | null
}

interface AddPlayerButtonOptions {
  onCreate: (name: string) => PlayerProfile | null
  onRendered: () => void
  onSelected: (profile: PlayerProfile) => void
}

export function createPlayerSelectLabel(): HTMLDivElement {
  const label = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(15),
    color: 'rgba(255,255,255,0.64)',
    marginBottom: '2px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  })
  label.textContent = 'Choose Your Skater'
  return label
}

export function createProfileCardGrid(): HTMLDivElement {
  return div({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '18px',
    width: '100%',
    alignItems: 'stretch',
  })
}

export function createProfileCard(options: ProfileCardOptions): HTMLDivElement {
  const { profile, isSelected, onSelect, onDelete } = options
  const isBuiltin = BUILTIN_PROFILES.some(
    (builtinProfile) => builtinProfile.name.toLowerCase() === profile.name.toLowerCase(),
  )

  const cardWrap = div({
    position: 'relative',
    width: '100%',
  })

  const card = document.createElement('button')
  card.type = 'button'
  card.setAttribute('aria-pressed', String(isSelected))
  css(card, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '22px 20px 20px',
    borderRadius: '28px',
    border: isSelected ? `2px solid ${GOLD}` : '2px solid rgba(255,255,255,0.14)',
    background: isSelected
      ? 'linear-gradient(180deg, rgba(255,215,0,0.18) 0%, rgba(255,255,255,0.07) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
    boxShadow: isSelected
      ? '0 20px 44px rgba(255,215,0,0.16)'
      : '0 16px 36px rgba(0,0,0,0.18)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    opacity: isSelected ? '1' : '0.72',
    transform: isSelected ? 'scale(1.03)' : 'scale(1)',
    transition: 'transform 0.2s ease, border-color 0.2s ease, opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
  })

  card.appendChild(createProfileAvatar(profile, isSelected))

  const nameEl = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(22),
    fontWeight: '900',
    color: '#fff',
    letterSpacing: '1.5px',
    textAlign: 'center',
    textTransform: 'uppercase',
  })
  nameEl.textContent = formatProfileLabel(profile, true)
  card.appendChild(nameEl)

  if (profile.nickname) {
    const nicknameEl = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(14),
      fontWeight: '600',
      color: 'rgba(255,255,255,0.82)',
      textAlign: 'center',
    })
    nicknameEl.textContent = profile.nickname
    card.appendChild(nicknameEl)
  }

  const taglineEl = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(14),
    fontWeight: '500',
    lineHeight: '1.45',
    color: 'rgba(255,255,255,0.62)',
    textAlign: 'center',
    maxWidth: '24ch',
    minHeight: '3.1em',
  })
  taglineEl.textContent = profile.tagline ?? ''
  card.appendChild(taglineEl)

  card.addEventListener('click', onSelect)
  cardWrap.appendChild(card)

  if (!isBuiltin && onDelete) {
    cardWrap.appendChild(createDeleteProfileButton(profile.name, onDelete))
  }

  return cardWrap
}

export function createAddPlayerButton(options: AddPlayerButtonOptions): HTMLButtonElement {
  const addBtn = document.createElement('button')
  css(addBtn, {
    fontFamily: FONT_TEXT,
    fontSize: scaled(16),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.86)',
    background: 'rgba(255,255,255,0.08)',
    border: '2px dashed rgba(255,255,255,0.26)',
    borderRadius: '999px',
    padding: '10px 24px',
    cursor: 'pointer',
    minWidth: '220px',
    transition: 'background 0.2s ease',
    pointerEvents: 'auto',
  })
  addBtn.textContent = '+ Add Player'

  addBtn.addEventListener('click', () => {
    const input = document.createElement('input')
    css(input, {
      fontFamily: FONT_TEXT,
      fontSize: scaled(16),
      color: '#fff',
      background: 'rgba(255,255,255,0.1)',
      border: '2px solid rgba(255,255,255,0.24)',
      borderRadius: '999px',
      padding: '10px 18px',
      outline: 'none',
      minWidth: '220px',
      textAlign: 'center',
      pointerEvents: 'auto',
    })
    input.placeholder = 'New player name'
    input.maxLength = 20
    addBtn.replaceWith(input)
    input.focus()

    let cancelled = false
    const submit = () => {
      if (cancelled) return
      const created = options.onCreate(input.value)
      if (created) {
        options.onSelected(created)
      }
      options.onRendered()
    }

    const handleBlur = () => {
      if (!cancelled) submit()
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        submit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelled = true
        input.removeEventListener('blur', handleBlur)
        options.onRendered()
      }
    })
    input.addEventListener('blur', handleBlur)
  })

  return addBtn
}

export function createPracticeButton(onPractice: () => void): HTMLButtonElement {
  const practiceBtn = document.createElement('button')
  css(practiceBtn, {
    fontFamily: FONT_TEXT,
    fontSize: scaled(16),
    fontWeight: '600',
    color: GREEN,
    background: 'rgba(46, 204, 113, 0.1)',
    border: `2px solid ${GREEN}`,
    borderRadius: '999px',
    padding: '10px 24px',
    cursor: 'pointer',
    minWidth: '220px',
    transition: 'background 0.2s ease',
    pointerEvents: 'auto',
    marginTop: '4px',
  })
  practiceBtn.textContent = '🏒 Practice'
  practiceBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    event.preventDefault()
    practiceBtn.blur()
    onPractice()
  })
  return practiceBtn
}

function createDeleteProfileButton(
  profileName: string,
  onDelete: () => void,
): HTMLButtonElement {
  const deleteBtn = document.createElement('button')
  deleteBtn.type = 'button'
  deleteBtn.setAttribute('aria-label', `Delete ${profileName}`)
  css(deleteBtn, {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.34)',
    color: 'rgba(255,255,255,0.78)',
    fontFamily: FONT_TEXT,
    fontSize: scaled(18),
    fontWeight: '700',
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'background 0.2s ease, color 0.2s ease',
  })
  deleteBtn.textContent = '×'
  deleteBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onDelete()
  })
  return deleteBtn
}
