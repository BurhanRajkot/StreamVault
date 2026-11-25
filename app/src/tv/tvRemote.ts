/**
 * TV mode: the app driven by a remote's arrows, OK and Back.
 *
 * - The page lays out 1280 CSS px wide and is fitted to the screen (the web
 *   view is only ~960 wide on a 1080p TV — the phone layout), so a TV gets
 *   the big-screen layout, sized for across the room.
 * - The arrows move focus to the nearest control that way (spatialNav.ts):
 *   along a row of cards, down to the next row, up to the top bar. Dialogs
 *   and sheets keep the focus inside them; the player has rules of its own.
 * - OK presses the focused control; Back is Android's (App.tsx).
 *
 * The highlight on the focused control is app.css (.sv-tv).
 */

import { pickNext, type Box, type Direction } from './spatialNav'
import { SvNative } from '@app/native/platform'

/** The layout width a TV gets, fitted to its screen: 1.5 device px per CSS px on 1080p. */
export const TV_VIEWPORT_WIDTH = 1280

const FOCUSABLE = 'a[href],button,input:not([type="hidden"]),select,textarea,iframe,[tabindex],[contenteditable="true"]'
const KEY_DIRECTION: Record<string, Direction | undefined> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
/** Made-up controls OK should press (real buttons and links press themselves). */
const ROLE_CONTROLS = '[role="button"],[role="link"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="switch"],[role="checkbox"],[role="radio"]'
const NATIVE_CONTROLS = 'a[href],button,input,select,textarea,summary'

/** Keys this file sends itself, so it doesn't act on them twice. */
const ownEvents = new WeakSet<Event>()
/** Where the focus was, for when the element it was on goes away. */
let lastBox: Box | null = null

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/.test(el.type)
  return (el as HTMLElement).isContentEditable
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

/** Can the remote land on it: focusable, enabled, on screen (or scrolled away in a row), not hidden. */
export function isNavigable(el: HTMLElement): boolean {
  if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) return false
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  return visible(el)
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[inert],[aria-hidden="true"]')) return false
  return typeof el.checkVisibility !== 'function' || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
}

interface Candidate {
  el: HTMLElement
  box: Box
}

/**
 * The controls the remote can land on, with their boxes. A page (Home's
 * endless rows) holds hundreds: only those within a couple of screens of the
 * view are looked at closely — the next row is never further than that.
 */
function candidates(scope: ParentNode, nearView = false): Candidate[] {
  const above = -window.innerHeight * 1.5
  const below = window.innerHeight * 2.5
  const out: Candidate[] = []
  for (const el of scope.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (nearView && (r.bottom < above || r.top > below)) continue
    if (!visible(el)) continue
    out.push({ el, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
  }
  return out
}

const elements = (list: Candidate[]) => list.map((c) => c.el)

/** The open dialog or sheet on top, if any — the focus stays inside it. */
function openDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')).filter(
    (d) => d.getBoundingClientRect().width > 0 && !d.closest('[aria-hidden="true"]')
  )
  return dialogs[dialogs.length - 1] ?? null
}

function currentScope(): HTMLElement {
  return openDialog() ?? document.querySelector<HTMLElement>('.app-player') ?? document.body
}

/** The top bar, the players, sheets: layers that don't scroll with the page (Tailwind's `fixed`). */
function inFixedLayer(el: HTMLElement): boolean {
  return !!el.closest('.fixed, [role="dialog"]')
}

/**
 * Bring a newly focused control into view: its row scrolls to it, the page
 * follows; near the top, the page goes all the way up. It jumps rather than
 * glides: every frame of a glide costs a TV box a layout, and glides queued
 * behind each other are what lag looks like.
 */
function reveal(el: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
  if (inFixedLayer(el)) return
  const pageTop = el.getBoundingClientRect().top + window.scrollY
  if (pageTop < window.innerHeight * 0.55 && window.scrollY > 0) window.scrollTo({ top: 0, behavior })
}

export function focusOn(el: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  el.focus({ preventScroll: true })
  reveal(el, behavior)
}

function inViewport(list: HTMLElement[]): HTMLElement[] {
  return list.filter((el) => {
    const r = el.getBoundingClientRect()
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
  })
}

/** A screen's first control: the first in view, in reading order. */
function firstInView(list: HTMLElement[]): HTMLElement | null {
  const inView = inViewport(list)
  return firstInReadingOrder(inView.length ? inView : list)
}

/** Where to start when nothing is focused: near where the focus last was, else the first control in view (the page before the top bar). */
function startingPoint(list: HTMLElement[]): HTMLElement | null {
  const inView = inViewport(list)
  if (inView.length === 0) return list[0] ?? null
  if (lastBox) {
    const cx = (lastBox.left + lastBox.right) / 2
    const cy = (lastBox.top + lastBox.bottom) / 2
    let best = inView[0]
    let bestDistance = Infinity
    for (const el of inView) {
      const b = boxOf(el)
      const d = Math.hypot((b.left + b.right) / 2 - cx, (b.top + b.bottom) / 2 - cy)
      if (d < bestDistance) {
        bestDistance = d
        best = el
      }
    }
    return best
  }
  const main = inView.filter((el) => el.closest('main'))
  return firstInReadingOrder(main.length ? main : inView)
}

function firstInReadingOrder(list: HTMLElement[]): HTMLElement | null {
  return [...list].sort((a, b) => {
    const ra = boxOf(a)
    const rb = boxOf(b)
    return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left
  })[0] ?? null
}

/** Move the focus one step; false when there's nothing that way. */
export function moveFocus(direction: Direction, scope: HTMLElement = currentScope(), behavior: ScrollBehavior = 'auto'): boolean {
  const list = candidates(scope, scope === document.body)
  const active = document.activeElement as HTMLElement | null
  const current = active && active !== document.body && scope.contains(active) && isNavigable(active) ? active : null
  if (!current) {
    const start = startingPoint(elements(list))
    if (!start) return false
    focusOn(start, behavior)
    return true
  }
  const others = list.filter((c) => c.el !== current && !c.el.contains(current) && !current.contains(c.el))
  const index = pickNext(boxOf(current), others.map((c) => c.box), direction)
  if (index < 0) return false
  focusOn(others[index].el, behavior)
  return true
}

/** Send a key as if pressed (the players listen for Space and the arrows). */
function press(key: string): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  ownEvents.add(event)
  ;(document.activeElement ?? document.body).dispatchEvent(event)
}

/** Keep the Premium player's controls up while they're being used (PlayerControls listens). */
function wake(controls: HTMLElement): void {
  controls.dispatchEvent(new CustomEvent('sv-player-wake'))
}

/**
 * Our own player (Premium, offline): ← → seek and OK plays/pauses while its
 * controls are away; ↑ ↓ bring them up, and then the arrows move between
 * them. The embeds (other servers) play in a frame: ↓ hands the remote to
 * it, and Back brings our bar back (App.tsx).
 */
function handlePlayer(e: KeyboardEvent, direction: Direction | undefined, active: HTMLElement | null): boolean {
  const player = document.querySelector<HTMLElement>('.app-player')
  if (!player || openDialog()) return false

  const controls = player.querySelector<HTMLElement>('.player-controls')
  if (controls) {
    const shown = controls.hasAttribute('data-shown')
    const onControl = !!active && active !== controls && controls.contains(active) && isNavigable(active)
    if (e.key === 'Enter') {
      if (shown && onControl) return true // the control presses itself
      e.preventDefault()
      press(' ')
      return true
    }
    if (!direction) return false
    if (!shown || !onControl) {
      if (direction === 'left' || direction === 'right') return true // the player seeks
      e.preventDefault()
      wake(controls)
      const first = controls.querySelector<HTMLElement>('[data-tv-initial]')
      if (first && isNavigable(first)) first.focus({ preventScroll: true })
      else moveFocus(direction, controls)
      return true
    }
    wake(controls)
    // On the seek bar, ← → seek (the player does it); ↑ ↓ leave it
    if (active?.matches('[role="slider"]') && (direction === 'left' || direction === 'right')) return true
    e.preventDefault()
    moveFocus(direction, controls)
    return true
  }

  // A downloaded file in the browser's own player: OK plays/pauses, ← → skip 10 s, ↑ brings the bar
  const video = player.querySelector<HTMLVideoElement>('video[data-tv-video]')
  if (video && (!active || active === document.body || active === video)) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (video.paused) void video.play().catch(() => {})
      else video.pause()
      return true
    }
    if (direction === 'left' || direction === 'right') {
      e.preventDefault()
      seekVideo(video, direction === 'right' ? 10 : -10)
      return true
    }
    if (direction === 'up') {
      e.preventDefault()
      // The bar shows on pointer activity (OfflinePlayerScreen), and its buttons can take the focus once it's up
      player.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      setTimeout(() => {
        const first = Array.from(player.querySelectorAll<HTMLElement>('button')).find(isNavigable)
        first?.focus()
      }, 80)
      return true
    }
    if (direction === 'down') {
      e.preventDefault()
      return true
    }
  }

  // An embed: our bar over its frame
  const frame = player.querySelector<HTMLIFrameElement>('iframe')
  if (!frame) return false
  // Our bar faded away with the focus on it: OK hands the remote back to the embed
  if (e.key === 'Enter' && (!active || active === document.body)) {
    e.preventDefault()
    frame.focus()
    return true
  }
  if (!direction) return false
  e.preventDefault()
  const moved = moveFocus(direction, player)
  if (!moved && direction === 'down') frame.focus()
  return true
}

function seekVideo(video: HTMLVideoElement, seconds: number): void {
  const end = Number.isFinite(video.duration) ? video.duration : Infinity
  video.currentTime = Math.max(0, Math.min(end, video.currentTime + seconds))
}

/** The remote's media keys, where it has them. */
function handleMediaKey(e: KeyboardEvent): boolean {
  const key = { MediaPlayPause: ' ', MediaPlay: ' ', MediaPause: ' ', MediaFastForward: 'ArrowRight', MediaRewind: 'ArrowLeft' }[e.key]
  if (!key) return false
  const video = document.querySelector<HTMLVideoElement>('.app-player video[data-tv-video]')
  if (video) {
    e.preventDefault()
    if (key === ' ') {
      if (video.paused) void video.play().catch(() => {})
      else video.pause()
    } else seekVideo(video, key === 'ArrowRight' ? 10 : -10)
    return true
  }
  if (!document.querySelector('.app-player .player-controls')) return false
  e.preventDefault()
  const controls = document.querySelector<HTMLElement>('.app-player .player-controls')
  // Seeking needs the focus off the controls (there the arrows move between them)
  if (key !== ' ' && controls?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  press(key)
  return true
}

/** A text field's caret at its start (←) or end (→): the arrow leaves the field. */
function caretAtEdge(el: HTMLInputElement | HTMLTextAreaElement, direction: Direction): boolean {
  try {
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    return direction === 'left' ? start === 0 && end === 0 : start === el.value.length
  } catch {
    return true // a field without a caret (email, number)
  }
}

/** When the last arrow was acted on: a held-down button repeats faster than a TV box can lay out. */
let lastMoveAt = 0
const REPEAT_MS = 110

function onKeyDown(e: KeyboardEvent): void {
  if (ownEvents.has(e) || e.altKey || e.ctrlKey || e.metaKey) return
  if (handleMediaKey(e)) return
  if (e.defaultPrevented) return
  const direction = KEY_DIRECTION[e.key]
  const active = document.activeElement as HTMLElement | null

  if (handlePlayer(e, direction, active)) return

  if (e.key === 'Enter') {
    if (isTextField(active)) {
      // OK on a field raises the keyboard (the TV's web view doesn't always)
      if (!active.dataset.tvTyping) {
        active.dataset.tvTyping = '1'
        void SvNative.showKeyboard?.().catch(() => {})
      }
      return
    }
    if (active && active.matches(ROLE_CONTROLS) && !active.matches(NATIVE_CONTROLS)) {
      e.preventDefault()
      active.click()
    }
    return
  }
  if (!direction) return
  if (isTextField(active) && (direction === 'left' || direction === 'right') && !(active instanceof HTMLElement && active.isContentEditable) && !caretAtEdge(active as HTMLInputElement, direction)) return

  e.preventDefault()
  const now = performance.now()
  if (e.repeat && now - lastMoveAt < REPEAT_MS) return
  lastMoveAt = now
  const scope = currentScope()
  const moved = moveFocus(direction, scope)
  // Nothing that way on a page of text: scroll it instead
  if (!moved && scope === document.body && (direction === 'up' || direction === 'down')) {
    window.scrollBy({ top: (direction === 'down' ? 1 : -1) * window.innerHeight * 0.4, behavior: 'auto' })
  }
}

function onFocusIn(e: FocusEvent): void {
  const el = e.target as HTMLElement
  if (el && el !== document.body && el.getBoundingClientRect) lastBox = boxOf(el)
}

function onFocusOut(e: FocusEvent): void {
  const el = e.target as HTMLElement
  if (el?.dataset?.tvTyping) delete el.dataset.tvTyping
}

/** Turn TV mode on: wide layout, remote navigation, the focus highlight. */
export function startTvMode(): void {
  document.documentElement.classList.add('sv-tv')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  // The native side lets the page set its width (MainActivity: wide viewport) and fits it to the screen
  if (meta) meta.content = `width=${TV_VIEWPORT_WIDTH}, viewport-fit=cover`
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
}

/**
 * Focus the screen's first control once it's there: `[data-tv-autofocus]`
 * (Play), else the first in the page — and if Play turns up a moment later,
 * move to it as long as the viewer hasn't moved. The top bar only if the
 * screen shows nothing focusable for ~2.5 s.
 */
export function focusScreen(): () => void {
  let frame = 0
  let chosen: HTMLElement | null = null
  const startedAt = performance.now()
  const tick = () => {
    const active = document.activeElement
    const untouched = !active || active === document.body || active === chosen
    if (!untouched) return // the viewer (or the screen) already chose
    const elapsed = performance.now() - startedAt
    const scope = currentScope()
    const preferred = scope.querySelector<HTMLElement>('[data-tv-autofocus]')
    if (preferred && isNavigable(preferred)) {
      if (preferred !== active) preferred.focus({ preventScroll: true })
      return
    }
    if (!chosen || !chosen.isConnected) {
      // Our own player opens with nothing chosen: OK plays/pauses and ← → seek until ↑ ↓ bring its controls
      const list = elements(candidates(scope, scope === document.body)).filter((el) => !el.closest('.player-controls'))
      const inMain = scope === document.body ? list.filter((el) => el.closest('main')) : list
      const target = firstInView(inMain.length || elapsed < 2500 ? inMain : list)
      if (target) {
        chosen = target
        target.focus({ preventScroll: true })
      }
    }
    if (elapsed < 2500) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

/** What to look for to focus the same control again after coming back to a screen. */
export interface FocusMark {
  href: string | null
  label: string | null
}

function labelOf(el: HTMLElement): string | null {
  return el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 80) ?? null
}

export function markFocus(): FocusMark | null {
  const active = document.activeElement as HTMLElement | null
  if (!active || active === document.body || !active.closest('main')) return null
  return { href: active.getAttribute('href'), label: labelOf(active) }
}

/** Focus the control a mark points at, once the screen has it (its rows load after the page). */
export function restoreFocus(mark: FocusMark): () => void {
  let frame = 0
  const startedAt = performance.now()
  const tick = () => {
    const list = elements(candidates(document.body)).filter((el) => el.closest('main'))
    const match =
      list.find((el) => el.getAttribute('href') === mark.href && labelOf(el) === mark.label) ??
      (mark.href !== null ? list.find((el) => el.getAttribute('href') === mark.href) : undefined)
    if (match) {
      // The page's scroll is restored separately (App.tsx); the row needs its own
      match.focus({ preventScroll: true })
      match.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return
    }
    if (performance.now() - startedAt < 2500) frame = requestAnimationFrame(tick)
    else focusScreen()
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
