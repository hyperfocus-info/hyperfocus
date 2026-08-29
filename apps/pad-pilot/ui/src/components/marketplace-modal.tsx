import { For, Show, createMemo } from "solid-js";
import { Button } from "./elements/button";
import { CheckboxField } from "./elements/checkbox-field";
import { useMarketplaceStore } from "../state/marketplace-store";
import { Modal } from "./elements/modal";
import { PadPilot } from "../padpilot/index";
import { TextAreaField } from "./elements/text-area-field";
import { TextField } from "./elements/text-field";
import styles from "./marketplace-modal.module.css";

const formatPrice = (priceCents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(priceCents / 100);

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "Not published");
const formatFileSize = (value: number | null) => (value == null ? "Unavailable" : `${(value / 1024).toFixed(1)} KB`);

export function MarketplaceModal() {
  const { state, actions } = useMarketplaceStore();
  const filteredCatalog = createMemo(() => {
    const query = state.browseQuery.trim().toLowerCase();
    if (!query) {
      return state.catalog;
    }

    return state.catalog.filter(
      (moduleItem) =>
        moduleItem.name.toLowerCase().includes(query) ||
        moduleItem.owner.toLowerCase().includes(query) ||
        moduleItem.description.toLowerCase().includes(query),
    );
  });
  const selectedDetail = createMemo(() => (state.selectedModuleId ? state.details[state.selectedModuleId] : undefined));

  return (
    <Modal
      closeOnBackdrop
      description="Browse, inspect, upload, and download PadPilot module bundles from the browser dev shell."
      onClose={actions.closeMarketplace}
      open={state.isMarketplaceOpen}
      size="lg"
      title="Marketplace"
    >
      <div class={styles["marketplace-layout"]}>
        <aside class={styles["marketplace-sidebar"]}>
          <div class={styles["marketplace-actions"]}>
            <Button
              class={styles["marketplace-tab"]}
              variant={state.view === "browse" ? "primary" : "secondary"}
              classList={{ [styles["is-active"]]: state.view === "browse" }}
              onClick={actions.setBrowseView}
            >
              Browse catalog
            </Button>
            <Button
              class={styles["marketplace-tab"]}
              variant={state.view === "upload" ? "primary" : "secondary"}
              classList={{ [styles["is-active"]]: state.view === "upload" }}
              onClick={actions.setUploadView}
            >
              Prepare upload
            </Button>
          </div>

          <div class={styles["marketplace-auth"]}>
            <h4 class={styles["marketplace-auth-title"]}>Account</h4>
            <Show
              when={state.auth.authenticated}
              fallback={
                <>
                  <p class={styles["marketplace-auth-copy"]}>
                    <Show
                      when={state.auth.configured.clerk}
                      fallback="Clerk is not configured for this environment, so uploads are unavailable."
                    >
                      Sign in with Clerk to upload or manage your module bundles.
                    </Show>
                  </p>
                  <Show when={state.auth.configured.clerk}>
                    <Button type="button" variant="primary" class={`${styles["marketplace-cta"]} ${styles["is-primary"]}`} onClick={actions.signIn}>
                      Sign in
                    </Button>
                  </Show>
                </>
              }
            >
              <p class={styles["marketplace-auth-copy"]}>{state.auth.user?.displayName ?? state.auth.user?.email ?? "Signed in"}</p>
              <p class={styles["marketplace-muted"]}>{state.auth.user?.email ?? state.auth.user?.username ?? "Marketplace session active"}</p>
              <p class={styles["marketplace-muted"]}>Status: {state.auth.subscriptionStatus}</p>
              <p class={styles["marketplace-muted"]}>Pilot Tokens: {state.auth.pilotTokenBalance}</p>
              <Show when={state.auth.entitlements.padpilotAccess}>
                <p class={styles["marketplace-muted"]}>
                  Lifetime progress: ${((state.auth.entitlements.padpilotAccess?.amountPaidCents ?? 0) / 100).toFixed(2)} paid /
                  ${((state.auth.entitlements.padpilotAccess?.lifetimePriceCents ?? 0) / 100).toFixed(2)}
                </p>
              </Show>
              <Show when={state.auth.entitlements.firstClass}>
                <p class={styles["marketplace-muted"]}>
                  First Class: {state.auth.entitlements.firstClass?.status} ({state.auth.entitlements.firstClass?.discountPercent}% off)
                </p>
              </Show>
              <Button type="button" variant="ghost" class={styles["marketplace-inline-button"]} onClick={actions.signOut}>
                Sign out
              </Button>
            </Show>
            <div class={styles["marketplace-updater"]}>
              <h4 class={styles["marketplace-auth-title"]}>Updater</h4>
              <p class={styles["marketplace-muted"]}>Installed version: {state.updater.currentVersion}</p>
              <p class={styles["marketplace-muted"]}>Channel: {state.updater.channel}</p>
              <p class={styles["marketplace-muted"]}>Status: {state.updater.checkStatus}</p>
              <Show when={state.updater.availableRelease?.latestVersion}>
                <p class={styles["marketplace-muted"]}>Latest: {state.updater.availableRelease?.latestVersion}</p>
              </Show>
              <div class={styles["marketplace-cta-row"]}>
                <Button
                  type="button"
                  variant="secondary"
                  class={styles["marketplace-list-action"]}
                  onClick={() => actions.setUpdateChannel(state.updater.channel === "stable" ? "beta" : "stable")}
                >
                  Switch to {state.updater.channel === "stable" ? "beta" : "stable"}
                </Button>
                <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} onClick={() => actions.checkForUpdates({ openModalOnAvailable: true })}>
                  Check for updates
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <section class={styles["marketplace-panel"]}>
          <p class={styles["marketplace-status"]}>{state.requestStatus.message ?? ""}</p>

          <Show when={state.view === "browse"}>
            <h3 class={styles["marketplace-panel-title"]}>Catalog</h3>
            <TextField
              class={styles["marketplace-filter"]}
              type="text"
              placeholder="Search modules or owners"
              value={state.browseQuery}
              onInput={(event) => actions.setBrowseQuery(event.currentTarget.value)}
            />
            <Show
              when={filteredCatalog().length > 0}
              fallback={<div class={styles["marketplace-empty"]}>No modules are available in the catalog yet.</div>}
            >
              <div class={styles["marketplace-list"]}>
                <For each={filteredCatalog()}>
                  {(moduleItem) => (
                    <article class={styles["marketplace-list-card"]}>
                      <div class={styles["marketplace-list-copy"]}>
                        <div class={styles["marketplace-list-header"]}>
                          <span class={styles["marketplace-module-name"]}>{moduleItem.name}</span>
                          <span class={styles["marketplace-badge"]}>{moduleItem.visibility}</span>
                        </div>
                        <p class={styles["marketplace-muted"]}>{moduleItem.description || "No description provided yet."}</p>
                        <div class={styles["marketplace-list-meta"]}>
                          <span class={styles["marketplace-meta-value"]}>Owner: {moduleItem.owner}</span>
                          <span class={styles["marketplace-meta-value"]}>
                            Price: {formatPrice(moduleItem.priceCents, moduleItem.currency)}
                          </span>
                          <span class={styles["marketplace-meta-value"]}>
                            Latest version: {moduleItem.latestVersion?.version ?? "No published version"}
                          </span>
                        </div>
                      </div>
                      <div class={styles["marketplace-list-actions"]}>
                        <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} onClick={() => actions.viewModule(moduleItem.id)}>
                          View
                        </Button>
                        <Show when={moduleItem.priceCents > 0 && !moduleItem.canDownload}>
                          <Button
                            type="button"
                            variant="primary"
                            class={styles["marketplace-list-action"]}
                            disabled={!state.auth.authenticated || state.checkoutKey !== null}
                            onClick={() => actions.purchaseModule(moduleItem.id)}
                          >
                            {state.checkoutKey === moduleItem.id
                              ? "Opening checkout..."
                              : state.auth.authenticated
                                ? `Buy ${formatPrice(moduleItem.priceCents, moduleItem.currency)}`
                                : "Sign in to buy"}
                          </Button>
                        </Show>
                        <Button
                          type="button"
                          variant="secondary"
                          class={styles["marketplace-list-action"]}
                          disabled={!moduleItem.canDownload}
                          onClick={() => actions.downloadModule(moduleItem.downloadUrl)}
                        >
                          Download
                        </Button>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <Show when={state.view === "details"}>
            <Show
              when={selectedDetail()}
              fallback={<div class={styles["marketplace-empty"]}>Select a module from the catalog to inspect its details.</div>}
            >
              {(detail) => (
                <>
                  <Button type="button" variant="ghost" class={styles["marketplace-inline-button"]} onClick={actions.setBrowseView}>
                    Back to catalog
                  </Button>
                  <section class={styles["marketplace-detail-card"]}>
                    <h3 class={styles["marketplace-panel-title"]}>{detail().name}</h3>
                    <p class={styles["marketplace-muted"]}>{detail().description || "No description provided yet."}</p>
                    <div class={styles["marketplace-detail-grid"]}>
                      <div class={styles["marketplace-meta-row"]}>
                        <span class={styles["marketplace-meta-label"]}>Owner</span>
                        <span class={styles["marketplace-meta-value"]}>{detail().owner}</span>
                      </div>
                      <div class={styles["marketplace-meta-row"]}>
                        <span class={styles["marketplace-meta-label"]}>Visibility</span>
                        <span class={styles["marketplace-meta-value"]}>{detail().visibility}</span>
                      </div>
                      <div class={styles["marketplace-meta-row"]}>
                        <span class={styles["marketplace-meta-label"]}>Price</span>
                        <span class={styles["marketplace-meta-value"]}>{formatPrice(detail().priceCents, detail().currency)}</span>
                      </div>
                    </div>
                    <Show
                      when={detail().priceCents > 0 && !detail().actions.canDownload && !detail().isOwner}
                      fallback={
                        <Button
                          type="button"
                          variant="primary"
                          class={`${styles["marketplace-cta"]} ${styles["is-primary"]}`}
                          disabled={!detail().actions.canDownload}
                          onClick={actions.downloadSelectedModule}
                        >
                          Download module bundle
                        </Button>
                      }
                    >
                      <Button
                        type="button"
                        variant="primary"
                        class={`${styles["marketplace-cta"]} ${styles["is-primary"]}`}
                        disabled={!state.auth.authenticated || state.checkoutKey !== null}
                        onClick={() => actions.purchaseModule(detail().id)}
                      >
                        {state.checkoutKey === detail().id
                          ? "Opening checkout..."
                          : state.auth.authenticated
                            ? `Buy module for ${formatPrice(detail().priceCents, detail().currency)}`
                            : "Sign in to buy module"}
                      </Button>
                    </Show>
                  </section>

                  <section class={styles["marketplace-version-card"]}>
                    <h4 class={styles["marketplace-version-title"]}>Published version</h4>
                    <p class={styles["marketplace-version-meta"]}>
                      Version: {detail().latestPublishedVersion?.version ?? "None"} | Published:{" "}
                      {formatDate(detail().latestPublishedVersion?.publishedAt ?? null)} | Size:{" "}
                      {formatFileSize(detail().latestPublishedVersion?.fileSizeBytes ?? null)}
                    </p>
                    <Show when={detail().isOwner && detail().latestAccessibleVersion}>
                      <p class={styles["marketplace-version-meta"]}>
                        Latest owner build: {detail().latestAccessibleVersion?.version} ({detail().latestAccessibleVersion?.status})
                      </p>
                    </Show>
                  </section>
                </>
              )}
            </Show>
          </Show>

          <Show when={state.view === "upload"}>
            <section class={styles["marketplace-form"]}>
              <h3 class={styles["marketplace-panel-title"]}>Upload module</h3>
              <p class={styles["marketplace-muted"]}>
                Create a marketplace record, upload a `.zip` bundle, and optionally publish it immediately.
              </p>
              <div class={styles["marketplace-form-grid"]}>
                <TextField
                  class={styles["marketplace-field"]}
                  label="Name"
                  type="text"
                  value={state.uploadDraft.name}
                  onInput={(event) => actions.setUploadDraft({ name: event.currentTarget.value })}
                />
                <TextField
                  class={styles["marketplace-field"]}
                  label="Slug"
                  type="text"
                  value={state.uploadDraft.slug}
                  onInput={(event) => actions.setUploadDraft({ slug: event.currentTarget.value })}
                />
                <TextField
                  class={styles["marketplace-field"]}
                  label="Version"
                  type="text"
                  value={state.uploadDraft.version}
                  onInput={(event) => actions.setUploadDraft({ version: event.currentTarget.value })}
                />
                <TextField
                  class={styles["marketplace-field"]}
                  label="Price (cents)"
                  type="number"
                  min="0"
                  value={state.uploadDraft.priceCents}
                  onInput={(event) => actions.setUploadDraft({ priceCents: event.currentTarget.value })}
                />
                <TextAreaField
                  class={`${styles["marketplace-field"]} ${styles["is-full"]}`}
                  label="Description"
                  value={state.uploadDraft.description}
                  onInput={(event) => actions.setUploadDraft({ description: event.currentTarget.value })}
                />
                <TextAreaField
                  class={`${styles["marketplace-field"]} ${styles["is-full"]}`}
                  label="Changelog"
                  value={state.uploadDraft.changelog}
                  onInput={(event) => actions.setUploadDraft({ changelog: event.currentTarget.value })}
                />
                <div class={`${styles["marketplace-field"]} ${styles["is-full"]}`}>
                  <span class={styles["marketplace-label"]}>Module bundle (.zip)</span>
                  <PadPilot.FileUploadDropzone
                    accept=".zip,application/zip"
                    class={styles["marketplace-input"]}
                    hint={state.uploadDraft.bundle?.name ?? "Drop bundle or click to browse"}
                    onFilesSelected={(files: File[]) => actions.setUploadDraft({ bundle: files[0] ?? null })}
                  />
                </div>
              </div>
              <CheckboxField
                checked={state.uploadDraft.publish}
                label="Publish immediately after upload"
                onChange={(event) => actions.setUploadDraft({ publish: event.currentTarget.checked })}
              />
              <div class={styles["marketplace-cta-row"]}>
                <Button
                  type="button"
                  variant="primary"
                  class={`${styles["marketplace-cta"]} ${styles["is-primary"]}`}
                  disabled={state.requestStatus.upload === "loading"}
                  onClick={actions.uploadModule}
                >
                  Create and upload
                </Button>
                <Show when={!state.auth.authenticated && state.auth.configured.clerk}>
                  <Button type="button" variant="ghost" class={styles["marketplace-inline-button"]} onClick={actions.signIn}>
                    Sign in first
                  </Button>
                </Show>
              </div>
            </section>
          </Show>
          <Show when={state.auth.authenticated}>
            <section class={styles["marketplace-version-card"]}>
              <h4 class={styles["marketplace-version-title"]}>Membership</h4>
              <div class={styles["marketplace-cta-row"]}>
                <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} disabled={state.requestStatus.auth === "loading" || state.checkoutKey !== null} onClick={() => actions.startCheckout("first_class_start")}>
                  Start First Class
                </Button>
                <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} disabled={state.requestStatus.auth === "loading" || state.checkoutKey !== null} onClick={() => actions.startCheckout("padpilot_financing_start")}>
                  Start lifetime financing
                </Button>
                <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} disabled={state.requestStatus.auth === "loading" || state.checkoutKey !== null} onClick={() => actions.startCheckout("padpilot_lifetime_outright")}>
                  Buy lifetime
                </Button>
                <Show when={state.auth.entitlements.padpilotAccess?.canBuyout}>
                  <Button type="button" variant="secondary" class={styles["marketplace-list-action"]} disabled={state.requestStatus.auth === "loading" || state.checkoutKey !== null} onClick={() => actions.startCheckout("padpilot_lifetime_buyout")}>
                    Buy out remaining balance
                  </Button>
                </Show>
              </div>
            </section>
          </Show>
        </section>
      </div>
    </Modal>
  );
}
