export type FlightConfigSet = {
  mass: number;
  linearResponseK: number;
  angularResponseK: number;
  maxForwardSpeed: number;
  maxReverseSpeed: number;
  forwardAcceleration: number;
  brakeAcceleration: number;
  boostAcceleration: number;
  forwardDrag: number;
  lateralDrag: number;
  verticalDrag: number;
  hoverBalanceStrength: number;
  hoverDamping: number;
  yawRate: number;
  pitchRate: number;
  rollRate: number;
  maxBankAngleDeg: number;
  bankBySpeedFactor: number;
  bankingLiftFactor: number;
  driftMaxAngleDeg: number;
  driftCorrectionStrength: number;
  driftCorrectionDelay: number;
  idleRollReturnK: number;
};

type CameraConfig = {
  cameraFollowDistance: number;
  cameraFollowHeight: number;
  cameraPositionLagK: number;
  cameraLookLagK: number;
  baseFov: number;
  maxFov: number;
  fovResponseK: number;
  speedForMaxFov: number;
};

type EffectsConfig = {
  speedLineCount: number;
  speedLineLength: number;
  speedLineSpawnRadius: number;
  speedLineSpeedFactor: number;
};

export type FlightConfigName = "light" | "medium" | "heavy";

const presets: Record<FlightConfigName, FlightConfigSet> = {
  light: {
    mass: 0.75,
    linearResponseK: 14,
    angularResponseK: 16,
    maxForwardSpeed: 260,
    maxReverseSpeed: 44,
    forwardAcceleration: 120,
    brakeAcceleration: 130,
    boostAcceleration: 190,
    forwardDrag: 0.12,
    lateralDrag: 1.0,
    verticalDrag: 1.2,
    hoverBalanceStrength: 26,
    hoverDamping: 7,
    yawRate: 2.2,
    pitchRate: 1.7,
    rollRate: 2.8,
    maxBankAngleDeg: 50,
    bankBySpeedFactor: 1.2,
    bankingLiftFactor: 0.85,
    driftMaxAngleDeg: 35,
    driftCorrectionStrength: 4.5,
    driftCorrectionDelay: 0.18,
    idleRollReturnK: 4.2,
  },
  medium: {
    mass: 1.0,
    linearResponseK: 10,
    angularResponseK: 12,
    maxForwardSpeed: 220,
    maxReverseSpeed: 40,
    forwardAcceleration: 90,
    brakeAcceleration: 110,
    boostAcceleration: 160,
    forwardDrag: 0.18,
    lateralDrag: 1.4,
    verticalDrag: 1.8,
    hoverBalanceStrength: 30,
    hoverDamping: 8,
    yawRate: 1.8,
    pitchRate: 1.4,
    rollRate: 2.4,
    maxBankAngleDeg: 42,
    bankBySpeedFactor: 1.0,
    bankingLiftFactor: 0.9,
    driftMaxAngleDeg: 28,
    driftCorrectionStrength: 6,
    driftCorrectionDelay: 0.15,
    idleRollReturnK: 5,
  },
  heavy: {
    mass: 1.8,
    linearResponseK: 7,
    angularResponseK: 8,
    maxForwardSpeed: 190,
    maxReverseSpeed: 34,
    forwardAcceleration: 76,
    brakeAcceleration: 98,
    boostAcceleration: 130,
    forwardDrag: 0.26,
    lateralDrag: 1.9,
    verticalDrag: 2.2,
    hoverBalanceStrength: 35,
    hoverDamping: 10,
    yawRate: 1.35,
    pitchRate: 1.0,
    rollRate: 2.0,
    maxBankAngleDeg: 30,
    bankBySpeedFactor: 0.8,
    bankingLiftFactor: 1.05,
    driftMaxAngleDeg: 18,
    driftCorrectionStrength: 7.5,
    driftCorrectionDelay: 0.08,
    idleRollReturnK: 6,
  },
};

export const flightConfig: {
  flight: FlightConfigSet;
  camera: CameraConfig;
  effects: EffectsConfig;
} = {
  flight: { ...presets.medium },
  camera: {
    cameraFollowDistance: 8,
    cameraFollowHeight: 2.2,
    cameraPositionLagK: 7,
    cameraLookLagK: 9,
    baseFov: 78,
    maxFov: 102,
    fovResponseK: 6,
    speedForMaxFov: 220,
  },
  effects: {
    speedLineCount: 600,
    speedLineLength: 1.8,
    speedLineSpawnRadius: 18,
    speedLineSpeedFactor: 1.4,
  },
};

export function getPreset(name: FlightConfigName): FlightConfigSet {
  return { ...presets[name] };
}
