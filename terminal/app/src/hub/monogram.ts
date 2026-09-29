/** Initials for the no-picture card: "Friend credits" -> "FC", "Replay" -> "RE". */
export function monogram(name: string): string {
  const words = name.replace(/^the\s+/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
