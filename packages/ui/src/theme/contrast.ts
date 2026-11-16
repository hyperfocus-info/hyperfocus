/** Relative contrast for opaque three- or six-digit sRGB hex colors. Invalid colors fail closed. */
export function getContrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
    if (!match) return undefined;
    const hex = match[1].length === 3 ? [...match[1]].map(part => part + part).join('') : match[1];
    return getRelativeLuminance({ r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) });
  };
  const first = luminance(foreground), second = luminance(background);
  if (first === undefined || second === undefined) return 1;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Opaque sRGB channels in the 0–255 range. */
export function getRelativeLuminance(color: { r: number; g: number; b: number }) {
  const channel = (value: number) => { const normalized = value / 255; return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; };
  return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
}
