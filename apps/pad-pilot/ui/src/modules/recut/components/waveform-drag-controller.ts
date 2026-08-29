export type WaveformMarkerDragMove = {
  clientX: number;
  snapToTransient: boolean;
};

type WaveformMarkerDragSessionOptions = {
  cancelTimer: (handle: number) => void;
  delayMs?: number;
  onActivate: () => void;
  onDeactivate: () => void;
  onMove: (move: WaveformMarkerDragMove) => void;
  scheduleTimer: (callback: () => void, delayMs: number) => number;
  startAltKey: boolean;
};

type WaveformMarkerPointerMove = {
  altKey: boolean;
  clientX: number;
};

export function createWaveformMarkerDragSession(options: WaveformMarkerDragSessionOptions) {
  let active = false;
  let ready = false;
  const activationHandle = options.scheduleTimer(() => {
    ready = true;
  }, options.delayMs ?? 250);

  return {
    dispose() {
      options.cancelTimer(activationHandle);
      if (!active) {
        return;
      }
      active = false;
      options.onDeactivate();
    },
    handleMove(moveEvent: WaveformMarkerPointerMove) {
      if (!ready) {
        return;
      }
      if (!active) {
        active = true;
        options.onActivate();
      }
      options.onMove({
        clientX: moveEvent.clientX,
        snapToTransient: !(options.startAltKey || moveEvent.altKey),
      });
    },
  };
}
