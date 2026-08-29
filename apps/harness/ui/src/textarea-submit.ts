export function submitOnEnter(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }

    event.preventDefault();
    handler();
  };
}
