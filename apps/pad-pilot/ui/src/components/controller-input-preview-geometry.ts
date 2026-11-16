export type ControllerPreviewPoint = {
  x: number;
  y: number;
};

export type ControllerPreviewShellAnchors = {
  topCenterDip: ControllerPreviewPoint;
  topCenterLeft: ControllerPreviewPoint;
  topCenterRight: ControllerPreviewPoint;
  leftShoulderCrest: ControllerPreviewPoint;
  rightShoulderCrest: ControllerPreviewPoint;
  leftUpperWaist: ControllerPreviewPoint;
  rightUpperWaist: ControllerPreviewPoint;
  leftGripOuter: ControllerPreviewPoint;
  rightGripOuter: ControllerPreviewPoint;
  leftGripBottom: ControllerPreviewPoint;
  rightGripBottom: ControllerPreviewPoint;
  bottomNotchLeft: ControllerPreviewPoint;
  bottomNotchRight: ControllerPreviewPoint;
  bottomNotchApex: ControllerPreviewPoint;
};

type RoundedRectGeometry = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type StickGeometry = {
  radius: number;
  x: number;
  y: number;
};

type FaceClusterGeometry = {
  buttonRadius: number;
  x: number;
  y: number;
};

type DpadGeometry = {
  armLength: number;
  armThickness: number;
  x: number;
  y: number;
};

export type ControllerPreviewGeometry = {
  dpad: DpadGeometry;
  faceCluster: FaceClusterGeometry;
  leftShoulder: RoundedRectGeometry;
  leftStick: StickGeometry;
  leftTrigger: RoundedRectGeometry;
  rightShoulder: RoundedRectGeometry;
  rightStick: StickGeometry;
  rightTrigger: RoundedRectGeometry;
  selectButton: RoundedRectGeometry;
  shellAnchors: ControllerPreviewShellAnchors;
  shellBounds: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  startButton: RoundedRectGeometry;
};

export const CONTROLLER_PREVIEW_TRIGGER_WIDTH_RATIO = 0.176;
export const CONTROLLER_PREVIEW_SHOULDER_WIDTH_RATIO = 0.176;

function scalePoint(width: number, height: number, xRatio: number, yRatio: number) {
  return {
    x: width * xRatio,
    y: height * yRatio,
  };
}

function mirrorPoint(width: number, point: ControllerPreviewPoint) {
  return {
    x: width - point.x,
    y: point.y,
  };
}

export function buildControllerPreviewGeometry(width: number, height: number) {
  const safeWidth = Math.max(360, width);
  const safeHeight = Math.max(220, height);

  const topCenterDip = scalePoint(safeWidth, safeHeight, 0.5, 0.285);
  const topCenterLeft = scalePoint(safeWidth, safeHeight, 0.448, 0.302);
  const leftShoulderCrest = scalePoint(safeWidth, safeHeight, 0.382, 0.245);
  const leftUpperWaist = scalePoint(safeWidth, safeHeight, 0.198, 0.314);
  const leftGripOuter = scalePoint(safeWidth, safeHeight, 0.136, 0.505);
  const leftGripBottom = scalePoint(safeWidth, safeHeight, 0.205, 0.752);
  const bottomNotchLeft = scalePoint(safeWidth, safeHeight, 0.428, 0.742);
  const bottomNotchApex = scalePoint(safeWidth, safeHeight, 0.5, 0.598);

  const shellAnchors: ControllerPreviewShellAnchors = {
    bottomNotchApex,
    bottomNotchLeft,
    bottomNotchRight: mirrorPoint(safeWidth, bottomNotchLeft),
    leftGripBottom,
    leftGripOuter,
    leftShoulderCrest,
    leftUpperWaist,
    rightGripBottom: mirrorPoint(safeWidth, leftGripBottom),
    rightGripOuter: mirrorPoint(safeWidth, leftGripOuter),
    rightShoulderCrest: mirrorPoint(safeWidth, leftShoulderCrest),
    rightUpperWaist: mirrorPoint(safeWidth, leftUpperWaist),
    topCenterDip,
    topCenterLeft,
    topCenterRight: mirrorPoint(safeWidth, topCenterLeft),
  };

  const shellBounds = {
    bottom: safeHeight * 0.8,
    left: safeWidth * 0.13,
    right: safeWidth * 0.87,
    top: safeHeight * 0.24,
  };

  const triggerWidth = safeWidth * CONTROLLER_PREVIEW_TRIGGER_WIDTH_RATIO;
  const shoulderWidth = safeWidth * CONTROLLER_PREVIEW_SHOULDER_WIDTH_RATIO;

  return {
    dpad: {
      armLength: Math.min(safeWidth, safeHeight) * 0.108,
      armThickness: Math.min(safeWidth, safeHeight) * 0.042,
      x: safeWidth * 0.27,
      y: safeHeight * 0.41,
    },
    faceCluster: {
      buttonRadius: Math.min(safeWidth, safeHeight) * 0.038,
      x: safeWidth * 0.73,
      y: safeHeight * 0.39,
    },
    leftShoulder: {
      height: safeHeight * 0.062,
      width: shoulderWidth,
      x: safeWidth * 0.145,
      y: safeHeight * 0.14,
    },
    leftStick: {
      radius: Math.min(safeWidth, safeHeight) * 0.102,
      x: safeWidth * 0.29,
      y: safeHeight * 0.67,
    },
    leftTrigger: {
      height: safeHeight * 0.056,
      width: triggerWidth,
      x: safeWidth * 0.145,
      y: safeHeight * 0.064,
    },
    rightShoulder: {
      height: safeHeight * 0.062,
      width: shoulderWidth,
      x: safeWidth - safeWidth * 0.145 - shoulderWidth,
      y: safeHeight * 0.14,
    },
    rightStick: {
      radius: Math.min(safeWidth, safeHeight) * 0.102,
      x: safeWidth * 0.71,
      y: safeHeight * 0.67,
    },
    rightTrigger: {
      height: safeHeight * 0.056,
      width: triggerWidth,
      x: safeWidth - safeWidth * 0.145 - triggerWidth,
      y: safeHeight * 0.064,
    },
    selectButton: {
      height: safeHeight * 0.056,
      width: safeWidth * 0.074,
      x: safeWidth * 0.423,
      y: safeHeight * 0.462,
    },
    shellAnchors,
    shellBounds,
    startButton: {
      height: safeHeight * 0.056,
      width: safeWidth * 0.074,
      x: safeWidth * 0.503,
      y: safeHeight * 0.462,
    },
  };
}

export function traceControllerPreviewShellPath(context: CanvasRenderingContext2D, geometry: ControllerPreviewGeometry) {
  const {
    bottomNotchApex,
    bottomNotchLeft,
    bottomNotchRight,
    leftGripBottom,
    leftGripOuter,
    leftShoulderCrest,
    leftUpperWaist,
    rightGripBottom,
    rightGripOuter,
    rightShoulderCrest,
    rightUpperWaist,
    topCenterDip,
    topCenterLeft,
    topCenterRight,
  } = geometry.shellAnchors;

  context.beginPath();
  context.moveTo(topCenterDip.x, topCenterDip.y);
  context.bezierCurveTo(
    topCenterDip.x - (topCenterDip.x - topCenterLeft.x) * 0.55,
    topCenterDip.y - 2,
    topCenterLeft.x + (leftShoulderCrest.x - topCenterLeft.x) * 0.35,
    leftShoulderCrest.y,
    leftShoulderCrest.x,
    leftShoulderCrest.y,
  );
  context.bezierCurveTo(
    leftShoulderCrest.x - 18,
    leftShoulderCrest.y - 10,
    leftUpperWaist.x + 14,
    leftUpperWaist.y - 4,
    leftUpperWaist.x,
    leftUpperWaist.y,
  );
  context.bezierCurveTo(
    leftUpperWaist.x - 24,
    leftUpperWaist.y + 22,
    leftGripOuter.x - 6,
    leftGripOuter.y - 24,
    leftGripOuter.x,
    leftGripOuter.y,
  );
  context.bezierCurveTo(
    leftGripOuter.x - 10,
    leftGripOuter.y + 76,
    leftGripBottom.x - 4,
    leftGripBottom.y - 12,
    leftGripBottom.x,
    leftGripBottom.y,
  );
  context.bezierCurveTo(
    leftGripBottom.x + 26,
    leftGripBottom.y + 12,
    bottomNotchLeft.x - 22,
    bottomNotchLeft.y + 2,
    bottomNotchLeft.x,
    bottomNotchLeft.y,
  );
  context.quadraticCurveTo(
    bottomNotchLeft.x + (bottomNotchApex.x - bottomNotchLeft.x) * 0.45,
    bottomNotchApex.y,
    bottomNotchApex.x,
    bottomNotchApex.y,
  );
  context.quadraticCurveTo(
    bottomNotchRight.x - (bottomNotchRight.x - bottomNotchApex.x) * 0.45,
    bottomNotchApex.y,
    bottomNotchRight.x,
    bottomNotchRight.y,
  );
  context.bezierCurveTo(
    bottomNotchRight.x + 22,
    bottomNotchRight.y + 2,
    rightGripBottom.x - 26,
    rightGripBottom.y + 12,
    rightGripBottom.x,
    rightGripBottom.y,
  );
  context.bezierCurveTo(
    rightGripBottom.x + 4,
    rightGripBottom.y - 12,
    rightGripOuter.x + 10,
    rightGripOuter.y + 76,
    rightGripOuter.x,
    rightGripOuter.y,
  );
  context.bezierCurveTo(
    rightGripOuter.x + 6,
    rightGripOuter.y - 24,
    rightUpperWaist.x + 24,
    rightUpperWaist.y + 22,
    rightUpperWaist.x,
    rightUpperWaist.y,
  );
  context.bezierCurveTo(
    rightUpperWaist.x - 14,
    rightUpperWaist.y - 4,
    rightShoulderCrest.x + 18,
    rightShoulderCrest.y - 10,
    rightShoulderCrest.x,
    rightShoulderCrest.y,
  );
  context.bezierCurveTo(
    topCenterRight.x - (rightShoulderCrest.x - topCenterRight.x) * 0.35,
    rightShoulderCrest.y,
    topCenterDip.x + (topCenterRight.x - topCenterDip.x) * 0.55,
    topCenterDip.y - 2,
    topCenterDip.x,
    topCenterDip.y,
  );
  context.closePath();
}
