import type { MmoUiController } from "./core.ts"
import type { MmoUiLoginPayload } from "./model.ts"

export interface MmoUiLoginConfig {
  title?: string
  nameLabel?: string
  namePlaceholder?: string
  defaultName?: string
  submitLabel?: string
  hidden?: boolean
  message?: string
  onSubmit?: (payload: MmoUiLoginPayload) => void
}

export function renderMmoLogin(
  doc: Document,
  login: HTMLElement,
  config: MmoUiLoginConfig | false | undefined,
  controller: MmoUiController | undefined,
  emitLogin: (payload: MmoUiLoginPayload) => void
): void {
  if (config === false) {
    login.hidden = true
    login.replaceChildren()
    return
  }

  const loginConfig = config ?? {}
  login.hidden = controller ? !controller.getSnapshot().loginVisible : loginConfig.hidden ?? false
  const form = doc.createElement("form")
  form.className = "ce-mmo-login-form"
  const title = doc.createElement("div")
  title.className = "ce-mmo-login-title"
  title.textContent = loginConfig.title ?? "Enter realm"
  const label = doc.createElement("label")
  label.className = "ce-mmo-field"
  const labelText = doc.createElement("span")
  labelText.className = "ce-mmo-field-label"
  labelText.textContent = loginConfig.nameLabel ?? "Name"
  const input = doc.createElement("input")
  input.className = "ce-mmo-input"
  input.name = "playerName"
  input.type = "text"
  input.autocomplete = "name"
  input.placeholder = loginConfig.namePlaceholder ?? "Adventurer"
  input.value = loginConfig.defaultName ?? ""

  const submit = doc.createElement("button")
  submit.className = "ce-mmo-button ce-mmo-primary"
  submit.type = "submit"
  submit.textContent = loginConfig.submitLabel ?? "Join"
  const message = doc.createElement("div")
  message.className = "ce-mmo-login-message"
  message.textContent = loginConfig.message ?? ""

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const playerName = input.value.trim()
    if (!playerName) {
      message.textContent = "Name required"
      return
    }
    message.textContent = ""
    emitLogin({ playerName })
  })

  label.append(labelText, input)
  form.append(title, label, submit, message)
  login.replaceChildren(form)
}
