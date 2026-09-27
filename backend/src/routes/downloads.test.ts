import { describe, expect, it } from 'bun:test';

// Extract the sanitizeFilename logic to test it,
// since it's not exported from the module
function sanitizeFilename(filename: string): string {
  // Reject any filename containing path traversal sequences explicitly
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: Path traversal detected')
  }

  // Remove any path separators and only keep the basename (defense in depth)
  // Simulate path.basename for testing purposes since it is straightforward on safe inputs
  const basename = filename.split(/[\\/]/).pop() || '';

  // Only allow alphanumeric, dots, hyphens, and underscores
  let sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Fallback to safe default if string becomes empty after sanitization
  // or if the string only contains safe characters like underscores/hyphens/dots but no actual name
  if (!sanitized || sanitized.replace(/[._-]/g, '').length === 0) {
    sanitized = 'download_file'
  }

  return sanitized
}

describe('sanitizeFilename', () => {
  it('throws an error for path traversal characters', () => {
    expect(() => sanitizeFilename('../etc/passwd')).toThrow('Invalid filename: Path traversal detected');
    expect(() => sanitizeFilename('..')).toThrow('Invalid filename: Path traversal detected');
    expect(() => sanitizeFilename('/absolute/path.txt')).toThrow('Invalid filename: Path traversal detected');
    expect(() => sanitizeFilename('C:\\Windows\\System32')).toThrow('Invalid filename: Path traversal detected');
  });

  it('allows safe filenames with extensions', () => {
    expect(sanitizeFilename('movie.mp4')).toBe('movie.mp4');
    expect(sanitizeFilename('Mumbai.Mafia.2023.1080p.WEBRip.mp4')).toBe('Mumbai.Mafia.2023.1080p.WEBRip.mp4');
    expect(sanitizeFilename('my-torrent-file_123.torrent')).toBe('my-torrent-file_123.torrent');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('movie (2023)[1080p].mp4')).toBe('movie__2023__1080p_.mp4');
    expect(sanitizeFilename('my file@name!#$.mp4')).toBe('my_file_name___.mp4');
  });

  it('falls back to safe default if filename becomes empty or only symbols', () => {
    expect(sanitizeFilename('')).toBe('download_file');
    expect(sanitizeFilename('-_.')).toBe('download_file');
    expect(sanitizeFilename('   ')).toBe('download_file'); // spaces become underscores, then it's just symbols
    expect(sanitizeFilename('___')).toBe('download_file');
  });
});
