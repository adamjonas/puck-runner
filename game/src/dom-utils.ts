type InteractiveEventTarget = EventTarget & {
  tagName?: string
  isContentEditable?: boolean
  parentElement?: InteractiveEventTarget | null
}

export function isInteractiveEventTarget(target: EventTarget | null): boolean {
  let current = target as InteractiveEventTarget | null

  while (current && typeof current === 'object') {
    if (current.isContentEditable) return true

    const tagName = typeof current.tagName === 'string'
      ? current.tagName.toUpperCase()
      : ''

    if (
      tagName === 'BUTTON'
      || tagName === 'INPUT'
      || tagName === 'SELECT'
      || tagName === 'TEXTAREA'
      || tagName === 'A'
    ) {
      return true
    }

    current = current.parentElement ?? null
  }

  return false
}

export function shouldSuppressGlobalKeydown(target: EventTarget | null, key: string): boolean {
  if (!isInteractiveEventTarget(target)) return false
  return key === ' ' || key === 'Enter'
}
