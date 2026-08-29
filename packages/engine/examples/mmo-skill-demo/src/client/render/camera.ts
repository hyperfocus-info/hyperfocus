import { type HazardEntity, type PlayerEntity } from "../../shared-contracts.ts";
import { MAP_HEIGHT, MAP_WIDTH, TILE } from "../world.ts";
import type { Camera, Viewport } from "./types.ts";

export function cameraForPlayer(player: Pick<PlayerEntity, "x" | "y"> | undefined, width: number, height: number): Camera {
  const x = player ? player.x : MAP_WIDTH * TILE * 0.5;
  const y = player ? player.y : MAP_HEIGHT * TILE * 0.5;
  return {
    x: Math.max(0, Math.min(MAP_WIDTH * TILE - width, x - width * 0.5)),
    y: Math.max(0, Math.min(MAP_HEIGHT * TILE - height, y - height * 0.5))
  };
}

export function viewportFromCamera(camera: Camera, width: number, height: number, padding = 0): Viewport {
  return {
    x: camera.x - padding,
    y: camera.y - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

export function pointNearView(camera: Camera, width: number, height: number, x: number, y: number, padding = 96) {
  return x >= camera.x - padding && x <= camera.x + width + padding && y >= camera.y - padding && y <= camera.y + height + padding;
}

export function hazardNearView(camera: Camera, width: number, height: number, hazard: HazardEntity) {
  const minX = Math.min(hazard.x, hazard.toX) - hazard.radius - 48;
  const maxX = Math.max(hazard.x, hazard.toX) + hazard.radius + 48;
  const minY = Math.min(hazard.y, hazard.toY) - hazard.radius - 48;
  const maxY = Math.max(hazard.y, hazard.toY) + hazard.radius + 48;
  return maxX >= camera.x && minX <= camera.x + width && maxY >= camera.y && minY <= camera.y + height;
}
