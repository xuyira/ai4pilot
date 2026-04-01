import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { InputState } from "../input/inputController";
import type { FlightConfigSet } from "../../config/flight";

type FlightState = {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
  throttleLevel: number;
  targetForwardSpeed: number;
  forwardSpeed: number;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  speed: number;
  driftAngleDeg: number;
  isCrashed: boolean;
  crashTimer: number;
};

const FORWARD = new Vector3(0, 0, -1);
const RIGHT = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const LOCAL_VELOCITY = new Vector3();
const DRAG_LOCAL = new Vector3();
const DRAG_WORLD = new Vector3();
const THRUST = new Vector3();
const BANK_FORCE = new Vector3();
const DRIFT_CORRECTION = new Vector3();
const EULER = new Euler(0, 0, 0, "YXZ");
const ORIENTATION_EULER = new Euler(0, 0, 0, "YXZ");
const DELTA_QUATERNION = new Quaternion();
const LOOK_DIRECTION = new Vector3();
const ORIENTATION_INVERSE = new Quaternion();
const ZERO = new Vector3();
const CRASH_RESET_TIME = 1.1;
const HOVER_Y = 8;
const GROUND_LEVEL = -2.2;

export type FlightController = ReturnType<typeof createFlightController>;

export function createFlightController(initialConfig: FlightConfigSet) {
  const config = { ...initialConfig };
  const state: FlightState = {
    position: new Vector3(0, 8, 0),
    velocity: new Vector3(0, 0, -config.cruiseSpeed),
    acceleration: new Vector3(),
    orientation: new Quaternion(),
    angularVelocity: new Vector3(),
    throttleLevel: config.cruiseSpeed / config.maxForwardSpeed,
    targetForwardSpeed: config.cruiseSpeed,
    forwardSpeed: config.cruiseSpeed,
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    speed: config.cruiseSpeed,
    driftAngleDeg: 0,
    isCrashed: false,
    crashTimer: 0,
  };

  let driftTimer = 0;

  const api = {
    applyConfig(nextConfig: FlightConfigSet) {
      Object.assign(config, nextConfig);
      state.targetForwardSpeed = MathUtils.clamp(
        state.targetForwardSpeed,
        config.minCruiseSpeed,
        config.maxForwardSpeed,
      );
      state.throttleLevel = state.targetForwardSpeed / config.maxForwardSpeed;
    },

    update(dt: number, input: InputState) {
      if (state.isCrashed) {
        state.crashTimer = Math.max(0, state.crashTimer - dt);
        if (state.crashTimer === 0) {
          resetFlightState(state, config);
        }
        return;
      }

      const massScale = 1 / config.mass;
      const speed = state.velocity.length();
      const speedRatio = Math.min(speed / config.maxForwardSpeed, 1);

      const targetYaw = input.yaw * config.yawRate;
      const targetPitch = input.pitch * config.pitchRate;
      const targetManualRoll = input.roll * config.rollRate;
      const targetAutoBank =
        MathUtils.degToRad(-input.yaw * config.maxBankAngleDeg * (0.4 + speedRatio * config.bankBySpeedFactor));
      const currentRoll = ORIENTATION_EULER.setFromQuaternion(state.orientation, "YXZ").z;
      const targetRollRate = (targetAutoBank - currentRoll) * config.rollRate + targetManualRoll;

      state.angularVelocity.x = smoothTowards(
        state.angularVelocity.x,
        targetPitch,
        config.angularResponseK,
        dt,
      );
      state.angularVelocity.y = smoothTowards(
        state.angularVelocity.y,
        targetYaw,
        config.angularResponseK,
        dt,
      );
      state.angularVelocity.z = smoothTowards(
        state.angularVelocity.z,
        targetRollRate,
        config.angularResponseK,
        dt,
      );

      EULER.set(
        state.angularVelocity.x * dt,
        state.angularVelocity.y * dt,
        state.angularVelocity.z * dt,
      );
      DELTA_QUATERNION.setFromEuler(EULER);
      state.orientation.multiply(DELTA_QUATERNION).normalize();

      updateAxes(state);

      state.targetForwardSpeed = MathUtils.clamp(
        state.targetForwardSpeed + input.speedAdjust * config.targetSpeedStepRate * dt,
        config.minCruiseSpeed,
        config.maxForwardSpeed,
      );

      let desiredForwardSpeed = state.targetForwardSpeed;
      if (input.brake) {
        desiredForwardSpeed = config.minCruiseSpeed;
      }
      if (input.boost) {
        desiredForwardSpeed = Math.min(
          config.maxForwardSpeed,
          desiredForwardSpeed + config.boostAcceleration * 0.35,
        );
      }

      ORIENTATION_INVERSE.copy(state.orientation).invert();
      LOCAL_VELOCITY.copy(state.velocity).applyQuaternion(ORIENTATION_INVERSE);
      state.forwardSpeed = Math.max(0, -LOCAL_VELOCITY.z);

      const speedError = desiredForwardSpeed - state.forwardSpeed;
      const desiredForwardAcceleration =
        speedError >= 0
          ? Math.min(speedError * config.linearResponseK, config.forwardAcceleration)
          : Math.max(speedError * config.linearResponseK, -config.brakeAcceleration);

      THRUST.copy(state.forward).multiplyScalar(desiredForwardAcceleration * massScale);

      DRAG_LOCAL.set(
        -LOCAL_VELOCITY.x * config.lateralDrag,
        -LOCAL_VELOCITY.y * config.verticalDrag,
        -LOCAL_VELOCITY.z * config.forwardDrag,
      );
      DRAG_WORLD.copy(DRAG_LOCAL).applyQuaternion(state.orientation).multiplyScalar(massScale);

      const rollAngle = currentRoll;
      BANK_FORCE
        .copy(state.right)
        .multiplyScalar(-Math.sin(rollAngle) * speed * config.bankingLiftFactor * 0.35 * massScale);

      const angleToVelocity = speed > 0.001 ? state.velocity.angleTo(state.forward) : 0;
      state.driftAngleDeg = MathUtils.radToDeg(angleToVelocity);
      if (state.driftAngleDeg > config.driftMaxAngleDeg) {
        driftTimer += dt;
      } else {
        driftTimer = 0;
      }

      DRIFT_CORRECTION.set(0, 0, 0);
      if (driftTimer >= config.driftCorrectionDelay && speed > 0.001) {
        LOOK_DIRECTION.copy(state.forward).multiplyScalar(speed);
        DRIFT_CORRECTION
          .copy(LOOK_DIRECTION.sub(state.velocity))
          .multiplyScalar(config.driftCorrectionStrength * massScale * 0.08);
      }

      state.acceleration
        .copy(THRUST)
        .add(DRAG_WORLD)
        .add(BANK_FORCE)
        .add(DRIFT_CORRECTION);

      const hoverError = HOVER_Y - state.position.y;
      state.acceleration.y += hoverError * config.hoverBalanceStrength * 0.1;
      state.acceleration.y += -state.velocity.y * config.hoverDamping * 0.2;

      state.velocity.addScaledVector(state.acceleration, dt);
      clampVelocity(state.velocity, state.orientation, config);
      state.position.addScaledVector(state.velocity, dt);
      state.speed = state.velocity.length();
      state.throttleLevel = MathUtils.clamp(state.targetForwardSpeed / config.maxForwardSpeed, 0, 1);

      if (state.position.y <= GROUND_LEVEL) {
        triggerGroundCrash(state, config);
        return;
      }

      if (input.speedAdjust === 0 && input.roll === 0) {
        state.angularVelocity.z = smoothTowards(
          state.angularVelocity.z,
          0,
          config.idleRollReturnK,
          dt,
        );
      }
    },

    getState() {
      return state;
    },
  };

  return api;
}

function smoothTowards(current: number, target: number, k: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

function updateAxes(state: FlightState) {
  state.forward.copy(FORWARD).applyQuaternion(state.orientation).normalize();
  state.right.copy(RIGHT).applyQuaternion(state.orientation).normalize();
  state.up.copy(UP).applyQuaternion(state.orientation).normalize();
}

function clampVelocity(velocity: Vector3, orientation: Quaternion, config: FlightConfigSet) {
  ORIENTATION_INVERSE.copy(orientation).invert();
  LOCAL_VELOCITY.copy(velocity).applyQuaternion(ORIENTATION_INVERSE);
  LOCAL_VELOCITY.z = MathUtils.clamp(LOCAL_VELOCITY.z, -config.maxForwardSpeed, config.maxReverseSpeed);
  velocity.copy(LOCAL_VELOCITY.applyQuaternion(orientation));

  if (velocity.lengthSq() < 0.0001) {
    velocity.copy(ZERO);
  }
}

function triggerGroundCrash(state: FlightState, config: FlightConfigSet) {
  state.isCrashed = true;
  state.crashTimer = CRASH_RESET_TIME;
  state.speed = 0;
  state.forwardSpeed = 0;
  state.throttleLevel = 0;
  state.position.y = GROUND_LEVEL;
  state.velocity.copy(ZERO);
  state.acceleration.copy(ZERO);
  state.angularVelocity.copy(ZERO);
  state.targetForwardSpeed = config.cruiseSpeed;
}

function resetFlightState(state: FlightState, config: FlightConfigSet) {
  state.isCrashed = false;
  state.crashTimer = 0;
  state.position.set(0, HOVER_Y, state.position.z);
  state.velocity.set(0, 0, -config.cruiseSpeed);
  state.acceleration.copy(ZERO);
  state.angularVelocity.copy(ZERO);
  state.orientation.identity();
  updateAxes(state);
  state.targetForwardSpeed = config.cruiseSpeed;
  state.forwardSpeed = config.cruiseSpeed;
  state.throttleLevel = config.cruiseSpeed / config.maxForwardSpeed;
  state.speed = config.cruiseSpeed;
  state.driftAngleDeg = 0;
}
