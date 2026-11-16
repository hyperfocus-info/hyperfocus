import { createSignal, For, Show } from 'solid-js';
import * as stylex from '@stylexjs/stylex';
import { Button } from "../primitives/button";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { Input } from "../form/input";
import { SelectControl } from "../primitives/selection/select-control";
import { tokens } from '../theme/tokens.stylex';
import { logoDataUrl, markNames, validateLogo, type Branding, type SocialMetadata } from '@hyperfocus/branding';

const styles = stylex.create({ field: { gap: tokens.space1, marginBlock: tokens.space2, display: 'grid', } });
/** Hosts own persistence and history; these fields share the portable identity contract. */
export function BrandingFields(props: { name: string; branding: Branding; social: SocialMetadata; onBranding: (value: Branding) => void; onSocial: (value: SocialMetadata) => void }) {
  const [error, setError] = createSignal('');
  const update = (change: Partial<Branding>) => props.onBranding({ ...props.branding, ...change });
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('Choose a logo smaller than 3 MB.');
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.readAsDataURL(file); });
      update({ logo: validateLogo({ name: file.name, mime: file.type, data }) }); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to read this logo.'); }
  }
  return <>
    <Disclosure title="Logo">
      <img src={logoDataUrl({ branding: props.branding })} alt={`${props.name} logo preview`} width="64" height="64"/>
      <SelectControl ariaLabel="Logo symbol" value={props.branding.mark} options={markNames.map(value => ({ value, label: value }))} onChange={mark => update({ mark, logo: null })}/>
      <label {...stylex.attrs(styles.field)}>Logo color<Input aria-label="Logo color" type="color" value={props.branding.color} onChange={event => update({ color: event.currentTarget.value })}/></label>
      <label {...stylex.attrs(styles.field)}>Icon background<Input aria-label="Icon background" type="color" value={props.branding.background} onChange={event => update({ background: event.currentTarget.value })}/></label>
      <label {...stylex.attrs(styles.field)}>Use your own logo<Input aria-label="Use your own logo" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={event => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/></label>
      <Button variant="secondary" justificationForNoTooltip="The action is named." onClick={() => update({ logo: null })}>Use symbol</Button>
      <Show when={error()}><p role="alert">{error()}</p></Show>
    </Disclosure>
    <Disclosure title="Social preview">
      <For each={[
        ['title', 'Social title'], ['description', 'Social description'], ['canonicalUrl', 'Canonical URL'], ['image', 'Social image URL'], ['imageAlt', 'Social image description'], ['siteName', 'Site name'], ['locale', 'Locale'],
      ] as const}>{([field, label]) => <label {...stylex.attrs(styles.field)}>{label}<Input aria-label={label} value={props.social[field]} onChange={event => props.onSocial({ ...props.social, [field]: event.currentTarget.value })}/></label>}</For>
      <SelectControl ariaLabel="Open Graph type" value={props.social.type} options={[{value:'website',label:'Website'},{value:'article',label:'Article'}]} onChange={type => props.onSocial({ ...props.social, type })}/>
      <Disclosure title="Preview defaults"><p>Empty titles and descriptions use the page text. With a canonical URL, an empty image uses the generated logo card.</p></Disclosure>
    </Disclosure>
  </>;
}
