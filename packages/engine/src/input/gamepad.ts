export const GAMEPAD_AXIS_DEADZONE = 0.15;

const buttonAliases = new Map([
  ["a", 0],
  ["cross", 0],
  ["b", 1],
  ["circle", 1],
  ["x", 2],
  ["square", 2],
  ["y", 3],
  ["triangle", 3],
  ["leftbumper", 4],
  ["l1", 4],
  ["lb", 4],
  ["rightbumper", 5],
  ["r1", 5],
  ["rb", 5],
  ["lefttrigger", 6],
  ["l2", 6],
  ["lt", 6],
  ["righttrigger", 7],
  ["r2", 7],
  ["rt", 7],
  ["back", 8],
  ["select", 8],
  ["share", 8],
  ["start", 9],
  ["options", 9],
  ["leftstick", 10],
  ["ls", 10],
  ["rightstick", 11],
  ["rs", 11],
  ["dpadup", 12],
  ["up", 12],
  ["dpaddown", 13],
  ["down", 13],
  ["dpadleft", 14],
  ["left", 14],
  ["dpadright", 15],
  ["right", 15],
  ["home", 16],
  ["guide", 16],
  ["ps", 16],
  ["touchpad", 17],
  ["paddle1", 20],
  ["paddle2", 21],
  ["paddle3", 22],
  ["paddle4", 23]
]);

const axisAliases = new Map([
  ["leftx", 0],
  ["lx", 0],
  ["leftstickx", 0],
  ["lefty", 1],
  ["ly", 1],
  ["leftsticky", 1],
  ["rightx", 2],
  ["rx", 2],
  ["rightstickx", 2],
  ["righty", 3],
  ["ry", 3],
  ["rightsticky", 3]
]);

type GamepadButton = number | string;
type GamepadAxis = number | string;
type GamepadSource = Pick<Navigator, "getGamepads">;

export type GamepadActionButtonLike = {
  pressed?: boolean;
  value?: number;
};

export type GamepadActionGamepadLike = {
  axes: readonly unknown[];
  buttons: readonly GamepadActionButtonLike[];
  connected?: boolean | null;
  id?: string;
  index?: number;
};

export type GamepadActionVector = {
  dx: number;
  dy: number;
};

export type GamepadActionFrame = {
  keys: Set<string>;
  buttons: Set<number>;
  movement: GamepadActionVector;
  aimOffset?: { x: number; y: number };
  active: boolean;
};

export type GamepadActionButtonBinding = {
  button: GamepadButton;
  key: string;
};

export type GamepadActionFrameOptions = {
  deadzone?: number;
  movementDeadzone?: number;
  aimDeadzone?: number;
};

export type GamepadActionFrameMapperConfig = {
  buttonBindings?: readonly GamepadActionButtonBinding[];
  movementAxes?: readonly [x: number, y: number];
  aimAxes?: readonly [x: number, y: number];
  aimRadius?: number;
  defaultDeadzone?: number;
  defaultMovementDeadzone?: number;
  defaultAimDeadzone?: number;
  maxDeadzone?: number;
  buttonPressThreshold?: number;
  activeEpsilon?: number;
};

export type GamepadActionFrameMapper = {
  normalizeDeadzone(value: unknown, fallback?: number): number;
  map(gamepad: GamepadActionGamepadLike | undefined, options?: GamepadActionFrameOptions): GamepadActionFrame;
  aimOffset(frame: Pick<GamepadActionFrame, "aimOffset" | "movement">): { x: number; y: number } | undefined;
};

export type GamepadSessionSnapshot = {
  gamepad: GamepadActionGamepadLike | undefined;
  frame: GamepadActionFrame;
  pressedButtons: ReadonlySet<number>;
  releasedButtons: ReadonlySet<number>;
  justConnected: boolean;
  justDisconnected: boolean;
};

export type GamepadSessionOptions = {
  mapper?: GamepadActionFrameMapper;
  mapperConfig?: GamepadActionFrameMapperConfig;
  source?: () => ArrayLike<GamepadActionGamepadLike | null>;
};

let currentPads: Gamepad[] = [];
let previousPads: Gamepad[] = [];
let sampled = false;
let navigatorSource: GamepadSource | null =
  typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator : null;

function normalizeName(name: string) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveButton(button: GamepadButton) {
  if (typeof button === "number") return button;
  return buttonAliases.get(normalizeName(button));
}

function resolveAxis(axis: GamepadAxis) {
  if (typeof axis === "number") return axis;
  return axisAliases.get(normalizeName(axis));
}

function buttonDown(pad: Gamepad | null, button: GamepadButton) {
  const resolved = resolveButton(button);
  return resolved == null ? false : pad?.buttons[resolved]?.pressed === true;
}

function axisDown(pad: Gamepad | null, axis: GamepadAxis) {
  const resolved = resolveAxis(axis);
  if (resolved == null) return 0;
  const value = pad?.axes[resolved] ?? 0;
  return Math.abs(value) < GAMEPAD_AXIS_DEADZONE ? 0 : value;
}

function clampActionAxis(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function rawActionAxis(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? clampActionAxis(value) : 0;
}

function actionButtonPressed(button: GamepadActionButtonLike | undefined, threshold: number) {
  return Boolean(button?.pressed) || (button?.value ?? 0) >= threshold;
}

function actionVectorActive(vector: GamepadActionVector, epsilon: number) {
  return Math.hypot(vector.dx, vector.dy) > epsilon;
}

function finiteConfigNumber(value: number, label: string, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function axisPair(value: readonly [number, number], label: string): readonly [number, number] {
  for (const axis of value) {
    if (!Number.isSafeInteger(axis) || axis < 0) throw new RangeError(`${label} axes must be non-negative safe integers`);
  }
  return value;
}

function normalizeGamepadStick(x: unknown, y: unknown, deadzone: number): GamepadActionVector {
  const rawX = rawActionAxis(x);
  const rawY = rawActionAxis(y);
  const magnitude = Math.min(1, Math.hypot(rawX, rawY));
  if (magnitude <= deadzone) return { dx: 0, dy: 0 };
  const scaled = (magnitude - deadzone) / (1 - deadzone);
  return { dx: (rawX / magnitude) * scaled, dy: (rawY / magnitude) * scaled };
}

export function createGamepadActionFrameMapper(config: GamepadActionFrameMapperConfig = {}): GamepadActionFrameMapper {
  const buttonBindings = config.buttonBindings ?? [];
  const movementAxes = axisPair(config.movementAxes ?? [0, 1], "movement");
  const aimAxes = axisPair(config.aimAxes ?? [2, 3], "aim");
  const aimRadius = finiteConfigNumber(config.aimRadius ?? 1, "aimRadius", 0);
  const maxDeadzone = finiteConfigNumber(config.maxDeadzone ?? 0.5, "maxDeadzone", 0, 0.999);
  const defaultDeadzone = typeof config.defaultDeadzone === "number" && Number.isFinite(config.defaultDeadzone)
    ? Math.max(0, Math.min(maxDeadzone, config.defaultDeadzone))
    : Math.min(GAMEPAD_AXIS_DEADZONE, maxDeadzone);
  const defaultMovementDeadzone = normalizeDefaultDeadzone(config.defaultMovementDeadzone, defaultDeadzone, maxDeadzone);
  const defaultAimDeadzone = normalizeDefaultDeadzone(config.defaultAimDeadzone, defaultDeadzone, maxDeadzone);
  const buttonPressThreshold = finiteConfigNumber(config.buttonPressThreshold ?? 0.45, "buttonPressThreshold", 0, 1);
  const activeEpsilon = finiteConfigNumber(config.activeEpsilon ?? 0.001, "activeEpsilon", 0);

  function normalizeDeadzone(value: unknown, fallback = defaultDeadzone) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(maxDeadzone, value))
      : fallback;
  }

  function aimOffset(frame: Pick<GamepadActionFrame, "aimOffset" | "movement">) {
    if (frame.aimOffset) return frame.aimOffset;
    const length = Math.hypot(frame.movement.dx, frame.movement.dy);
    if (length <= activeEpsilon) return undefined;
    return { x: (frame.movement.dx / length) * aimRadius, y: (frame.movement.dy / length) * aimRadius };
  }

  return {
    normalizeDeadzone,
    aimOffset,
    map(gamepad, options = {}) {
      const keys = new Set<string>();
      const buttons = new Set<number>();
      const empty = { dx: 0, dy: 0 };
      if (!gamepad || gamepad.connected === false) return { keys, buttons, movement: empty, active: false };

      for (let index = 0; index < gamepad.buttons.length; index += 1) {
        if (actionButtonPressed(gamepad.buttons[index], buttonPressThreshold)) buttons.add(index);
      }
      for (const binding of buttonBindings) {
        const resolved = resolveButton(binding.button);
        if (resolved !== undefined && buttons.has(resolved)) keys.add(binding.key);
      }

      const movementDeadzone = normalizeDeadzone(options.movementDeadzone ?? options.deadzone, defaultMovementDeadzone);
      const aimDeadzone = normalizeDeadzone(options.aimDeadzone ?? options.deadzone, defaultAimDeadzone);
      const movement = normalizeGamepadStick(gamepad.axes[movementAxes[0]], gamepad.axes[movementAxes[1]], movementDeadzone);
      const aim = normalizeGamepadStick(gamepad.axes[aimAxes[0]], gamepad.axes[aimAxes[1]], aimDeadzone);
      const frameAimOffset = actionVectorActive(aim, activeEpsilon) ? { x: aim.dx * aimRadius, y: aim.dy * aimRadius } : undefined;
      return {
        keys,
        buttons,
        movement,
        aimOffset: frameAimOffset,
        active: keys.size > 0 || buttons.size > 0 || actionVectorActive(movement, activeEpsilon) || Boolean(frameAimOffset)
      };
    }
  };
}

/** Stateful primary-pad selection and button-edge tracking for frame-driven clients. */
export function createGamepadSession(options: GamepadSessionOptions = {}) {
  const mapper = options.mapper ?? createGamepadActionFrameMapper(options.mapperConfig);
  const source: () => ArrayLike<GamepadActionGamepadLike | null> = options.source
    ?? (() => typeof navigator === "undefined" || !navigator.getGamepads ? [] : navigator.getGamepads());
  let selectedIndex: number | undefined;
  let previousButtons = new Set<number>();
  let connected = false;
  const pressedButtons = new Set<number>();
  const releasedButtons = new Set<number>();

  function selectGamepad(): GamepadActionGamepadLike | undefined {
    const pads = source();
    if (selectedIndex !== undefined) {
      const selected = pads[selectedIndex];
      if (selected && selected.connected !== false) return selected;
    }
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (!pad || pad.connected === false) continue;
      selectedIndex = typeof pad.index === "number" ? pad.index : index;
      return pad;
    }
    selectedIndex = undefined;
    return undefined;
  }

  return {
    poll(frameOptions: GamepadActionFrameOptions = {}): GamepadSessionSnapshot {
      const gamepad = selectGamepad();
      const frame = mapper.map(gamepad, frameOptions);
      pressedButtons.clear();
      releasedButtons.clear();
      for (const button of frame.buttons) if (!previousButtons.has(button)) pressedButtons.add(button);
      for (const button of previousButtons) if (!frame.buttons.has(button)) releasedButtons.add(button);
      const wasConnected = connected;
      connected = Boolean(gamepad);
      previousButtons = new Set(frame.buttons);
      return {
        gamepad,
        frame,
        pressedButtons,
        releasedButtons,
        justConnected: connected && !wasConnected,
        justDisconnected: !connected && wasConnected,
      };
    },
    reset() {
      selectedIndex = undefined;
      previousButtons.clear();
      pressedButtons.clear();
      releasedButtons.clear();
      connected = false;
    },
    mapper,
  };
}

function normalizeDefaultDeadzone(value: number | undefined, fallback: number, maxDeadzone: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(maxDeadzone, value))
    : fallback;
}

function sampleGamepads() {
  previousPads = currentPads;

  if (!navigatorSource) {
    currentPads = [];
    sampled = true;
    return;
  }

  const snapshot = navigatorSource.getGamepads();
  const nextPads: Gamepad[] = [];

  for (const pad of snapshot) {
    if (!pad || !pad.connected) continue;
    nextPads[pad.index] = pad;
  }

  currentPads = nextPads;
  sampled = true;
}

function ensureSampled() {
  if (!sampled) sampleGamepads();
}

export function updateGamepads() {
  sampleGamepads();
}

export type GamepadPollerOptions = {
  intervalMs?: number;
  onPoll?: (sampledAt: number) => void;
  now?: () => number;
  schedule?: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  cancel?: (handle: ReturnType<typeof setInterval>) => void;
};

/** Polls gamepads independently from requestAnimationFrame rendering. */
export function createGamepadPoller(options: GamepadPollerOptions = {}) {
  const intervalMs = options.intervalMs ?? 1000 / 120;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError("gamepad polling intervalMs must be positive and finite");
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? ((callback, delay) => setInterval(callback, delay));
  const cancel = options.cancel ?? ((handle) => clearInterval(handle));
  let handle: ReturnType<typeof setInterval> | undefined;

  function poll() {
    const sampledAt = now();
    if (!Number.isFinite(sampledAt)) throw new RangeError("gamepad polling clock must be finite");
    updateGamepads();
    options.onPoll?.(sampledAt);
  }

  return {
    poll,
    start() {
      if (handle !== undefined) return;
      poll();
      handle = schedule(poll, intervalMs);
    },
    stop() {
      if (handle === undefined) return;
      cancel(handle);
      handle = undefined;
    },
    isRunning() { return handle !== undefined; },
    intervalMs,
  };
}

export function getGamepads() {
  ensureSampled();
  return currentPads.filter(Boolean);
}

export function getGamepad(index: number) {
  ensureSampled();
  return currentPads[index] ?? null;
}

export function isGamepadButtonDown(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button));
}

export function isGamepadButtonPressed(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button) && !buttonDown(previousPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button) && !buttonDown(previousPads[pad.index] ?? null, button));
}

export function isGamepadButtonReleased(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(previousPads[index] ?? null, button) && !buttonDown(currentPads[index] ?? null, button);
  return previousPads.some((pad) => buttonDown(pad, button) && !buttonDown(currentPads[pad.index] ?? null, button));
}

export function getGamepadAxis(axis: GamepadAxis, index?: number) {
  ensureSampled();
  if (typeof index === "number") return axisDown(currentPads[index] ?? null, axis);
  for (const pad of currentPads) {
    const value = axisDown(pad, axis);
    if (value !== 0) return value;
  }
  return 0;
}

export function __setGamepadNavigatorForTests(source: GamepadSource | null) {
  navigatorSource = source;
  currentPads = [];
  previousPads = [];
  sampled = false;
}
