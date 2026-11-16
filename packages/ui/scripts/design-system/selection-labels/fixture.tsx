import { createSignal, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import { SelectControl } from '../../../src/primitives/selection/select-control';
import { createDomSelectControl } from '../../../src/primitives/selection/dom-select';
import '../../../src/stylex-entry.css';

const options = [
  { value: 'start', label: 'Character locomotion cycle — anticipation and turn left' },
  { value: 'end', label: 'Character locomotion cycle — anticipation and turn right' },
  { value: 'long', label: 'CustomerReleaseLocalizationCharacterLocomotionCycleWithoutWordSeparators' },
  ...Array.from({ length: 24 }, (_, index) => ({ value: `route-${index}`, label: `Wide Dream / Customer named processing stage ${index + 1} / Modulation destination` })),
];

function Fixture() {
  const [value, setValue] = createSignal('start');
  let element!: HTMLButtonElement;
  onMount(() => {
    const control = createDomSelectControl({ element, ariaLabel: 'Imperative clip', options, value: 'start' });
    onCleanup(control.dispose);
  });
  return <main style={{ padding: '1rem', 'max-width': '32rem' }}>
    <h1>Named animation clips</h1>
    <p>Choose the direction using the complete clip name.</p>
    <SelectControl ariaLabel="Solid clip" value={value()} options={options} onChange={setValue} />
    <p>Imperative editor adapter</p>
    <button ref={element} />
  </main>;
}

render(() => <Fixture />, document.getElementById('root')!);
