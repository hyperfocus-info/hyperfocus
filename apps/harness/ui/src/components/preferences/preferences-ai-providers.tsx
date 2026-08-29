/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import type { PreferencesPanelModel } from "../preferences-modal";
import type { PreferencesOperationalActions } from "./preferences-actions";
import { PasswordKeyInput, PreferenceRow, PreferenceSection, PreferenceToggle, SegmentedControl } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";

export function PreferencesAiProviders(props: { model: PreferencesPanelModel; actions: PreferencesOperationalActions; updateSavedPreference: (update: () => void) => void }) {
  const { state, store } = props.model;
  const { keyStatus, handleTestProvider } = props.actions;
  const { updateSavedPreference } = props;
  const renderToggle = (checked: boolean, onInput: (checked: boolean) => void, label: string) => (
    <PreferenceToggle checked={checked} label={label} onChange={(value) => updateSavedPreference(() => onInput(value))} />
  );
    return (
      <PreferenceSection title="AI & Providers" description="Credentials and composer defaults for AI runs.">
        <PreferenceRow id="provider-keys" title="Provider API keys" description="Keys stay local to this machine; test checks provider model-list access without saving drafts.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <PasswordKeyInput
              label="OpenAI API key"
              value={state.openAiApiKeyDraft}
              placeholder="sk-..."
              status={keyStatus("openai")}
              testStatus={state.providerConnectionTests.openai.status}
              testMessage={state.providerConnectionTests.openai.message}
              testMessageId="openai"
              onInput={(value) => updateSavedPreference(() => store.setOpenAiApiKeyDraft(value))}
              onTest={() => handleTestProvider("openai", state.openAiApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Google API key"
              value={state.googleApiKeyDraft}
              placeholder="AIza..."
              status={keyStatus("google")}
              testStatus={state.providerConnectionTests.google.status}
              testMessage={state.providerConnectionTests.google.message}
              testMessageId="google"
              onInput={(value) => updateSavedPreference(() => store.setGoogleApiKeyDraft(value))}
              onTest={() => handleTestProvider("google", state.googleApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Anthropic API key"
              value={state.anthropicApiKeyDraft}
              placeholder="sk-ant-..."
              status={keyStatus("anthropic")}
              testStatus={state.providerConnectionTests.anthropic.status}
              testMessage={state.providerConnectionTests.anthropic.message}
              testMessageId="anthropic"
              onInput={(value) => updateSavedPreference(() => store.setAnthropicApiKeyDraft(value))}
              onTest={() => handleTestProvider("anthropic", state.anthropicApiKeyDraft)}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="provider-brand" title="Active provider" description="Provider preference for new chat and model defaults.">
          <SegmentedControl
            ariaLabel="Active provider"
            value={state.providerBrand}
            options={[
              { value: "gpt", label: "GPT" },
              { value: "gemini", label: "Gemini" },
              { value: "claude", label: "Claude" }
            ]}
            onChange={(value) => updateSavedPreference(() => store.setProviderBrand(value))}
          />
        </PreferenceRow>
        <PreferenceRow id="composer-defaults" title="Composer defaults" description="Browser-local defaults for reasoning effort and fast mode.">
          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3).class}>
            <SegmentedControl
              ariaLabel="Reasoning effort"
              value={state.selectedReasoningStrength}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setSelectedReasoningStrength(value))}
            />
            {renderToggle(state.selectedFastMode, store.setSelectedFastMode, "Fast mode")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

