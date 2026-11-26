/** Minimal class-name joiner. Keeps JSX readable without a dependency. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
