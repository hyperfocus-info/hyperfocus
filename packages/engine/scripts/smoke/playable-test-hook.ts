export type PlayableTestHook = {
  audioUnlocked?: () => boolean;
  diagnostics: Array<{ code?: string; severity?: string }>;
  frameCount: number;
  ready: boolean;
  rendererStats: {
    contextLost: boolean;
    drawCalls: number;
    instances: number;
    triangles: number;
  };
  renderMode: string;
  save(): void;
  snapshot(): { entities: Array<{ id: string; position: readonly number[] }> };
};

declare global {
  var __hyperfocusPlayable: PlayableTestHook | undefined;
}
