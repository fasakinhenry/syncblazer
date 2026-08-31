const AVATAR_STYLE = "thumbs";

export function buildAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function generateAvatarOptions(count: number): string[] {
  return Array.from({ length: count }, () => buildAvatarUrl(randomSeed()));
}
