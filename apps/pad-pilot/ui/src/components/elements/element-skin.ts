export type ElementSkinState = {
  src: string;
  alt?: string;
};

export type ElementSkin = {
  idle?: ElementSkinState;
  hover?: ElementSkinState;
  active?: ElementSkinState;
  disabled?: ElementSkinState;
};

export type TooltipPlacement = "top" | "right" | "bottom" | "left";

export function resolveElementSkin(
  skin: ElementSkin | undefined,
  state: { active: boolean; disabled: boolean; hovered: boolean },
) {
  if (!skin) {
    return undefined;
  }

  if (state.disabled) {
    return skin.disabled ?? skin.idle;
  }

  if (state.active) {
    return skin.active ?? skin.hover ?? skin.idle;
  }

  if (state.hovered) {
    return skin.hover ?? skin.idle;
  }

  return skin.idle;
}
