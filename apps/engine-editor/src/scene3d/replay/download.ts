/** A user-initiated local download; no recording is uploaded or written to project data. */
export async function downloadCombatReplay(options: import('./controller.ts').ReplayArchive) {
  const { encodeReplayArchive, replayContentType } = await import('@hyperfocus/touch-of-death/replay');
  const url = URL.createObjectURL(new Blob([encodeReplayArchive({ value: options })], { type: replayContentType }));
  const link = document.createElement('a');link.href = url;link.download = `touch-of-death-${new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')}.pb`;
  document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
