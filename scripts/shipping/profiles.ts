const rootStep = (script: string) => ({ directory: ".", script });
const packageSteps = (directory: string, scripts: string[]) => scripts.map((script) => ({ directory, script }));
const policySteps = ["check:release-readiness", "check:process-policy"].map(rootStep);

export const profiles = {
  packages: {
    description: "Shared package types, isolated test lanes, and builds",
    documents: ["README.md", "docs/package-testing.md", "docs/distribution.md"],
    platforms: [],
    steps: [...policySteps, ...["typecheck:packages", "test:packages", "build:packages"].map(rootStep)],
    remainingAcceptance: [
      "Validate the changed package through its real application consumers and public exports; this profile does not smoke packed tarballs.",
      "Select the package and release artifact explicitly; shared packages do not have a single publication command.",
    ],
  },
  engine: {
    description: "Engine check including compatibility, examples, package smoke, and all tests",
    documents: ["packages/engine/readme.md", "packages/engine/docs/production-readiness.md", "docs/distribution.md"],
    platforms: [],
    steps: [...policySteps, ...packageSteps("packages/engine", ["check"])],
    remainingAcceptance: [
      "Run release:verify for benchmarks, installed package consumers, and WASM asset/hosting checks before public release.",
      "Run certify:package with release-specific evidence; automated checks do not establish production readiness or authorize publication.",
    ],
  },
  editor: {
    description: "Editor types, tests, and existing browser verification",
    documents: ["apps/engine-editor/README.md", "docs/distribution.md"],
    platforms: [],
    steps: [...policySteps, ...["typecheck:editor", "test:editor", "verify:editor", "verify:editor:system"].map(rootStep)],
    remainingAcceptance: [
      "Optional live AI providers need configured credentials and provider-specific acceptance; automated suggestions use deterministic fixtures.",
      "Website production delivery requires its own exported-app, security, database and recovery acceptance before publication.",
      "Review creative quality and any changed user journey beyond the enforced browser and delivered-artifact acceptance before publishing.",
    ],
  },
  harness: {
    description: "Harness types, tests, production UI, and installed npm candidate",
    documents: ["apps/harness/README.md", "docs/harness/coverage-matrix.md", "docs/distribution.md"],
    platforms: [],
    steps: [...policySteps, ...["typecheck:harness", "test:harness", "build:harness"].map(rootStep), ...packageSteps("apps/harness", ["package:npm"])],
    remainingAcceptance: [
      "Validate changed critical user journeys and failure recovery against the Harness coverage matrix.",
      "The Windows x64 npm candidate is installed and launched outside the checkout; publication and optional live providers require separate acceptance.",
      "Build, extract, and smoke the standalone Windows launcher zip through the tagged release workflow before publishing that separate artifact.",
    ],
  },
  "pad-pilot": {
    description: "Windows native tests, Release artifacts without host installation, and VST3 validators",
    documents: ["apps/pad-pilot/README.md", "docs/distribution.md"],
    platforms: ["win32"],
    steps: [...policySteps, ...packageSteps("apps/pad-pilot", ["typecheck", "test", "build:release", "validate:vst3"])],
    remainingAcceptance: [
      "Requires the documented Windows native toolchain and preinstalled pluginval/Steinberg validators; the gate never installs them.",
      "Complete measured FL Studio 2026/21 host acceptance and signed update staging separately; this profile does not install into or launch a DAW.",
    ],
  },
  marketplace: {
    description: "Marketplace service types and tests",
    documents: ["apps/pad-pilot-marketplace/README.md", "docs/distribution.md"],
    platforms: [],
    steps: [...policySteps, ...packageSteps("apps/pad-pilot-marketplace", ["typecheck", "test"])],
    remainingAcceptance: [
      "Configure production secrets, origins, billing, persistent SQLite/uploads, backups, and recovery using the service README.",
      "Deploy the verified artifact to the explicit Railway target with its persistent volume; verify pad-pilot.hyperfocus.info and real Hyperfocus sign-in. Enable commerce only after live Stripe acceptance; local checks use provider fixtures.",
      "Prepare and exercise the production artifact, cold-volume recovery and Docker/Linux deployment through the Marketplace owner before release.",
    ],
  },
};

export type ShippingTarget = keyof typeof profiles;
export type ShippingProfile = (typeof profiles)[ShippingTarget];
export type ShippingStep = ShippingProfile["steps"][number];

export function isShippingTarget(value: string): value is ShippingTarget {
  return Object.hasOwn(profiles, value);
}
