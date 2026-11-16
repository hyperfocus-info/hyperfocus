/** The visible radios are the form state; there is no mirrored hidden field. */
export function attachRoomChoices(options: { form: HTMLFormElement }) {
  const create = (name: string, legend: string, values: readonly { value: string; label: string; detail?: string; hidden?: boolean }[]) => {
    const element = options.form.querySelector<HTMLFieldSetElement>('[data-network-choice="' + name + '"]')!;
    element.className = 'hf-room-choices';
    const title = document.createElement('legend');title.textContent = legend;element.append(title);
    const radios = values.map((option, index) => {
      const label = document.createElement('label'), radio = document.createElement('input'), text = document.createElement('span');
      radio.type = 'radio';radio.name = name;radio.value = option.value;radio.checked = index === 0;
      text.textContent = option.label;label.hidden = option.hidden ?? false;
      if (option.detail) { const detail = document.createElement('small');detail.textContent = option.detail;text.append(detail); }
      label.append(radio, text);element.append(label);return radio;
    });
    return {
      element, options: radios,
      get value() { return radios.find(radio => radio.checked)?.value ?? ''; },
      set value(value: string) { for (const radio of radios) radio.checked = radio.value === value; },
      get disabled() { return element.disabled; },
      set disabled(value: boolean) { element.disabled = value; },
    };
  };
  return {
    roomType: create('roomType', 'How do you want to play?', [
      { value: 'combat-relay', label: 'Private set', detail: 'A private set with a friend.' },
      { value: 'tod-community', label: 'Winner stays room', detail: 'Take turns. The winner stays in.' },
      { value: 'tod-quick-play', label: 'Online Quick Play', hidden: true },
      { value: 'tod-training', label: 'Shared training', detail: 'Practice with one partner.' },
    ]),
    role: create('role', 'Join as', [{ value: 'fighter', label: 'Fight' }, { value: 'spectator', label: 'Watch' }]),
  };
}
