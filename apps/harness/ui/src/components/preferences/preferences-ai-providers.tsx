import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { CheckboxField,typography } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { SegmentedControl } from "./preferences-controls";
import { ProviderCredential } from "./providers/provider-credential";
import { providerStyles as styles } from "./providers/providers.styles";

export function PreferencesAiProviders() {
  const panel = usePreferencesPanel();
  const { state, store } = panel.model;
  return (
    <section data-test-ai-providers="" {...stylex.attrs(styles.page)}>
      <header {...stylex.attrs(styles.copy)}>
        <h3 {...stylex.attrs(typography.page)}>AI &amp; Providers</h3>

      </header>
      <section id="provider-keys" data-test-preference-row="provider-keys" aria-labelledby="provider-connections-heading" {...stylex.attrs(styles.section)}>
        <div {...stylex.attrs(styles.copy)}>
          <h4 id="provider-connections-heading" {...stylex.attrs(typography.section)}>Provider connections</h4>
          <p {...stylex.attrs(typography.body, styles.muted)}>Keys stay on this machine. Test checks model access without saving. Choose Save key to keep a new or replacement key.</p>
        </div>
        <div {...stylex.attrs(styles.credentials)}>
          <ProviderCredential provider="openai" label="OpenAI API key" value={state.openAiApiKeyDraft} placeholder="sk-..."
            available={state.hasUsableOpenAiApiKey}
            stored={state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey} test={state.providerConnectionTests.openai}
            onInput={store.setOpenAiApiKeyDraft} onTest={() => panel.operational.handleTestProvider("openai", state.openAiApiKeyDraft)} onSave={() => panel.persistence.saveProviderKey("openai")} />
          <ProviderCredential provider="google" label="Google API key" value={state.googleApiKeyDraft} placeholder="AIza..."
            available={state.hasUsableGoogleApiKey}
            stored={state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey} test={state.providerConnectionTests.google}
            onInput={store.setGoogleApiKeyDraft} onTest={() => panel.operational.handleTestProvider("google", state.googleApiKeyDraft)} onSave={() => panel.persistence.saveProviderKey("google")} />
          <ProviderCredential provider="anthropic" label="Anthropic API key" value={state.anthropicApiKeyDraft} placeholder="sk-ant-..."
            available={state.hasUsableAnthropicApiKey}
            stored={state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey} test={state.providerConnectionTests.anthropic}
            onInput={store.setAnthropicApiKeyDraft} onTest={() => panel.operational.handleTestProvider("anthropic", state.anthropicApiKeyDraft)} onSave={() => panel.persistence.saveProviderKey("anthropic")} />
        </div>
      </section>
      <section id="composer-defaults" data-test-preference-row="composer-defaults" aria-labelledby="composer-defaults-heading" {...stylex.attrs(styles.section, styles.defaults)}>
        <div {...stylex.attrs(styles.copy)}>
          <h4 id="composer-defaults-heading" {...stylex.attrs(typography.section)}>Conversation defaults</h4>
          <p {...stylex.attrs(typography.body, styles.muted)}>Provider and reasoning defaults apply to Editor and PadPilot unless that app has an override. Models, Fast mode, credentials and execution permissions stay app-specific.</p>
        </div>
        <div {...stylex.attrs(styles.defaultGrid)}>
          <div id="provider-brand" data-test-preference-row="provider-brand" {...stylex.attrs(styles.copy)}>
            <p {...stylex.attrs(typography.control)}>Preferred provider</p>
            <SegmentedControl ariaLabel="Active provider" value={state.providerBrand}
              options={[{ value: "gpt", label: "GPT" }, { value: "gemini", label: "Gemini" }, { value: "claude", label: "Claude" }]}
              onChange={(value) => panel.persistence.updateAiDefaults(() => store.setProviderBrand(value))} />
          </div>
          <div {...stylex.attrs(styles.copy)}>
            <p {...stylex.attrs(typography.control)}>Reasoning effort</p>
            <SegmentedControl ariaLabel="Reasoning effort" value={state.selectedReasoningStrength}
              options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]}
              onChange={(value) => panel.persistence.updateAiDefaults(() => store.setSelectedReasoningStrength(value))} />
          </div>
        </div>
        <CheckboxField label="Fast mode" description="Use the faster service tier where supported. Provider pricing may differ.">
          <input type="checkbox" aria-label="Fast mode" checked={state.selectedFastMode} {...stylex.attrs(styles.checkbox)}
            onInput={(event) => panel.persistence.updateSavedPreference(() => store.setSelectedFastMode(event.currentTarget.checked))} />
        </CheckboxField>
      </section>
    </section>
  );
}
