export const inspectWorkspaceContrast = () => {
    const contrast = (foreground: string, background: string) => {
      const values = (color: string) => color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (color: string) => {
        const [red = 0, green = 0, blue = 0] = values(color).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const topbar = document.querySelector<HTMLElement>(".topbar")!;
    const brand = document.querySelector<HTMLElement>(".brand-block h1")!;
    const mode = document.querySelector<HTMLElement>('[data-editor-mode="play"]')!;
    const background = getComputedStyle(topbar).backgroundColor;
    return {
      brandContrast: contrast(getComputedStyle(brand).color, background),
      modeContrast: contrast(getComputedStyle(mode).color, background),
    };
  };
