export interface NoteFont {
  id: string;
  label: string;
  cssFamily: string;
}

// Self-hosted (via @fontsource) rather than loaded from Google's CDN, so
// switching fonts and reading notes both keep working offline.
export const NOTE_FONTS: NoteFont[] = [
  { id: "inter", label: "Inter", cssFamily: "Inter, ui-sans-serif, sans-serif" },
  { id: "nunito", label: "Nunito", cssFamily: "Nunito, ui-sans-serif, sans-serif" },
  { id: "fraunces", label: "Fraunces", cssFamily: '"Fraunces Variable", ui-serif, serif' },
  { id: "merriweather", label: "Merriweather", cssFamily: "Merriweather, ui-serif, serif" },
  { id: "playfair", label: "Playfair Display", cssFamily: '"Playfair Display", ui-serif, serif' },
  { id: "space-mono", label: "Space Mono", cssFamily: '"Space Mono", ui-monospace, monospace' },
];

export const DEFAULT_NOTE_FONT = NOTE_FONTS[0].cssFamily;

export function fontLabelFor(cssFamily: string): string {
  return NOTE_FONTS.find((f) => f.cssFamily === cssFamily)?.label ?? "Custom";
}
