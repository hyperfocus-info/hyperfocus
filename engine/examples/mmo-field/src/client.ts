import { createFixedStepLoop, createKeyboardActions } from "@hyperfocus/engine";
import { createMmoClient, type MmoMappedInput } from "@hyperfocus/engine/mmo";
import { fieldSchema, type FieldState } from "./schema.ts";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`MMO Field requires ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#field");
const context = (() => {
  const value = canvas.getContext("2d");
  if (!value) throw new Error("MMO Field requires a 2D canvas context");
  return value;
})();
const status = requiredElement<HTMLElement>("#status");
const telemetry = requiredElement<HTMLElement>("#telemetry");
const keyboard = createKeyboardActions({
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
});
const params = new URLSearchParams(location.search);
const client = createMmoClient<FieldState, MmoMappedInput>({
  url: params.get("ws") ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
  token: `dev:player-${Math.floor(Math.random() * 9999)}`,
  roomId: "field",
  roomType: "field",
  schema: fieldSchema,
});
let replicated: FieldState = { players: {}, tick: 0 };
let connected = false;
client.onState((state) => { replicated = state; });

function currentInput(): MmoMappedInput {
  return {
    dx: Number(keyboard.held("right")) - Number(keyboard.held("left")),
    dy: Number(keyboard.held("down")) - Number(keyboard.held("up")),
    action: "", targetId: "", aimX: 0, aimY: 0,
  };
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#2a3947";
  for (let x = 0; x < canvas.width; x += 32) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
  }
  for (let y = 0; y < canvas.height; y += 32) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
  }
  for (const player of Object.values(replicated.players)) {
    context.fillStyle = "#f8c471";
    context.beginPath();
    context.arc(canvas.width / 2 + player.x, canvas.height / 2 + player.y, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f4f7fb";
    context.fillText(player.name, canvas.width / 2 + player.x + 12, canvas.height / 2 + player.y - 10);
  }
  telemetry.textContent = `Tick ${replicated.tick} · ${Object.keys(replicated.players).length} interested players`;
}

const loop = createFixedStepLoop({
  step: 1 / 20,
  maxFrame: 0.25,
  update() { if (connected) client.sendInput(currentInput()); keyboard.update(); },
  render,
});

try {
  await client.connect();
  connected = true;
  status.textContent = "Connected. Use WASD or the arrow keys to move.";
  loop.start();
} catch (error) {
  status.textContent = `Connection failed: ${error instanceof Error ? error.message : String(error)}`;
}
addEventListener("pagehide", () => { connected = false; loop.stop(); keyboard.dispose(); client.close(); }, { once: true });
