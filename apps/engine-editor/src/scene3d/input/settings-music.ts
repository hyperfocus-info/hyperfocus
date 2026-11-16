export type SettingsMusicOptions = {
  snapshot: () => { playlistId?: string; loading?: boolean; status?: 'idle' | 'loading' | 'playing' | 'paused' | 'error'; retryAt?: number; track?: { assetId: string } } | undefined;
  next: () => Promise<void>;
  retry?: () => Promise<void>;
  title: (assetId: string) => string;
};

export function createSettingsMusic(options: SettingsMusicOptions & { parent: HTMLElement }) {
  const row = document.createElement('div'), nowPlaying = document.createElement('p'), next = document.createElement('button');
  row.dataset.musicControls = '';nowPlaying.dataset.musicNowPlaying = '';nowPlaying.setAttribute('role', 'status');nowPlaying.setAttribute('aria-live', 'polite');next.textContent = 'Next song';next.type = 'button';
  row.append(nowPlaying, next);options.parent.prepend(row);
  let busy = false, failed = false;
  function refresh() {
    const state = options.snapshot();
    row.hidden = !state?.playlistId;
    const unavailable = failed || state?.status === 'error';
    const loading = busy || state?.loading === true || state?.status === 'loading';
    const label = unavailable ? 'Music unavailable. Retry to play this queue.' : loading ? 'Loading music…' : state?.track ? `${state.playlistId === 'lobby' ? 'Lobby' : 'In game'} · ${options.title(state.track.assetId)}` : 'Music is ready to play.';
    if (nowPlaying.textContent !== label) nowPlaying.textContent = label;
    next.textContent = unavailable ? 'Retry music' : 'Next song';
    next.disabled = loading || !unavailable && !state?.track;
  }
  next.onclick = async () => {
    const retrying = failed || options.snapshot()?.status === 'error';
    busy = true;failed = false;refresh();
    try { await (retrying && options.retry ? options.retry() : options.next()); }
    catch { failed = true; }
    finally { busy = false;refresh(); }
  };
  refresh();return { refresh };
}
