import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { InputState } from "../input/inputController";
import type { FlightConfigSet } from "../../config/flight";

type FlightState = {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  orientation: Quaternion;
  angularVelocity: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  speed: number;
  driftAngleDeg: number;
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
const DELTA_QUATERNION = new Quaternion();
const LOOK_DIRECTION = new Vector3();
const ZERO = new Vector3();

export type FlightController = ReturnType<typeof createFlightController>;

export function createFlightController(initialConfig: FlightConfigSet) {
  const config = { ...initialConfig };
  const state: FlightState = {
    position: new Vector3(0, 8, 0),
    velocity: new Vector3(0, 0, -25),
    acceleration: new Vector3(),
    orientation: new Quaternion(),
    angularVelocity: new Vector3(),
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    speed: 25,
    driftAngleDeg: 0,
  };

  let driftTimer = 0;

  const api = {
    applyConfig(nextConfig: FlightConfigSet) {
      Object.assign(config, nextConfig);
    },

    update(dt: number, input: InputState) {
      const massScale = 1 / config.mass;
      const speed = state.velocity.length();
      const speedRatio = Math.min(speed / config.maxForwardSpeed, 1);

      const targetYaw = input.yaw * config.yawRate;
      const targetPitch = input.pitch * config.pitchRate;
      const targetManualRoll = input.roll * config.rollRate;
      const targetAutoBank =
        MathUtils.degToRad(-input.yaw * config.maxBankAngleDeg * (0.4 + speedRatio * config.bankBySpeedFactor));
      const currentRoll = new Euler().setFromQuaternion(state.orientation, "YXZ").z;
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

      let thrustAmount = input.throttle >= 0 ? input.throttle * config.forwardAcceleration : input.throttle * config.brakeAcceleration;
      if (input.brake) {
        thrustAmount -= config.brakeAcceleration;
      }
      if (input.boost && input.throttle > 0) {
        thrustAmount += config.boostAcceleration;
      }

      THRUST.copy(state.forward).multiplyScalar(thrustAmount * massScale);

      LOCAL_VELOCITY.copy(state.velocity).applyQuaternion(state.orientation.clone().invert());
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

      const hoverY = 8;
      const hoverError = hoverY - state.position.y;
      state.acceleration.y += hoverError * config.hoverBalanceStrength * 0.1;
      state.acceleration.y += -state.velocity.y * config.hoverDamping * 0.2;

      state.velocity.addScaledVector(state.acceleration, dt);
      clampVelocity(state.velocity, state.orientation, config);
      state.position.addScaledVector(state.velocity, dt);
      state.speed = state.velocity.length();

      if (input.throttle === 0 && input.roll === 0) {
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
  LOCAL_VELOCITY.copy(velocity).applyQuaternion(orientation.clone().invert());
  LOCAL_VELOCITY.z = MathUtils.clamp(LOCAL_VELOCITY.z, -config.maxReverseSpeed, config.maxForwardSpeed);
  velocity.copy(LOCAL_VELOCITY.applyQuaternion(orientation));

  if (velocity.lengthSq() < 0.0001) {
    velocity.copy(ZERO);
  }
}
