export type GamepadFixtureOptions = {
  index: number;
  buttons: readonly boolean[];
  axes?: readonly number[];
  connected?: boolean;
  id?: string;
};

function isGamepadButtonFixture(value: unknown): value is GamepadButton {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "pressed") === "boolean"
    && typeof Reflect.get(value, "touched") === "boolean"
    && typeof Reflect.get(value, "value") === "number";
}

function isGamepadFixture(value: unknown): value is Gamepad {
  if (typeof value !== "object" || value === null) return false;
  const axes = Reflect.get(value, "axes");
  const buttons = Reflect.get(value, "buttons");
  return Array.isArray(axes) && axes.every((axis) => typeof axis === "number")
    && Array.isArray(buttons) && buttons.every(isGamepadButtonFixture)
    && typeof Reflect.get(value, "connected") === "boolean"
    && typeof Reflect.get(value, "id") === "string"
    && Number.isSafeInteger(Reflect.get(value, "index"))
    && typeof Reflect.get(value, "mapping") === "string"
    && typeof Reflect.get(value, "timestamp") === "number";
}

export function createGamepadFixture(options: GamepadFixtureOptions): Gamepad {
  const gamepad = {
    axes: [...(options.axes ?? [])],
    buttons: options.buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
    connected: options.connected ?? true,
    id: options.id ?? `test-gamepad-${options.index}`,
    index: options.index,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null,
    hapticActuators: [],
  };
  if (!isGamepadFixture(gamepad)) throw new Error("Gamepad fixture must match the browser gamepad contract");
  return gamepad;
}
