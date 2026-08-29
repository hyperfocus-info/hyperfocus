export const CARD_DRAG_INTERACTIVE_SELECTOR =
  'button,input,select,textarea,[contenteditable],[role="button"],[data-no-drag]';
export const CARD_DRAG_HANDLE_SELECTOR = "[data-drag-handle]";

function getTargetElement(target: EventTarget | null) {
  if (target instanceof Element) {
    return target;
  }

  return target instanceof Node ? target.parentElement : null;
}

function isInteractiveCardDescendant(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
  interactiveSelector = CARD_DRAG_INTERACTIVE_SELECTOR,
) {
  const targetElement = getTargetElement(target);
  if (!(targetElement instanceof Element)) {
    return false;
  }

  const interactiveElement = targetElement.closest(interactiveSelector);
  return interactiveElement instanceof Element && currentTarget instanceof Element && currentTarget.contains(interactiveElement);
}

export function shouldHandleCardSurfaceAction(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
  interactiveSelector = CARD_DRAG_INTERACTIVE_SELECTOR,
) {
  return !isInteractiveCardDescendant(target, currentTarget, interactiveSelector);
}

export function shouldStartCardDrag(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
  interactiveSelector = CARD_DRAG_INTERACTIVE_SELECTOR,
  pointerType?: string,
  handleSelector = CARD_DRAG_HANDLE_SELECTOR,
) {
  const targetElement = getTargetElement(target);
  if (!(targetElement instanceof Element)) {
    return false;
  }

  if (!shouldHandleCardSurfaceAction(targetElement, currentTarget, interactiveSelector)) {
    return false;
  }

  if (pointerType !== "touch") {
    return true;
  }

  if (!(currentTarget instanceof Element)) {
    return true;
  }

  const handleElement = targetElement.closest(handleSelector);
  return handleElement instanceof Element && currentTarget.contains(handleElement);
}
