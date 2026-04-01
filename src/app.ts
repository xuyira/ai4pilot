import GUI from "lil-gui";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { flightConfig, getPreset, type FlightConfigName } from "./config/flight";
import { createFlightController, type FlightController } from "./core/physics/flightController";
import { InputController } from "./core/input/inputController";
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

type ParticleField = {
  geometry: BufferGeometry;
  positions: Float32Array;
  lineLength: number;
  lineCount: number;
};

export class App {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly controller: FlightController;
  private readonly input: InputController;
  private readonly hud: ReturnType<typeof createHud>;
  private readonly perfOverlay: PerfOverlay;
  private readonly gui: GUI;
  private readonly ship: Mesh;
  private readonly speedLines: LineSegments;
  private readonly particleField: ParticleField;
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
    this.scene.background = new Color(0x020611);

    this.camera = new PerspectiveCamera(
      this.config.camera.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      1600,
    );

    this.root.append(this.renderer.domElement);

    this.input = new InputController(window);
    this.controller = createFlightController(this.config.flight);
    this.hud = createHud(this.root);
    this.perfOverlay = createPerfOverlay(this.root);
    this.gui = new GUI({ title: "Flight Debug" });

    this.scene.add(new AmbientLight(0xffffff, 1.2));
    this.scene.add(new GridHelper(240, 48, 0x1b3d6d, 0x0e1a2f));

    this.ship = this.createShip();
    this.scene.add(this.ship);

    this.particleField = this.createParticleField();
    this.speedLines = new LineSegments(
      this.particleField.geometry,
      new LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(this.speedLines);

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
    const geometry = new BoxGeometry(0.8, 0.35, 2.6);
    geometry.translate(0, 0, -0.2);
    const material = new MeshBasicMaterial({ color: 0x55e8ff, wireframe: true });
    return new Mesh(geometry, material);
  }

  private createParticleField(): ParticleField {
    const lineCount = this.config.effects.speedLineCount;
    const lineLength = this.config.effects.speedLineLength;
    const positions = new Float32Array(lineCount * 2 * 3);
    const geometry = new BufferGeometry();

    for (let i = 0; i < lineCount; i += 1) {
      this.resetParticle(i, positions);
    }

    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return { geometry, positions, lineLength, lineCount };
  }

  private resetParticle(index: number, positions: Float32Array) {
    const radius = this.config.effects.speedLineSpawnRadius;
    const x = (Math.random() - 0.5) * radius * 2;
    const y = (Math.random() - 0.5) * radius * 1.2;
    const z = -Math.random() * 90;
    const offset = index * 6;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x;
    positions[offset + 4] = y;
    positions[offset + 5] = z + this.config.effects.speedLineLength;
  }

  private setupGui() {
    const flightFolder = this.gui.addFolder("Flight");
    flightFolder.add(this.config.flight, "mass", 0.6, 2.5, 0.01).onChange(this.syncFlightConfig);
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
      .name("thrust")
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
    this.updateSpeedLines(dt);
  }

  private updateCamera(dt: number) {
    const state = this.controller.getState();
    const speedRatio = Math.min(state.speed / this.config.camera.speedForMaxFov, 1);
    const targetFov =
      this.config.camera.baseFov +
      (this.config.camera.maxFov - this.config.camera.baseFov) * speedRatio;
    const fovBlend = 1 - Math.exp(-this.config.camera.fovResponseK * dt);
    this.camera.fov += (targetFov - this.camera.fov) * fovBlend;
    this.camera.updateProjectionMatrix();

    CAMERA_OFFSET.set(0, this.config.camera.cameraFollowHeight, this.config.camera.cameraFollowDistance);
    CAMERA_OFFSET.applyQuaternion(state.orientation);
    CAMERA_OFFSET.multiplyScalar(1);
    CAMERA_TARGET.copy(state.position).add(CAMERA_OFFSET);

    const cameraBlend = 1 - Math.exp(-this.config.camera.cameraPositionLagK * dt);
    this.camera.position.lerp(CAMERA_TARGET, cameraBlend);

    const forward = state.forward.clone().multiplyScalar(18);
    const lookTarget = LOOK_POINT.copy(state.position).add(forward);
    const lookBlend = 1 - Math.exp(-this.config.camera.cameraLookLagK * dt);

    const currentForward = CAMERA_FORWARD.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    currentForward.lerp(lookTarget.sub(this.camera.position).normalize(), lookBlend).normalize();
    LOOK_MATRIX.lookAt(this.camera.position, LOOK_POINT.copy(this.camera.position).add(currentForward), WORLD_UP);
    this.camera.quaternion.setFromRotationMatrix(LOOK_MATRIX);
  }

  private updateSpeedLines(dt: number) {
    const state = this.controller.getState();
    const speedRatio = Math.min(state.speed / this.config.camera.speedForMaxFov, 1);
    const moveSpeed =
      30 + state.speed * this.config.effects.speedLineSpeedFactor + 40 * speedRatio;
    const positions = this.particleField.positions;
    const radius = this.config.effects.speedLineSpawnRadius;
    const resetZ = 5;
    const farZ = -90;

    for (let i = 0; i < this.particleField.lineCount; i += 1) {
      const offset = i * 6;
      positions[offset + 2] += moveSpeed * dt;
      positions[offset + 5] += moveSpeed * dt;

      if (positions[offset + 2] > resetZ) {
        positions[offset] = (Math.random() - 0.5) * radius * 2;
        positions[offset + 1] = (Math.random() - 0.5) * radius * 1.2;
        positions[offset + 2] = farZ - Math.random() * 20;
        positions[offset + 3] = positions[offset];
        positions[offset + 4] = positions[offset + 1];
        positions[offset + 5] = positions[offset + 2] + this.particleField.lineLength;
      }
    }

    this.speedLines.position.copy(this.camera.position);
    this.speedLines.quaternion.copy(this.camera.quaternion);
    this.particleField.geometry.attributes.position.needsUpdate = true;
  }

  private updateHud(simulationCost: number) {
    const state = this.controller.getState();
    this.hud.update({
      speed: state.speed,
      driftAngleDeg: state.driftAngleDeg,
      altitude: state.position.y,
      presetMass: this.config.flight.mass,
      keysHint: "W/S 推进刹车, A/D 偏航, 鼠标或方向键俯仰/横滚, Shift 冲刺",
    });
    this.perfOverlay.update({
      fps: Math.round(this.fps),
      simMs: simulationCost,
      drawCalls: this.renderer.info.render.calls,
      speedLines: this.particleField.lineCount,
    });
  }

  private handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
