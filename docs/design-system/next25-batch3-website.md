# Website business settings: four tasks

One existing recursive owner, `website/src/client/commerce-fields.tsx`, renders
checkout approvals, delivery areas/days, discount eligibility and subscription
plans. The change improves that owner and its catalog consumers; it introduces
no token, preference, theme engine or general form framework.

| Task | Reproduction | Matching consumers / decision |
| --- | --- | --- |
| Checkout readiness | Native 13px checkbox amid enlarged copy; invalid values reported far from the field | `type="checkbox"`, `CheckboxField` search across Website, Harness and shared UI found the canonical form row already used by provider preferences. Reuse it for boolean and set-valued commerce fields. |
| Delivery areas | Rejected Enable could leave the native control checked while validated project remained disabled; nested summaries used raw native styling | All CommerceField booleans share rejection handling; rejected toggles now restore actual state and associate a local error. Nested records use existing Disclosure. ZIP, weekday IDs and fees keep existing commands. |
| Discount eligibility | “Discount amount (percent or cents)” forced a user to interpret 500 as $5; full product labels used tiny selection targets | Pricing `quote.ts` stores fixed and delivery discounts in cents, percentages as percent. The field owner displays both monetary types in dollars and preserves exact cents. Product/category/media/day sets share CheckboxField rows. |
| Subscription setup | Invalid bottle count stayed an unexplained draft while saved project remained valid | The same field error contract shows readable schema feedback, preserves draft/node/focus, clears after success and retains one-step Undo. Plans and policies use task disclosures and concise guidance. |

`CommerceChange` may return a readable rejection string; successful commands stay
host-owned. CommerceInspector preserves global error reporting and returns the
same rejection to the field. Thrown callback failures are also caught locally.
No invalid edit enters project history. Money conversion is display-only; storage,
quotes and command schemas are unchanged. These are project settings; disclosure
and rejected drafts are session-local. Existing inspector pane ownership is unchanged.

Server-rendered business workspace checkbox helpers were included in the search.
They belong to exported, independently themed applications, so this pass does not
copy Solid components into them. Their existing owner needs separate rendered
acceptance before any migration.

## Evidence and replay

```powershell
bun apps/engine-editor/website/scripts/batch3/capture.ts
bun test --conditions=browser apps/engine-editor/website/src/client/commerce-fields/business-settings.test.tsx apps/engine-editor/website/src/client/commerce-authoring.test.tsx
bun run --cwd apps/engine-editor website:typecheck
bun run --cwd apps/engine-editor website:build
```

[Before](../../.local/design-system/evidence/next25-batch3-website/before/report.json) and
[after](../../.local/design-system/evidence/next25-batch3-website/after/report.json) each cover four tasks at
1440, 820, 390 and 390px/200% root text. The narrow browser context has touch enabled.
After evidence adds actual approval toggles, rejection/recovery, weekday selection,
12th-product eligibility, decimal amount conversion and plan correction/Undo.
Errors have separate scrolled screenshots. These are real production fields in a
disposable command-backed session, not live checkout, payment or owner-service
acceptance. No user project, account or publication is written.

The runner owns a headless browser, checks actual Windows visibility and cleans up
in `finally`. Root text scaling is not native browser zoom. Previous phase images
are preserved; running `before` on edited source cannot reconstruct the baseline.

The focused Website and shared-selection suites pass 12 tests / 99 assertions. They preserve exact photo,
weekday and product IDs; whole-batch import; invalid rollback; both money types;
stable editing focus; checked-state rollback; associated errors and Undo.
External value changes, discount-unit changes and Undo clear stale local errors.
Shared SelectControl now accepts host-owned `invalid` and `describedBy`; rejected
choices preserve the accepted DOM value as well as the visible label.
Website TypeScript, production build and the full Website test command passed;
37 database tests were skipped without their PostgreSQL environment.

Remaining limits: very large eligibility catalogs still use a scrolling full list;
the current browser fixture contains 12 products. Native screen-reader speech,
real touch hardware and generated business-workspace forms remain separate work.
