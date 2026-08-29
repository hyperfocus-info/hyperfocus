import { MINIMAP_MAX_ENEMIES, MINIMAP_MAX_PICKUPS, MINIMAP_RANGE, MINIMAP_UPDATE_INTERVAL } from "./constants.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const angleTo = runtimeCallback("worldMath", "angleTo");
const getWorldSize = runtimeCallback("worldMath", "getWorldSize");
import { state } from "./arena-state.ts";
import { minimapCtx, pointer } from "./runtime-context.ts";
import { ui } from "./user-interface.ts";

export function updateMinimap(dt = 0, force = false): void {
  const ctx = minimapCtx;
  const player = state.player;
  if (!ctx || !player || !ui.minimapCanvas) return;
  state.minimapClock -= dt;
  if (!force && state.minimapClock > 0) return;
  state.minimapClock = MINIMAP_UPDATE_INTERVAL;
  const canvas = ui.minimapCanvas;
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cz = height / 2;
  const scale = Math.min(width, height) / (MINIMAP_RANGE * 2);
  const worldSize = getWorldSize();
  const halfWorld = worldSize / 2;
  let pointX = 0;
  let pointY = 0;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(3, 8, 7, 0.9)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(210, 244, 158, 0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = (width * i) / 4;
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(210, 244, 158, 0.28)";
  ctx.beginPath();
  ctx.arc(cx, cz, MINIMAP_RANGE * scale, 0, Math.PI * 2);
  ctx.stroke();

  const setPoint = (x: number, z: number): boolean => {
    let dx = x - player.x;
    let dz = z - player.z;
    if (dx > halfWorld) dx -= worldSize;
    else if (dx < -halfWorld) dx += worldSize;
    if (dz > halfWorld) dz -= worldSize;
    else if (dz < -halfWorld) dz += worldSize;
    if (Math.abs(dx) > MINIMAP_RANGE || Math.abs(dz) > MINIMAP_RANGE) return false;
    pointX = cx + dx * scale;
    pointY = cz + dz * scale;
    return true;
  };
  const drawCircle = (x: number, z: number, radius: number, fill: string, stroke: string | null = null): void => {
    if (!setPoint(x, z)) return;
    ctx.beginPath();
    ctx.arc(pointX, pointY, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  const drawSquare = (x: number, z: number, size: number, fill: string): void => {
    if (!setPoint(x, z)) return;
    ctx.fillStyle = fill;
    ctx.fillRect(pointX - size / 2, pointY - size / 2, size, size);
  };

  for (const hazard of state.hazards) drawCircle(hazard.x, hazard.z, Math.max(3, hazard.radius * scale), "rgba(190, 210, 100, 0.28)", "rgba(230, 240, 150, 0.38)");
  const pickupStep = Math.max(1, Math.ceil(state.pickups.length / MINIMAP_MAX_PICKUPS));
  for (let i = 0; i < state.pickups.length; i += pickupStep) {
    const pickup = state.pickups[i];
    if (!pickup) continue;
    drawSquare(pickup.x, pickup.z, pickup.kind === "weapon" ? 6 : 4, pickup.kind === "weapon" ? "#ffd27a" : pickup.kind === "heal" ? "#8dff9d" : pickup.kind === "magnet" ? "#9fe8ff" : "#c8ff7d");
  }
  for (const tool of state.traversalTools) drawSquare(tool.x, tool.z, 5, tool.color ?? "#bff7ff");
  for (const indicator of state.attackIndicators) {
    const fill = indicator.kind === "nova" ? "rgba(255, 145, 61, 0.44)" : "rgba(255, 83, 74, 0.42)";
    if (indicator.kind === "dash") {
      if (!setPoint(indicator.x, indicator.z)) continue;
      ctx.save();
      ctx.translate(pointX, pointY);
      ctx.rotate(indicator.angle);
      ctx.fillStyle = fill;
      ctx.fillRect(-indicator.length * scale * 0.5, -indicator.width * scale * 0.5, indicator.length * scale, indicator.width * scale);
      ctx.restore();
    } else {
      drawCircle(indicator.x, indicator.z, Math.max(4, indicator.radius * scale), fill);
    }
  }
  const enemyStep = Math.max(1, Math.ceil(state.enemies.length / MINIMAP_MAX_ENEMIES));
  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    if (!enemy.boss && i % enemyStep !== 0) continue;
    const radius = enemy.boss ? 6 : Math.max(2.6, enemy.radius * 1.9);
    drawCircle(enemy.x, enemy.z, radius, enemy.boss ? "#d05cff" : "#ff6658", enemy.boss ? "#ffd6ff" : null);
  }

  const aim = angleTo(player.x, player.z, pointer.worldX, pointer.worldZ);
  ctx.save();
  ctx.translate(cx, cz);
  ctx.rotate(aim);
  ctx.fillStyle = "#d7ff7d";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
