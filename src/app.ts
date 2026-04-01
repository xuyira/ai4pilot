import GUI from "lil-gui";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  GridHelper,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { flightConfig, getPreset, type FlightConfigName } from "./config/flight";
import { InputController } from "./core/input/inputController";
import { createFlightController, type FlightController } from "./core/physics/flightController";
import { createHud } from "./ui/hud";
import { createPerfOverlay, type PerfOverlay } from "./ui/perfOverlay";

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 1 / 20;
const MAX_SUB_STEPS = 5;
const WORLD_UP = new Vector3(0, 1, 0);
const CAMERA_OFFSET = new Vector3();
const CAMERA_TARGET = new Vector3();
const LOOK_POINT = new Vector3();
const CAMERA_FORWARD = new Vector3();
const LOOK_MATRIX = new Matrix4();
const VELOCITY_LOOK = new Vector3();
const LOCAL_CAMERA_OFFSET = new Vector3();
const SHIP_DRIFT = new Vector3();
const FORWARD_LOOK = new Vector3();
const UP_LOOK = new Vector3();

export class App {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly controller: FlightController;
  private readonly input: InputController;
  private readonly hud: ReturnType<typeof createHud>;
  private readonly perfOverlay: PerfOverlay;
  private readonly gui: GUI;
  private readonly ship: Group;
  private readonly arenaRefs: Group;
  private readonly config = flightConfig;
  private accumulator = 0;
  private previousTime = 0;
  private animationFrame = 0;
  private fps = 0;

  constructor(private readonly root: HTMLDivElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new Scene();
    this.scene.background = new Color(0x0b1218);
    this.scene.fog = new Fog(0x0b1218, 150, 1250);

    this.camera = new PerspectiveCamera(
      this.config.camera.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      2400,
    );

    this.root.append(this.renderer.domElement);

    this.input = new InputController(window);
    this.controller = createFlightController(this.config.flight);
    this.hud = createHud(this.root);
    this.perfOverlay = createPerfOverlay(this.root);
    this.gui = new GUI({ title: "Flight Debug" });

    this.scene.add(new AmbientLight(0xc9d7e2, 0.95));
    const sun = new DirectionalLight(0xd6e5ef, 2.15);
    sun.position.set(18, 22, 10);
    this.scene.add(sun);
    const rim = new DirectionalLight(0xffc17a, 0.65);
    rim.position.set(-12, 8, -20);
    this.scene.add(rim);

    const groundGrid = new GridHelper(1800, 120, 0x395c70, 0x162432);
    groundGrid.position.y = -2.2;
    this.scene.add(groundGrid);

    this.ship = this.createShip();
    this.scene.add(this.ship);

    this.arenaRefs = this.createArenaReferences();
    this.scene.add(this.arenaRefs);

    this.setupGui();
    this.handleResize = this.handleResize.bind(this);
    this.frame = this.frame.bind(this);
  }

  start() {
    window.addEventListener("resize", this.handleResize);
    this.handleResize();
    this.previousTime = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.frame);
  }

  stop() {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    this.gui.destroy();
  }

  private createShip() {
    const ship = new Group();

    const hullMaterial = new MeshStandardMaterial({
      color: 0x7f95a7,
      emissive: 0x111c28,
      emissiveIntensity: 0.35,
      flatShading: true,
      metalness: 0.38,
      roughness: 0.5,
    });
    const accentMaterial = new MeshStandardMaterial({
      color: 0xd7e4ee,
      emissive: 0x30404f,
      emissiveIntensity: 0.35,
      flatShading: true,
      metalness: 0.18,
      roughness: 0.35,
    });
    const engineMaterial = new MeshStandardMaterial({
      color: 0xffd3a0,
      emissive: 0xff9f3f,
      emissiveIntensity: 1.25,
      flatShading: true,
      metalness: 0,
      roughness: 0.3,
    });

    const fuselage = new Mesh(new BoxGeometry(0.9, 0.42, 3.2), hullMaterial);
    fuselage.position.z = -0.2;
    ship.add(fuselage);

    const nose = new Mesh(new ConeGeometry(0.42, 1.15, 5), accentMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -2.15;
    ship.add(nose);

    const cockpit = new Mesh(new BoxGeometry(0.45, 0.22, 0.8), accentMaterial);
    cockpit.position.set(0, 0.28, -0.65);
    ship.add(cockpit);

    const wingLeft = new Mesh(new BoxGeometry(2.6, 0.08, 0.9), hullMaterial);
    wingLeft.position.set(-1.05, -0.02, -0.2);
    wingLeft.rotation.z = 0.08;
    ship.add(wingLeft);

    const wingRight = wingLeft.clone();
    wingRight.position.x = 1.05;
    wingRight.rotation.z = -0.08;
    ship.add(wingRight);

    const tail = new Mesh(new BoxGeometry(0.22, 0.9, 0.55), hullMaterial);
    tail.position.set(0, 0.45, 1.15);
    ship.add(tail);

    const stabilizerLeft = new Mesh(new BoxGeometry(1.1, 0.08, 0.42), hullMaterial);
    stabilizerLeft.position.set(-0.46, 0.16, 1.1);
    stabilizerLeft.rotation.z = 0.2;
    ship.add(stabilizerLeft);

    const stabilizerRight = stabilizerLeft.clone();
    stabilizerRight.position.x = 0.46;
    stabilizerRight.rotation.z = -0.2;
    ship.add(stabilizerRight);

    const engineLeft = new Mesh(new CylinderGeometry(0.09, 0.12, 0.42, 8), engineMaterial);
    engineLeft.rotation.x = Math.PI / 2;
    engineLeft.position.set(-0.24, -0.06, 1.72);
    ship.add(engineLeft);

    const engineRight = engineLeft.clone();
    engineRight.position.x = 0.24;
    ship.add(engineRight);

    ship.rotation.order = "YXZ";
    return ship;
  }

  private createArenaReferences() {
    const group = new Group();
    const pylonMaterial = new MeshStandardMaterial({
      color: 0x3b4d5c,
      emissive: 0x121e28,
      emissiveIntensity: 0.25,
      flatShading: true,
      roughness: 0.8,
    });
    const accentMaterial = new MeshStandardMaterial({
      color: 0xffc17a,
      emissive: 0xb96d17,
      emissiveIntensity: 0.55,
      flatShading: true,
      roughness: 0.4,
    });
    const slabMaterial = new MeshStandardMaterial({
      color: 0x202d39,
      emissive: 0x0b141b,
      emissiveIntensity: 0.18,
      flatShading: true,
      roughness: 0.9,
    });

    for (let i = 0; i < 20; i += 1) {
      const slab = new Mesh(new BoxGeometry(180, 4, 40), slabMaterial);
      slab.position.set(0, -6.6, -i * 110 - 40);
      group.add(slab);
    }

    for (let lane = -2; lane <= 2; lane += 1) {
      for (let i = 0; i < 16; i += 1) {
        const pylon = new Mesh(new BoxGeometry(5.5, 12 + (i % 3) * 5, 5.5), pylonMaterial);
        pylon.position.set(lane * 40 + ((i % 2) * 8 - 4), 0.5, -i * 115 - 70);
        group.add(pylon);
      }
    }

    for (let i = 0; i < 10; i += 1) {
      const gate = new Mesh(new TorusGeometry(11 + (i % 2) * 2, 0.9, 10, 24), accentMaterial);
      gate.position.set(((i % 3) - 1) * 26, 8.5 + (i % 2) * 2.5, -i * 180 - 120);
      gate.rotation.x = Math.PI / 2;
      group.add(gate);

      const leftWall = new Mesh(new BoxGeometry(6, 20, 10), pylonMaterial);
      leftWall.position.set(gate.position.x - 18, 1, gate.position.z);
      group.add(leftWall);

      const rightWall = leftWall.clone();
      rightWall.position.x = gate.position.x + 18;
      group.add(rightWall);
    }

    return group;
  }

  private setupGui() {
    const flightFolder = this.gui.addFolder("Flight");
    flightFolder.add(this.config.flight, "mass", 0.6, 2.5, 0.01).onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "cruiseSpeed", 80, 220, 1)
      .name("cruise")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "minCruiseSpeed", 40, 120, 1)
      .name("min cruise")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "targetSpeedStepRate", 30, 180, 1)
      .name("speed step")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "linearResponseK", 4, 18, 0.1)
      .name("linear K")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "angularResponseK", 5, 24, 0.1)
      .name("angular K")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "forwardAcceleration", 40, 180, 1)
      .name("accel")
      .onChange(this.syncFlightConfig);
    flightFolder
      .add(this.config.flight, "brakeAcceleration", 50, 220, 1)
      .name("brake")
      .onChange(this.syncFlightConfig);
    flightFolder.add(this.config.flight, "forwardDrag", 0.05, 0.5, 0.01).onChange(this.syncFlightConfig);
    flightFolder.add(this.config.flight, "lateralDrag", 0.6, 2.5, 0.05).onChange(this.syncFlightConfig);
    flightFolder.add(this.config.flight, "maxBankAngleDeg", 20, 65, 1).onChange(this.syncFlightConfig);
    flightFolder.add(this.config.flight, "driftMaxAngleDeg", 10, 45, 1).onChange(this.syncFlightConfig);

    const cameraFolder = this.gui.addFolder("Camera");
    cameraFolder.add(this.config.camera, "baseFov", 65, 90, 1);
    cameraFolder.add(this.config.camera, "maxFov", 90, 120, 1);
    cameraFolder.add(this.config.camera, "cameraPositionLagK", 2, 14, 0.1);
    cameraFolder.add(this.config.camera, "cameraLookLagK", 3, 18, 0.1);

    const presetState: { preset: FlightConfigName } = { preset: "medium" };
    this.gui
      .add(presetState, "preset", ["light", "medium", "heavy"] as FlightConfigName[])
      .name("preset")
      .onChange((value: FlightConfigName) => {
        const preset = getPreset(value);
        Object.assign(this.config.flight, preset);
        this.syncFlightConfig();
        this.refreshGui();
      });
  }

  private readonly syncFlightConfig = () => {
    this.controller.applyConfig(this.config.flight);
  };

  private refreshGui() {
    for (const controller of this.gui.controllersRecursive()) {
      controller.updateDisplay();
    }
  }

  private frame(now: number) {
    const rawDt = (now - this.previousTime) / 1000;
    this.previousTime = now;
    const frameDt = Math.min(rawDt, MAX_FRAME_DT);
    this.fps = frameDt > 0 ? 1 / frameDt : 0;
    this.accumulator += frameDt;

    let simulationCost = 0;
    let subSteps = 0;
    while (this.accumulator >= FIXED_DT && subSteps < MAX_SUB_STEPS) {
      const before = performance.now();
      this.controller.update(FIXED_DT, this.input.getState());
      simulationCost += performance.now() - before;
      this.accumulator -= FIXED_DT;
      subSteps += 1;
    }

    this.updateScene(frameDt);
    this.renderer.render(this.scene, this.camera);
    this.updateHud(simulationCost);

    this.animationFrame = window.requestAnimationFrame(this.frame);
  }

  private updateScene(dt: number) {
    const state = this.controller.getState();
    this.ship.position.copy(state.position);
    this.ship.quaternion.copy(state.orientation);

    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    const state = this.controller.getState();
    const inputState = this.input.getState();
    const speedRatio = Math.min(state.speed / this.config.camera.speedForMaxFov, 1);
    const targetFov =
      this.config.camera.baseFov +
      (this.config.camera.maxFov - this.config.camera.baseFov) * speedRatio;
    const fovBlend = 1 - Math.exp(-this.config.camera.fovResponseK * dt);
    this.camera.fov += (targetFov - this.camera.fov) * fovBlend;
    this.camera.updateProjectionMatrix();

    LOCAL_CAMERA_OFFSET.set(
      -inputState.yaw * 1.2,
      this.config.camera.cameraFollowHeight + 0.6 + speedRatio * 0.55,
      this.config.camera.cameraFollowDistance + 2.8 + speedRatio * 2.4,
    );
    CAMERA_OFFSET.copy(LOCAL_CAMERA_OFFSET).applyQuaternion(state.orientation);
    CAMERA_TARGET.copy(state.position).add(CAMERA_OFFSET);

    SHIP_DRIFT.copy(state.right).multiplyScalar(-inputState.yaw * 1.35);
    CAMERA_TARGET.add(SHIP_DRIFT);

    const cameraBlend = 1 - Math.exp(-this.config.camera.cameraPositionLagK * dt);
    this.camera.position.lerp(CAMERA_TARGET, cameraBlend);

    VELOCITY_LOOK.copy(state.velocity);
    if (VELOCITY_LOOK.lengthSq() < 0.0001) {
      VELOCITY_LOOK.copy(state.forward);
    } else {
      VELOCITY_LOOK.normalize();
    }

    FORWARD_LOOK.copy(state.forward).multiplyScalar(18);
    UP_LOOK.copy(state.up).multiplyScalar(1.2);
    const lookTarget = LOOK_POINT.copy(state.position).add(FORWARD_LOOK).add(UP_LOOK).add(VELOCITY_LOOK.multiplyScalar(8));
    const lookBlend = 1 - Math.exp(-this.config.camera.cameraLookLagK * dt);

    const currentForward = CAMERA_FORWARD.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    currentForward.lerp(lookTarget.sub(this.camera.position).normalize(), lookBlend).normalize();
    LOOK_MATRIX.lookAt(this.camera.position, LOOK_POINT.copy(this.camera.position).add(currentForward), WORLD_UP);
    this.camera.quaternion.setFromRotationMatrix(LOOK_MATRIX);
  }

  private updateHud(simulationCost: number) {
    const state = this.controller.getState();
    this.hud.update({
      speed: state.speed,
      targetSpeed: state.targetForwardSpeed,
      throttlePercent: state.throttleLevel * 100,
      driftAngleDeg: state.driftAngleDeg,
      altitude: state.position.y,
      presetMass: this.config.flight.mass,
      status: state.isCrashed ? "CRASH" : "FLY",
      keysHint: "W/S 调目标速度, A/D 偏航, 方向键俯仰, Q/E 横滚, Space 空气刹车, Shift 冲刺",
    });
    this.perfOverlay.update({
      fps: Math.round(this.fps),
      simMs: simulationCost,
      drawCalls: this.renderer.info.render.calls,
      speedLines: 0,
    });
  }

  private handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
