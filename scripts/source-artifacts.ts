// createSiteArchive copies these built entrypoints and the Railway setup template.
// Retained release archives are executable outputs; their authored owners remain
// under website/src and website/scripts. Other files in releases stay enforced.
const websiteCodeFiles: readonly string[] = ['deploy.js', 'migrate.js', 'site.js', 'demo.js', 'main.js', 'preview.js', 'backup.js', 'railway-setup.ts'];
export const WEBSITE_ARCHIVE_CODE_GLOB = `apps/engine-editor/website/examples/*/releases/*/site/{${websiteCodeFiles.join(',')}}`;

export function isWebsiteArchiveCode(filePath: string) {
  const match = /^apps\/engine-editor\/website\/examples\/[^/]+\/releases\/[^/]+\/site\/([^/]+)$/.exec(filePath);
  return match !== null && websiteCodeFiles.includes(match[1] ?? '');
}
