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
