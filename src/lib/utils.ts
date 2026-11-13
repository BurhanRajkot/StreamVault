import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Media } from "./config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Message from a caught value, which TypeScript types as `unknown` — anything
 * can be thrown, so narrowing is required before reading `.message`.
 *
 * @param fallback shown when the thrown value carries no usable message
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

/**
 * Genre ids for a title, in the shape the interaction-logging API wants.
 *
 * Passing these along with an event lets the backend skip a genre lookup, so
 * every call site that logs an interaction needs them — hence a helper rather
 * than the same optional-chain spelled out at each one.
 */
export function genreIdsOf(media: Pick<Media, 'genres'>): number[] | undefined {
  return media.genres?.map((g) => g.id).filter(Boolean);
}

/**
 * The title page's path, e.g. /watch/tv/1398-the-sopranos — what every card
 * links to so search engines can follow from a list into the title.
 */
export function watchPath(mediaType: 'movie' | 'tv', id: number, title: string): string {
  const slug = slugify(title)
  return `/watch/${mediaType}/${id}${slug ? `-${slug}` : ''}`
}

/**
 * A card's click: open the title in the app, or — Ctrl/⌘-click on its link —
 * let the browser open it in a new tab. Returns whether the app should handle it.
 */
export function shouldHandleCardClick(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; target: EventTarget | null; preventDefault: () => void }): boolean {
  const onLink = e.target instanceof Element && e.target.closest('a[href]') !== null
  if (onLink && (e.ctrlKey || e.metaKey || e.shiftKey)) return false
  // The link is for crawlers and new tabs; a plain click stays in the app
  e.preventDefault()
  return true
}

export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w-]+/g, '')        // Remove all non-word chars
    .replace(/--+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/** Up to two initials for an avatar: "Riley Tester" → "RT". */
export function initialsOf(name: string | undefined): string {
  return (
    name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SV'
  )
}
