import { SelectControl } from '@hyperfocus/ui';
import * as stylex from '@stylexjs/stylex';
import { controlStyles as styles } from './styles/controls.stylex';
export type DropdownOption = { value: string; label: string };
export type DropdownProps = { class?: string; value: string; label?: string; options: DropdownOption[]; onChange: (value: string) => void };
export function Dropdown(props: DropdownProps) {
 return <label class={`${stylex.attrs(styles.label).class} ${props.class ?? ''}`.trim()}><span>{props.label ?? ''}</span><SelectControl ariaLabel={props.label ?? 'Choose an option'} value={props.value} options={props.options} onChange={props.onChange} /></label>;
}
