import type { GameState } from './game-state'
import {
  addProfile,
  BUILTIN_PROFILES,
  deleteProfile,
  loadProfiles,
  type PlayerProfile,
} from './profiles'
import {
  createProfileAvatar,
  css,
  div,
  FONT_MONO,
  FONT_TEXT,
  formatProfileLabel,
  GOLD,
  GREEN,
  scaled,
  Z_OVERLAY,
} from './overlay-utils'

export function resolveSelectedProfile(
  selectedProfile: string | null,
  profiles: PlayerProfile[],
): string | null {
  if (selectedProfile === null) return null
  return profiles.some((profile) => profile.name === selectedProfile)
    ? selectedProfile
    : null
}

interface TitleOverlayViewOptions {
  root: HTMLDivElement
  onPractice: () => void
}

export class TitleOverlayView {
  readonly overlay: HTMLDivElement

  private readonly playerListEl: HTMLDivElement
  private readonly overlayHighScoreEl: HTMLDivElement
  private readonly onPractice: () => void

  private selectedProfile: string | null = null
  private selectedProfileData: PlayerProfile | null = null
  private playerListDirty = true
  private wasVisible = false

  constructor(options: TitleOverlayViewOptions) {
    this.onPractice = options.onPractice

    this.overlay = div({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: String(Z_OVERLAY),
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      transition: 'opacity 0.4s ease',
      pointerEvents: 'auto',
    })

    const title = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(64),
      fontWeight: '900',
      color: '#fff',
      letterSpacing: '4px',
      marginBottom: '8px',
      textShadow: '0 0 30px rgba(255,215,0,0.3)',
    })
    title.textContent = 'PUCK RUNNER'
    this.overlay.appendChild(title)

    const subtitle = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(18),
      fontWeight: '400',
      color: 'rgba(255,255,255,0.6)',
      marginBottom: '32px',
    })
    subtitle.textContent = 'Hockey Endless Runner'
    this.overlay.appendChild(subtitle)

    this.playerListEl = div({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '24px',
      width: 'min(92vw, 760px)',
      pointerEvents: 'auto',
    })
    this.overlay.appendChild(this.playerListEl)

    this.overlayHighScoreEl = div({
      fontFamily: FONT_MONO,
      fontSize: scaled(16),
      color: GOLD,
      marginBottom: '24px',
    })
    this.overlay.appendChild(this.overlayHighScoreEl)

    const instructions = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(16),
      color: 'rgba(255,255,255,0.5)',
      textAlign: 'center',
      lineHeight: '1.6',
    })
    instructions.innerHTML =
      'Track a real ball with your iPhone &mdash; or use arrow keys<br>' +
      'Dodge obstacles &bull; Collect coins &bull; Pull back to deke<br><br>' +
      '<span style="color:rgba(255,255,255,0.8);font-weight:600;">Press SPACE to start</span>'
    this.overlay.appendChild(instructions)

    options.root.appendChild(this.overlay)
  }

  update(visible: boolean, state: GameState): void {
    if (visible) {
      this.overlay.style.opacity = '1'
      this.overlay.style.pointerEvents = 'auto'
      if (!this.wasVisible || this.playerListDirty) {
        this.renderPlayerSelect()
      }
      state.playerName = this.selectedProfileData?.name ?? ''
      this.overlayHighScoreEl.textContent = state.highScore > 0 ? `HIGH SCORE: ${state.highScore}` : ''
    } else {
      this.overlay.style.opacity = '0'
      this.overlay.style.pointerEvents = 'none'
    }
    this.wasVisible = visible
  }

  getSelectedProfile(): string | null {
    return this.selectedProfile
  }

  getActiveProfile(name: string): PlayerProfile | null {
    if (!name) return null
    if (
      this.selectedProfileData
      && this.selectedProfileData.name.toLowerCase() === name.toLowerCase()
    ) {
      return this.selectedProfileData
    }

    return loadProfiles().find(
      (profile) => profile.name.toLowerCase() === name.toLowerCase(),
    ) ?? null
  }

  private renderPlayerSelect(): void {
    this.playerListEl.innerHTML = ''

    const profiles = loadProfiles()
    this.selectedProfile = resolveSelectedProfile(this.selectedProfile, profiles)
    this.selectedProfileData = this.selectedProfile
      ? profiles.find((profile) => profile.name === this.selectedProfile) ?? null
      : null

    const label = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(15),
      color: 'rgba(255,255,255,0.64)',
      marginBottom: '2px',
      letterSpacing: '1px',
      textTransform: 'uppercase',
    })
    label.textContent = 'Choose Your Skater'
    this.playerListEl.appendChild(label)

    const cardGrid = div({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '18px',
      width: '100%',
      alignItems: 'stretch',
    })

    profiles.forEach((profile) => {
      const isSelected = this.selectedProfile === profile.name
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

      card.addEventListener('click', () => {
        this.selectedProfile = profile.name
        this.selectedProfileData = profile
        this.playerListDirty = true
        this.renderPlayerSelect()
      })

      cardWrap.appendChild(card)

      if (!isBuiltin) {
        const deleteBtn = document.createElement('button')
        deleteBtn.type = 'button'
        deleteBtn.setAttribute('aria-label', `Delete ${profile.name}`)
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
          deleteProfile(profile.name)
          if (this.selectedProfile === profile.name) {
            this.selectedProfile = null
            this.selectedProfileData = null
          }
          this.playerListDirty = true
          this.renderPlayerSelect()
        })
        cardWrap.appendChild(deleteBtn)
      }

      cardGrid.appendChild(cardWrap)
    })

    this.playerListEl.appendChild(cardGrid)

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
        const created = addProfile(input.value)
        if (created) {
          this.selectedProfile = created.name
          this.selectedProfileData = created
          this.playerListDirty = true
        }
        this.renderPlayerSelect()
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
          this.renderPlayerSelect()
        }
      })
      input.addEventListener('blur', handleBlur)
    })
    this.playerListEl.appendChild(addBtn)

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
      this.onPractice()
    })
    this.playerListEl.appendChild(practiceBtn)

    this.playerListDirty = false
  }
}
