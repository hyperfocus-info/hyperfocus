import { renderableRecord, renderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { currentUtcDateString, dailyQuestArcForDate } from "../../data/daily-quests.ts";
import { getMmoSkillDemoAnchorTile } from "../../data/world.ts";
import { type MmoSkillDemoState, type PlayerEntity } from "../../shared-contracts.ts";
import { mainQuestDestination, type MainQuestDestination } from "../quest-guide.ts";
import { TILE } from "../world.ts";

export function createDailyQuestReticleRenderCalls(player: PlayerEntity | undefined, timeMs: number, calls: Renderable[] = [], pool?: RenderFramePool) {
  if (!player || player.dailyQuestCompleted) return calls;
  const arc = dailyQuestArcForDate(player.dailyQuestDate || currentUtcDateString());
  const step = arc.steps[player.dailyQuestStep || 0];
  if (!step) return calls;
  const tile = getMmoSkillDemoAnchorTile(step.anchorId);
  const x = tile.x * TILE + TILE / 2;
  const y = tile.y * TILE + TILE / 2;
  const pulse = 1 + Math.sin(timeMs / 260) * 0.08;
  const radius = 30 * pulse;
  const outer = pushCircle(calls, pool, x, y, radius);
  outer.fill = "rgba(244, 211, 107, 0.08)";
  outer.stroke = "rgba(244, 211, 107, 0.86)";
  outer.lineWidth = 3;
  const inner = pushCircle(calls, pool, x, y, 9);
  inner.fill = "rgba(120, 214, 180, 0.18)";
  inner.stroke = "#78d6b4";
  inner.lineWidth = 2;
  const line = pushLine(calls, pool, x - 42, y, x + 42, y);
  line.stroke = "rgba(244, 211, 107, 0.78)";
  line.lineWidth = 2;
  const label = renderRecord(pool, "text");
  label.text = "DAILY";
  label.x = x;
  label.y = y - 42;
  label.fill = "#f4d36b";
  label.font = "800 11px system-ui";
  label.align = "center";
  calls.push(renderableRecord(label));
  return calls;
}

function pushCircle(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radius: number) {
  const call = renderRecord(pool, "circle");
  call.x = x;
  call.y = y;
  call.radius = radius;
  calls.push(renderableRecord(call));
  return call;
}

function pushLine(calls: Renderable[], pool: RenderFramePool | undefined, x1: number, y1: number, x2: number, y2: number) {
  const call = renderRecord(pool, "line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  calls.push(renderableRecord(call));
  return call;
}

function appendMainQuestAreaBorder(destination: MainQuestDestination, timeMs: number, calls: Renderable[], pool?: RenderFramePool) {
  if (destination.kind !== "area") return;
  const pulse = 0.5 + Math.sin(timeMs * 0.004) * 0.5;
  const outer = pushCircle(calls, pool, destination.x, destination.y, destination.radius + 8 + pulse * 5);
  outer.fill = "rgba(244, 211, 107, 0.025)";
  outer.stroke = "rgba(255, 255, 255, 0.66)";
  outer.lineWidth = 3;
  outer.shadowColor = "rgba(255, 255, 255, 0.9)";
  outer.shadowBlur = 18 + pulse * 12;
  outer.dash = [16, 10];
  outer.dashOffset = -timeMs * 0.02;

  const inner = pushCircle(calls, pool, destination.x, destination.y, Math.max(18, destination.radius - 5));
  inner.stroke = "rgba(244, 211, 107, 0.28)";
  inner.lineWidth = 2;
  inner.shadowColor = "rgba(244, 211, 107, 0.82)";
  inner.shadowBlur = 10;
}

function appendMainQuestPointReticle(destination: MainQuestDestination, timeMs: number, calls: Renderable[], pool?: RenderFramePool) {
  if (destination.kind !== "point") return;
  const pulse = 0.5 + Math.sin(timeMs * 0.006) * 0.5;
  const ring = pushCircle(calls, pool, destination.x, destination.y, 24 + pulse * 4);
  ring.fill = "rgba(244, 211, 107, 0.08)";
  ring.stroke = "rgba(255, 255, 255, 0.82)";
  ring.lineWidth = 3;
  ring.shadowColor = "rgba(244, 211, 107, 0.9)";
  ring.shadowBlur = 16;
  const core = pushCircle(calls, pool, destination.x, destination.y, 5 + pulse * 2);
  core.fill = "rgba(255, 255, 255, 0.82)";
  core.stroke = "rgba(244, 211, 107, 0.86)";
  core.lineWidth = 1.5;
  core.shadowColor = "rgba(255, 255, 255, 0.9)";
  core.shadowBlur = 8;
}

export function createMainQuestGuideRenderCalls(state: MmoSkillDemoState, player: PlayerEntity | undefined, timeMs: number, calls: Renderable[] = [], pool?: RenderFramePool) {
  const destination = mainQuestDestination(state, player);
  if (!player || !destination) return calls;
  if ((player.zoneId === "dungeon" || player.zoneId === "cottage") && destination.zoneId !== player.zoneId) return calls;

  const dx = destination.x - player.x;
  const dy = destination.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 64) {
    appendMainQuestAreaBorder(destination, timeMs, calls, pool);
    appendMainQuestPointReticle(destination, timeMs, calls, pool);
    return calls;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const start = Math.min(56, Math.max(22, distance * 0.08));
  const guideLength = Math.min(distance - 16, 1800);
  const guideLine = pushLine(calls, pool, player.x + ux * start, player.y + uy * start, player.x + ux * guideLength, player.y + uy * guideLength);
  guideLine.stroke = "rgba(199, 255, 168, 0.07)";
  guideLine.lineWidth = 4;
  guideLine.cap = "round";
  guideLine.shadowColor = "rgba(199, 255, 168, 0.2)";
  guideLine.shadowBlur = 8;

  const count = Math.min(18, Math.max(4, Math.floor(guideLength / 92)));
  for (let i = 0; i < count; i += 1) {
    const stride = 86;
    const flow = (timeMs * 0.022 + i * stride) % Math.max(stride, guideLength - start);
    const wobble = Math.sin(timeMs * 0.0024 + i * 1.91) * 9 + Math.sin(timeMs * 0.0047 + i * 0.63) * 4;
    const drift = Math.sin(timeMs * 0.0031 + i * 2.31) * 7;
    const t = Math.min(distance - 20, start + flow + drift);
    const x = player.x + ux * t + -uy * wobble;
    const y = player.y + uy * t + ux * wobble;
    const wave = 0.5 + Math.sin(timeMs * 0.008 + i * 1.7) * 0.5;
    const mote = pushCircle(calls, pool, x, y, 2.2 + wave * 1.5);
    mote.fill = `rgba(199, 255, 168, ${0.12 + wave * 0.08})`;
    mote.stroke = `rgba(255, 255, 255, ${0.26 + wave * 0.12})`;
    mote.lineWidth = 1;
    mote.shadowColor = "rgba(199, 255, 168, 0.52)";
    mote.shadowBlur = 6 + wave * 4;
    if (i % 3 === 0) {
      const shimmer = pushCircle(calls, pool, x + uy * 4, y - ux * 4, 1.2 + wave * 0.5);
      shimmer.fill = "rgba(255, 255, 255, 0.58)";
      shimmer.shadowColor = "rgba(255, 255, 255, 0.72)";
      shimmer.shadowBlur = 7;
    }
  }

  appendMainQuestAreaBorder(destination, timeMs, calls, pool);
  appendMainQuestPointReticle(destination, timeMs, calls, pool);
  return calls;
}
