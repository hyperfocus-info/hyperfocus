export type GameAudioMix = { master: number; sfx: number; music: number; voice: number; ambient: number };
export function createSettingsMix(options: { parent: HTMLElement; initial?: Partial<GameAudioMix>; onChange: (mix: GameAudioMix) => void }) {
  const values: GameAudioMix = { master: .5, sfx: .5, music: .5, voice: .5, ambient: .5 };
  const sliders = new Map<keyof GameAudioMix, { input: HTMLInputElement; output: HTMLOutputElement }>();
  for (const [key, name] of [['master', 'Master volume'], ['sfx', 'SFX volume'], ['music', 'Music volume'], ['ambient', 'Ambient volume']] as const) {
    const label = document.createElement('label'), input = document.createElement('input'), output = document.createElement('output');
    label.className = 'hf-audio-mix-row';const title = document.createElement('span');title.textContent = name;
    input.type = 'range';input.min = '0';input.max = '100';input.step = '5';input.setAttribute('aria-label', name);
    label.append(title, input, output);options.parent.append(label);sliders.set(key, { input, output });
    input.addEventListener('input', () => { values[key] = Number(input.value) / 100;values.voice = values.sfx;output.value = `${input.value}%`;options.onChange({ ...values }); });
    input.addEventListener('keydown', event => {
      const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -5 : 0;
      if (!direction && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();input.value = String(event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, Number(input.value) + direction)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const hint = document.createElement('p');hint.textContent = 'SFX controls punches, character voices and menu sounds. Ambient controls background sounds. Controller: up/down selects; left/right adjusts.';options.parent.append(hint);
  function restore(mix: Partial<GameAudioMix>) {
    for (const key of ['master', 'sfx', 'music', 'ambient'] as const) { const value = mix[key];if (typeof value === 'number' && Number.isFinite(value)) values[key] = Math.max(0, Math.min(1, value));const slider = sliders.get(key)!;slider.input.value = String(Math.round(values[key] * 100));slider.output.value = `${slider.input.value}%`; }
    // Legacy voice preferences no longer split voices from the effects control.
    values.voice = values.sfx;
  }
  restore(options.initial ?? {});
  return { capture: () => ({ ...values }), restore, apply: () => options.onChange({ ...values }) };
}
