import type { GameState } from './game-state'
import {
  addProfile,
  deleteProfile,
  loadProfiles,
  type PlayerProfile,
} from './profiles'
import {
  div,
  FONT_MONO,
  FONT_TEXT,
  GOLD,
  scaled,
  Z_OVERLAY,
} from './overlay-utils'
import {
  createAddPlayerButton,
  createPlayerSelectLabel,
  createPracticeButton,
  createProfileCard,
  createProfileCardGrid,
} from './title-overlay-parts'

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

    this.playerListEl.appendChild(createPlayerSelectLabel())

    const cardGrid = createProfileCardGrid()

    profiles.forEach((profile) => {
      cardGrid.appendChild(createProfileCard({
        profile,
        isSelected: this.selectedProfile === profile.name,
        onSelect: () => {
          this.selectedProfile = profile.name
          this.selectedProfileData = profile
          this.playerListDirty = true
          this.renderPlayerSelect()
        },
        onDelete: () => {
          deleteProfile(profile.name)
          if (this.selectedProfile === profile.name) {
            this.selectedProfile = null
            this.selectedProfileData = null
          }
          this.playerListDirty = true
          this.renderPlayerSelect()
        },
      }))
    })

    this.playerListEl.appendChild(cardGrid)

    this.playerListEl.appendChild(createAddPlayerButton({
      onCreate: (name) => addProfile(name),
      onRendered: () => this.renderPlayerSelect(),
      onSelected: (created) => {
        this.selectedProfile = created.name
        this.selectedProfileData = created
        this.playerListDirty = true
      },
    }))

    this.playerListEl.appendChild(createPracticeButton(() => this.onPractice()))

    this.playerListDirty = false
  }
}
