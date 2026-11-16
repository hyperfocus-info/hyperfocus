/** Native controls own keyboard activation/navigation; only the game canvas feeds combat bindings. */
export function standaloneUiOwnsKeyboard(options: { target: EventTarget | null }): boolean {
  return options.target instanceof Element && Boolean(options.target.closest(
    'button, input, select, textarea, summary, [contenteditable=true], dialog[open], .hf-community, .hf-quick-play, .hf-training, .hf-voice-quick, .hf-replay'
  ));
}
