import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import styles from "./controller-input-preview.module.css";
import {
  buildControllerPreviewGeometry,
  traceControllerPreviewShellPath,
} from "./controller-input-preview-geometry";
import {
  ALL_CONTROLLER_PREVIEW_SCOPE,
  buildControllerPreviewModel,
  buildControllerPreviewScopeOptions,
  resolveControllerPreviewScope,
  type ControllerPreviewScope,
} from "./controller-input-preview-model";
import type { PadPilotInputDeviceState } from "../padpilot/io/input-device";
import { PadPilot } from "../padpilot/index";
import { clamp, clamp01 } from "../utils/math";

type ControllerInputPreviewProps = {
  inputDevices: PadPilotInputDeviceState[];
};

function formatSignedValue(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function trackDevicePixelRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const actualRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + actualRadius, y);
  context.arcTo(x + width, y, x + width, y + height, actualRadius);
  context.arcTo(x + width, y + height, x, y + height, actualRadius);
  context.arcTo(x, y + height, x, y, actualRadius);
  context.arcTo(x, y, x + width, y, actualRadius);
  context.closePath();
}

function drawCircle(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.closePath();
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.strokeStyle = "rgba(77, 130, 184, 0.14)";
  context.lineWidth = 1;
  for (let x = 20; x < width; x += 28) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 18; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawButtonZone(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
  value: number,
  dimmed: boolean,
) {
  const intensity = clamp01(value);
  context.save();
  if (intensity > 0.05) {
    context.shadowBlur = 16 + intensity * 12;
    context.shadowColor = `rgba(96, 238, 255, ${0.24 + intensity * 0.48})`;
  }
  context.fillStyle = intensity > 0.05
    ? `rgba(94, 229, 255, ${0.12 + intensity * 0.36})`
    : dimmed
      ? "rgba(16, 29, 43, 0.22)"
      : "rgba(16, 29, 43, 0.7)";
  context.strokeStyle = intensity > 0.05
    ? `rgba(136, 246, 255, ${0.52 + intensity * 0.4})`
    : "rgba(101, 160, 204, 0.48)";
  context.lineWidth = 2;
  drawCircle(context, x, y, radius);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = dimmed ? "rgba(194, 223, 242, 0.3)" : "rgba(228, 246, 255, 0.9)";
  context.font = `700 ${Math.max(11, radius * 0.62)}px "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x, y);
  context.restore();
}

function drawRectZone(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: number,
  dimmed: boolean,
) {
  const intensity = clamp01(value);
  context.save();
  if (intensity > 0.05) {
    context.shadowBlur = 14 + intensity * 10;
    context.shadowColor = `rgba(96, 238, 255, ${0.18 + intensity * 0.46})`;
  }
  drawRoundedRect(context, x, y, width, height, 10);
  context.fillStyle = intensity > 0.05
    ? `rgba(94, 229, 255, ${0.1 + intensity * 0.32})`
    : dimmed
      ? "rgba(13, 24, 38, 0.2)"
      : "rgba(12, 24, 38, 0.78)";
  context.strokeStyle = intensity > 0.05
    ? `rgba(136, 246, 255, ${0.42 + intensity * 0.4})`
    : "rgba(101, 160, 204, 0.42)";
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = dimmed ? "rgba(194, 223, 242, 0.32)" : "rgba(228, 246, 255, 0.86)";
  context.font = `600 ${Math.max(10, height * 0.32)}px "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2);
  context.restore();
}

function drawStick(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  xValue: number,
  yValue: number,
  label: string,
  pressed: number,
  dimmed: boolean,
) {
  const clampedX = clamp(xValue, -1, 1);
  const clampedY = clamp(yValue, -1, 1);
  const intensity = Math.max(Math.abs(clampedX), Math.abs(clampedY), clamp01(pressed));
  context.save();
  context.strokeStyle = dimmed ? "rgba(92, 138, 182, 0.24)" : "rgba(92, 138, 182, 0.56)";
  context.lineWidth = 2;
  drawCircle(context, centerX, centerY, radius);
  context.stroke();
  context.beginPath();
  context.moveTo(centerX - radius, centerY);
  context.lineTo(centerX + radius, centerY);
  context.moveTo(centerX, centerY - radius);
  context.lineTo(centerX, centerY + radius);
  context.stroke();
  context.restore();

  if (pressed > 0.05) {
    context.save();
    context.shadowBlur = 18;
    context.shadowColor = `rgba(96, 238, 255, ${0.22 + pressed * 0.42})`;
    context.strokeStyle = `rgba(136, 246, 255, ${0.36 + pressed * 0.44})`;
    context.lineWidth = 4;
    drawCircle(context, centerX, centerY, radius + 6);
    context.stroke();
    context.restore();
  }

  const knobX = centerX + clampedX * radius * 0.58;
  const knobY = centerY + clampedY * radius * 0.58;
  context.save();
  if (intensity > 0.05) {
    context.shadowBlur = 18;
    context.shadowColor = `rgba(96, 238, 255, ${0.26 + intensity * 0.48})`;
  }
  context.fillStyle = intensity > 0.05
    ? `rgba(136, 246, 255, ${0.28 + intensity * 0.42})`
    : dimmed
      ? "rgba(58, 95, 126, 0.36)"
      : "rgba(78, 124, 164, 0.72)";
  drawCircle(context, knobX, knobY, Math.max(8, radius * 0.22));
  context.fill();
  context.restore();

  context.save();
  context.fillStyle = dimmed ? "rgba(194, 223, 242, 0.32)" : "rgba(228, 246, 255, 0.84)";
  context.font = `600 ${Math.max(11, radius * 0.34)}px "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.fillText(label, centerX, centerY + radius + 18);
  context.restore();
}

function drawTrigger(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: number,
  dimmed: boolean,
) {
  const intensity = clamp01(value);
  context.save();
  drawRoundedRect(context, x, y, width, height, 12);
  context.fillStyle = dimmed ? "rgba(13, 24, 38, 0.18)" : "rgba(12, 24, 38, 0.82)";
  context.strokeStyle = "rgba(101, 160, 204, 0.4)";
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  context.restore();

  if (intensity > 0) {
    context.save();
    context.shadowBlur = 16;
    context.shadowColor = `rgba(96, 238, 255, ${0.2 + intensity * 0.48})`;
    drawRoundedRect(context, x + 2, y + 2, Math.max(0, (width - 4) * intensity), height - 4, 10);
    context.fillStyle = `rgba(96, 238, 255, ${0.22 + intensity * 0.46})`;
    context.fill();
    context.restore();
  }

  context.save();
  context.fillStyle = dimmed ? "rgba(194, 223, 242, 0.32)" : "rgba(228, 246, 255, 0.84)";
  context.font = `600 ${Math.max(10, height * 0.34)}px "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2);
  context.restore();
}

function drawDpad(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  armLength: number,
  armThickness: number,
  values: readonly number[],
  dimmed: boolean,
) {
  const highlightMap = [
    { height: armLength, index: 12, width: armThickness, x: centerX - armThickness / 2, y: centerY - armLength },
    { height: armLength, index: 13, width: armThickness, x: centerX - armThickness / 2, y: centerY },
    { height: armThickness, index: 14, width: armLength, x: centerX - armLength, y: centerY - armThickness / 2 },
    { height: armThickness, index: 15, width: armLength, x: centerX, y: centerY - armThickness / 2 },
  ] as const;

  context.save();
  context.fillStyle = dimmed ? "rgba(14, 25, 40, 0.2)" : "rgba(13, 24, 38, 0.8)";
  context.strokeStyle = dimmed ? "rgba(92, 138, 182, 0.22)" : "rgba(92, 138, 182, 0.52)";
  context.lineWidth = 2;
  drawRoundedRect(context, centerX - armThickness / 2, centerY - armLength, armThickness, armLength * 2, armThickness / 2);
  context.fill();
  context.stroke();
  drawRoundedRect(context, centerX - armLength, centerY - armThickness / 2, armLength * 2, armThickness, armThickness / 2);
  context.fill();
  context.stroke();
  context.restore();

  for (const highlight of highlightMap) {
    const value = clamp01(values[highlight.index] ?? 0);
    if (value <= 0.05) {
      continue;
    }
    context.save();
    context.shadowBlur = 14;
    context.shadowColor = `rgba(96, 238, 255, ${0.22 + value * 0.44})`;
    drawRoundedRect(context, highlight.x, highlight.y, highlight.width, highlight.height, armThickness / 2);
    context.fillStyle = `rgba(96, 238, 255, ${0.18 + value * 0.4})`;
    context.fill();
    context.restore();
  }

  context.save();
  context.fillStyle = dimmed ? "rgba(21, 36, 52, 0.34)" : "rgba(24, 42, 62, 0.9)";
  drawRoundedRect(
    context,
    centerX - armThickness * 0.36,
    centerY - armThickness * 0.36,
    armThickness * 0.72,
    armThickness * 0.72,
    armThickness * 0.18,
  );
  context.fill();
  context.restore();

  context.save();
  context.fillStyle = dimmed ? "rgba(194, 223, 242, 0.3)" : "rgba(194, 223, 242, 0.68)";
  context.font = `600 ${Math.max(10, armThickness * 0.34)}px "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.fillText("D-Pad", centerX, centerY + armLength + 18);
  context.restore();
}

function drawControllerCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  buttons: readonly number[],
  axes: readonly number[],
  dimmed: boolean,
) {
  const context = canvas.getContext("2d");
  if (!context || width <= 0 || height <= 0) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.save();
  context.fillStyle = "rgba(5, 12, 21, 0.98)";
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);

  const geometry = buildControllerPreviewGeometry(width, height);

  context.save();
  traceControllerPreviewShellPath(context, geometry);
  context.fillStyle = dimmed ? "rgba(18, 31, 45, 0.12)" : "rgba(19, 38, 58, 0.28)";
  context.fill();
  context.restore();

  context.save();
  context.lineWidth = dimmed ? 2.6 : 3.3;
  context.strokeStyle = dimmed ? "rgba(83, 126, 164, 0.12)" : "rgba(96, 168, 220, 0.48)";
  context.shadowBlur = dimmed ? 0 : 22;
  context.shadowColor = dimmed ? "transparent" : "rgba(84, 196, 255, 0.12)";
  traceControllerPreviewShellPath(context, geometry);
  context.stroke();
  context.restore();

  drawTrigger(context, geometry.leftTrigger.x, geometry.leftTrigger.y, geometry.leftTrigger.width, geometry.leftTrigger.height, "LT", buttons[6] ?? 0, dimmed);
  drawTrigger(context, geometry.rightTrigger.x, geometry.rightTrigger.y, geometry.rightTrigger.width, geometry.rightTrigger.height, "RT", buttons[7] ?? 0, dimmed);
  drawRectZone(context, geometry.leftShoulder.x, geometry.leftShoulder.y, geometry.leftShoulder.width, geometry.leftShoulder.height, "LB", buttons[4] ?? 0, dimmed);
  drawRectZone(context, geometry.rightShoulder.x, geometry.rightShoulder.y, geometry.rightShoulder.width, geometry.rightShoulder.height, "RB", buttons[5] ?? 0, dimmed);

  drawDpad(
    context,
    geometry.dpad.x,
    geometry.dpad.y,
    geometry.dpad.armLength,
    geometry.dpad.armThickness,
    buttons,
    dimmed,
  );

  const faceRadius = geometry.faceCluster.buttonRadius;
  drawButtonZone(context, geometry.faceCluster.x, geometry.faceCluster.y - faceRadius * 1.45, faceRadius, "Y", buttons[3] ?? 0, dimmed);
  drawButtonZone(context, geometry.faceCluster.x + faceRadius * 1.45, geometry.faceCluster.y, faceRadius, "B", buttons[1] ?? 0, dimmed);
  drawButtonZone(context, geometry.faceCluster.x - faceRadius * 1.45, geometry.faceCluster.y, faceRadius, "X", buttons[2] ?? 0, dimmed);
  drawButtonZone(context, geometry.faceCluster.x, geometry.faceCluster.y + faceRadius * 1.45, faceRadius, "A", buttons[0] ?? 0, dimmed);

  drawRectZone(
    context,
    geometry.selectButton.x,
    geometry.selectButton.y,
    geometry.selectButton.width,
    geometry.selectButton.height,
    "Select",
    buttons[8] ?? 0,
    dimmed,
  );
  drawRectZone(
    context,
    geometry.startButton.x,
    geometry.startButton.y,
    geometry.startButton.width,
    geometry.startButton.height,
    "Start",
    buttons[9] ?? 0,
    dimmed,
  );

  drawStick(
    context,
    geometry.leftStick.x,
    geometry.leftStick.y,
    geometry.leftStick.radius,
    axes[0] ?? 0,
    axes[1] ?? 0,
    "L3",
    buttons[10] ?? 0,
    dimmed,
  );
  drawStick(
    context,
    geometry.rightStick.x,
    geometry.rightStick.y,
    geometry.rightStick.radius,
    axes[2] ?? 0,
    axes[3] ?? 0,
    "R3",
    buttons[11] ?? 0,
    dimmed,
  );

  context.restore();
}

export function ControllerInputPreview(props: ControllerInputPreviewProps) {
  const [scope, setScope] = createSignal<ControllerPreviewScope>(ALL_CONTROLLER_PREVIEW_SCOPE);
  const [canvasSize, setCanvasSize] = createSignal({ height: 260, width: 760 });
  const previewOptions = createMemo(() => buildControllerPreviewScopeOptions(props.inputDevices));
  const previewModel = createMemo(() => buildControllerPreviewModel(props.inputDevices, scope()));
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const resolved = resolveControllerPreviewScope(props.inputDevices, scope());
    if (resolved !== scope()) {
      setScope(resolved);
    }
  });

  createEffect(() => {
    const container = containerRef;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(360, Math.round(container.clientWidth || container.getBoundingClientRect().width || 760));
      const nextHeight = Math.max(220, Math.round(container.clientHeight || 260));
      setCanvasSize({ height: nextHeight, width: nextWidth });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const canvas = canvasRef;
    const model = previewModel();
    const size = canvasSize();
    if (!canvas) {
      return;
    }

    const ratio = trackDevicePixelRatio();
    canvas.width = Math.max(1, Math.round(size.width * ratio));
    canvas.height = Math.max(1, Math.round(size.height * ratio));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
    drawControllerCanvas(canvas, size.width, size.height, model.buttons, model.axes, model.empty);
  });

  return (
    <section class={styles.root}>
      <div class={styles["controls-row"]}>
        <PadPilot.Dropdown
          label="Preview Scope"
          value={previewModel().resolvedScope}
          options={previewOptions()}
          onChange={(value) => setScope(value)}
        />
      </div>

      <div ref={containerRef} class={styles["canvas-card"]}>
        <canvas
          ref={canvasRef}
          class={styles.canvas}
          role="img"
          aria-label="Live controller input preview"
        />
        <Show when={previewModel().empty}>
          <div class={styles["empty-overlay"]}>
            <div class={styles["empty-overlay-copy"]}>Connect a controller to preview live input.</div>
          </div>
        </Show>
      </div>

      <div class={styles["status-grid"]}>
        <article class={styles["status-card"]}>
          <span>Scope</span>
          <strong>{previewModel().scopeLabel}</strong>
          <p>Current preview source</p>
        </article>
        <article class={styles["status-card"]}>
          <span>Connection</span>
          <strong>{previewModel().connectionSummary}</strong>
          <p>{previewModel().connectedDeviceCount} device(s) available</p>
        </article>
        <article class={styles["status-card"]}>
          <span>Activity</span>
          <strong>{previewModel().activeSummary}</strong>
          <p>Live canonical controller readout</p>
        </article>
      </div>

      <Show when={previewModel().overflowGroups.length > 0}>
        <section class={styles["overflow-section"]}>
          <div class={styles["overflow-heading"]}>Overflow Raw Input</div>
          <div class={styles["overflow-groups"]}>
            <For each={previewModel().overflowGroups}>
              {(group) => (
                <article class={styles["overflow-group"]}>
                  <div class={styles["overflow-group-header"]}>
                    <strong>{group.deviceLabel}</strong>
                    <span>{group.hasActivity ? "Active overflow" : "Overflow present"}</span>
                  </div>
                  <div class={styles["overflow-list"]}>
                    <For each={group.buttons}>
                      {(button) => (
                        <div class={styles["overflow-chip"]}>
                          <span>{`B${button.index}`}</span>
                          <span class={styles["overflow-chip-meter"]}>
                            <span style={{ width: `${Math.round(clamp01(button.value) * 100)}%` }} />
                          </span>
                          <span class={styles["overflow-chip-value"]}>{Math.round(button.value * 100)}%</span>
                        </div>
                      )}
                    </For>
                    <For each={group.axes}>
                      {(axis) => (
                        <div class={styles["overflow-chip"]}>
                          <span>{`A${axis.index}`}</span>
                          <span class={styles["overflow-chip-meter"]}>
                            <span style={{ width: `${Math.round(clamp01(Math.abs(axis.value)) * 100)}%` }} />
                          </span>
                          <span class={styles["overflow-chip-value"]}>{formatSignedValue(axis.value)}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </article>
              )}
            </For>
          </div>
        </section>
      </Show>
    </section>
  );
}
