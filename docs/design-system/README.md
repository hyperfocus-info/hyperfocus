# Hyperfocus visual system

Start with the [visual constitution](visual-constitution.md). The first reference
is the Editor's Create / Open screen; it is an implementation candidate with
recorded browser evidence, not a claim of user approval.

## Choose a route

| Need | Owner |
| --- | --- |
| Contracts, preferences, parity, taste decisions | [Application standard](../../DESIGN.md) |
| Practitioner philosophy and current cross-codebase findings | [Design-engineer profile](design-engineer-profile.md); [2026-11-01 audit](audit-2026-11-01.md) |
| Concise copy, action priority, icons and home navigation | [Attention contract](../../DESIGN.md#respect-limited-attention); [research and audit](attention.md) |
| Navbar menus, settings views, keyboard/overlay behavior and form alignment | [Navigation and settings contract](navigation-settings.md); [executable checks](../../scripts/ui-attention/README.md) |
| App logos, social metadata, example authoring and reusable delivery tools | [Project authoring](project-authoring.md) |
| Shared tokens and controls | Foundation and control map below; [package API](../../packages/ui/README.md) |
| Width, density, overflow | [Responsive composition](responsive.md) |
| Ordinary implementation and visual verification | [app-ui-standard](../../.agents/skills/app-ui-standard/SKILL.md) |
| Game title, pause, rewards, settings and online lobbies | [Game-menu compositions](game-menus.md) |
| Tutorials, demonstrations and attempt feedback | [Tutorial composition contract](tutorials.md) |
| Free practice, dummy setup and optional training readouts | [Practice composition contract](practice.md) |
| Repeated surface/debt improvement | [design-system-evolution](../../.agents/skills/design-system-evolution/SKILL.md) |
| Human grading and versioned feedback | [Artifact review](../../scripts/artifact-review/README.md) |
| AI context injection and shared defaults | [AI context](agent-workflow.md) |
| Prior surface examples or regressions | [Evidence index](evidence-index.md); search for the affected surface |

## Foundation

Use `tokens` from `@hyperfocus/ui/tokens.stylex` and `typography` from
`@hyperfocus/ui`; compose type with local layout and semantic color. Defaults are
at a 16px root size; user scaling remains respected.

| Decision | Canonical values |
| --- | --- |
| Spacing | `space1/2/3/4/6/8/12/16`: 4/8/12/16/24/32/48/64px; existing compact-density overrides retained |
| Type roles | caption 12/400/1.4; metadata 12/400/1.5 with tabular numerals; body 14/400/1.5; emphasis 14/650/1.5; control 13/600/1.35; section 16/650/1.35; page 24/650/1.2; display 32/650/1.1 (size/weight/line-height) |
| Tracking | Page −.02em, display −.025em; normal elsewhere |
| Controls | compact 32px; standard 36px minimum; coarse pointer 44px |
| Geometry | existing radii 6/10/14px; controls use 6px; border 1px; icons 16/20px |
| Motion | fast 120ms, normal 180ms, major 280ms; reduced-motion override retained |
| Color | Existing canvas, panel, raised, overlay, foreground, muted, border/strong, accent/foreground, focus, selection, success, warning, danger/foreground, info, disabled, scrim roles retained |

No second palette was created. `stylex-entry.css` supplies the Hyperfocus dark and
light themes; CSS-property overrides are the existing project-theme boundary.
New typography, geometry, spacing, and motion variables have token fallbacks, so
hosts need not repeat them. Controls must not be restyled with literal colors.

## Canonical controls used here

| Primitive / source in `packages/ui/src` | Purpose and small supported API | Real consumers |
| --- | --- | --- |
| `primitives/button.tsx` | Primary, secondary, ghost, danger; small/medium/icon. Standard height, wrapping, focus, disabled, reduced motion. Host owns loading via disabled + aria-busy + a meaningful label. | Editor Project Home/Build, Harness provider rows/segmented choices, shared preferences |
| `form/form.tsx` | Input small/medium; FormField label/help/error; FormGrid intrinsic columns. Error state via `aria-invalid`; native user-invalid waits for interaction. | Project Home, Harness provider keys, character voice, inspector forms, showcase |
| `primitives/selection/select-control.tsx` | One selected value, descriptive list, keyboard navigation, bounded popup; search above eight options. sm/md share geometry tokens. | Project Home, preferences, editor selectors |
| `primitives/action-menu.tsx` | Commands with Arrow/Home/End, Escape, return focus, viewport-clamped popover; 44px touch rows. | Project Home files, editor resource menus, Harness job rows and bulk actions |
| `theme/typography.ts` | Eight semantic StyleX roles, not eight new components. | Button, form controls, Project Home, showcase |
| `composer/chat-composer.tsx` | Async selectors, caption labels, explicit reasoning label override, nonshrinking Send beside wrapping controls. | Editor and PadPilot AI panels; existing shared composer consumers |
| `preferences/preferences.tsx` | Searchable scopes, intrinsic rows, stable named controls, host-owned save error/reset description. | Editor shared appearance, workspace and project settings |

Keep existing tooltip, dialog, tabs, panels, and workbench contracts. This iteration
does not claim to have standardized every existing component. No new Panel,
Toolbar, Drawer, SplitPane, or generic action-layout API was needed.

Editor-local repetition now has three small owners; these are not public engine
APIs or a second component library:

| Local source under `apps/engine-editor/src/components` | Proven consumers |
| --- | --- |
| `scene3d/object-inspector-fields.tsx` | Object, material and light inspectors: stable numeric drafts, range/integer validation and named vector axes. |
| `scene3d/resource-browser.styles.ts` | 3D resources and Code files: searchable navigation with stable selection and reachable row commands. |
| `centers/build-center.styles.ts` | Build, History, Profile and Learn: readable task width, action groups, wrapping diagnostics and restrained disclosures. |

## Work on the next surface

Select the domain composition before shared controls or new markup; inspect
token/type roles before CSS values. Name the task and primary action, capture its baseline, change structure,
then verify real styles and keyboard paths. A showcase is a reference, not a
substitute for checking the consuming application. Preserve a repeated failure in
the browser validator before expanding guidance or abstraction.
