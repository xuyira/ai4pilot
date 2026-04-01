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
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
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
const ENVIRONMENT_COLOR = new Color();

const CHUNK_LENGTH = 180;
const ACTIVE_CHUNK_COUNT = 10;
const RECYCLE_DISTANCE = 2;
const THEME_SPAN = 3;

type RunwayTheme = "city" | "canyon" | "forest";

type RunwayChunk = {
  group: Group;
  chunkIndex: number;
  theme: RunwayTheme;
};

type ThemePalette = {
  background: number;
  fog: number;
  platform: number;
  lane: number;
  edge: number;
  ring: number;
  accent: number;
  side: number;
  detail: number;
};

const THEME_PALETTES: Record<RunwayTheme, ThemePalette> = {
  city: {
    background: 0x7bc1d1,
    fog: 0xbfe6ef,
    platform: 0xca4b2d,
    lane: 0xfff3de,
    edge: 0x8fe5ff,
    ring: 0xff9d3d,
    accent: 0xe26a3f,
    side: 0xe8f2f6,
    detail: 0x2f4d63,
  },
  canyon: {
    background: 0xb8d06d,
    fog: 0xe1bc68,
    platform: 0x7b2a18,
    lane: 0xf7fcff,
    edge: 0x98efff,
    ring: 0xffd43a,
    accent: 0xd46f31,
    side: 0xc86334,
    detail: 0x5d1f10,
  },
  forest: {
    background: 0xcde5ec,
    fog: 0x8fd0ef,
    platform: 0xe04f21,
    lane: 0xf6f8f2,
    edge: 0xeef8ff,
    ring: 0xffd57d,
    accent: 0x2a9b56,
    side: 0x5fd36e,
    detail: 0x163d24,
  },
};

const SHIP_HULL_MATERIAL = new MeshStandardMaterial({
  color: 0xf2f5f7,
  emissive: 0x172838,
  emissiveIntensity: 0.2,
  flatShading: true,
  metalness: 0.18,
  roughness: 0.32,
});
const SHIP_ACCENT_MATERIAL = new MeshStandardMaterial({
  color: 0xff6f3a,
  emissive: 0x7a2412,
  emissiveIntensity: 0.38,
  flatShading: true,
  metalness: 0.05,
  roughness: 0.45,
});
const SHIP_DARK_MATERIAL = new MeshStandardMaterial({
  color: 0x23384a,
  emissive: 0x0b141d,
  emissiveIntensity: 0.24,
  flatShading: true,
  metalness: 0.2,
  roughness: 0.55,
});
const SHIP_ENGINE_MATERIAL = new MeshStandardMaterial({
  color: 0xfff3d9,
  emissive: 0xffb354,
  emissiveIntensity: 1.6,
  flatShading: true,
  metalness: 0,
  roughness: 0.2,
});

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
  private readonly runwayRoot: Group;
  private readonly runwayChunks: RunwayChunk[] = [];
  private readonly config = flightConfig;
  private accumulator = 0;
  private previousTime = 0;
  private animationFrame = 0;
  private fps = 0;
  private currentTheme: RunwayTheme = "city";

  constructor(private readonly root: HTMLDivElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new Scene();
    this.scene.background = new Color(THEME_PALETTES.city.background);
    this.scene.fog = new Fog(THEME_PALETTES.city.fog, 110, 1180);

    this.camera = new PerspectiveCamera(
      this.config.camera.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      2600,
    );

    this.root.append(this.renderer.domElement);

    this.input = new InputController(window);
    this.controller = createFlightController(this.config.flight);
    this.hud = createHud(this.root);
    this.perfOverlay = createPerfOverlay(this.root);
    this.gui = new GUI({ title: "Flight Debug" });

    this.scene.add(new AmbientLight(0xf2f0ea, 1.15));
    const sun = new DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(18, 24, 12);
    this.scene.add(sun);
    const rim = new DirectionalLight(0xa8ecff, 0.7);
    rim.position.set(-14, 10, -24);
    this.scene.add(rim);

    this.runwayRoot = new Group();
    this.scene.add(this.runwayRoot);
    this.initializeRunway();

    this.ship = this.createShip();
    this.scene.add(this.ship);

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

  private initializeRunway() {
    for (let index = 0; index < ACTIVE_CHUNK_COUNT; index += 1) {
      const group = new Group();
      this.runwayRoot.add(group);
      const chunk: RunwayChunk = { group, chunkIndex: index, theme: "city" };
      this.rebuildChunk(chunk, index);
      this.runwayChunks.push(chunk);
    }
  }

  private createShip() {
    const ship = new Group();

    const fuselage = new Mesh(new BoxGeometry(1.25, 0.34, 3.7), SHIP_HULL_MATERIAL);
    fuselage.position.z = -0.1;
    ship.add(fuselage);

    const nose = new Mesh(new ConeGeometry(0.46, 1.45, 5), SHIP_ACCENT_MATERIAL);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -2.48;
    ship.add(nose);

    const canopy = new Mesh(new BoxGeometry(0.52, 0.25, 1.05), SHIP_DARK_MATERIAL);
    canopy.position.set(0, 0.22, -0.78);
    ship.add(canopy);

    const intake = new Mesh(new BoxGeometry(0.7, 0.18, 1.05), SHIP_DARK_MATERIAL);
    intake.position.set(0, -0.18, 0.6);
    ship.add(intake);

    const wingLeft = new Mesh(new BoxGeometry(3.7, 0.08, 1.18), SHIP_HULL_MATERIAL);
    wingLeft.position.set(-1.5, -0.06, -0.12);
    wingLeft.rotation.z = 0.12;
    wingLeft.rotation.y = -0.12;
    ship.add(wingLeft);

    const wingRight = wingLeft.clone();
    wingRight.position.x = 1.5;
    wingRight.rotation.z = -0.12;
    wingRight.rotation.y = 0.12;
    ship.add(wingRight);

    const forwardFinLeft = new Mesh(new BoxGeometry(0.72, 0.05, 1.2), SHIP_ACCENT_MATERIAL);
    forwardFinLeft.position.set(-0.82, 0.02, -1.44);
    forwardFinLeft.rotation.z = -0.28;
    ship.add(forwardFinLeft);

    const forwardFinRight = forwardFinLeft.clone();
    forwardFinRight.position.x = 0.82;
    forwardFinRight.rotation.z = 0.28;
    ship.add(forwardFinRight);

    const tail = new Mesh(new BoxGeometry(0.24, 0.95, 0.82), SHIP_DARK_MATERIAL);
    tail.position.set(0, 0.48, 1.2);
    ship.add(tail);

    const stabilizerLeft = new Mesh(new BoxGeometry(1.45, 0.08, 0.5), SHIP_HULL_MATERIAL);
    stabilizerLeft.position.set(-0.58, 0.14, 1.2);
    stabilizerLeft.rotation.z = 0.22;
    ship.add(stabilizerLeft);

    const stabilizerRight = stabilizerLeft.clone();
    stabilizerRight.position.x = 0.58;
    stabilizerRight.rotation.z = -0.22;
    ship.add(stabilizerRight);

    const engineLeft = new Mesh(new CylinderGeometry(0.1, 0.16, 0.56, 8), SHIP_ENGINE_MATERIAL);
    engineLeft.rotation.x = Math.PI / 2;
    engineLeft.position.set(-0.28, -0.04, 2.05);
    ship.add(engineLeft);

    const engineRight = engineLeft.clone();
    engineRight.position.x = 0.28;
    ship.add(engineRight);

    const engineGlowLeft = new Mesh(new SphereGeometry(0.14, 8, 8), SHIP_ENGINE_MATERIAL);
    engineGlowLeft.position.set(-0.28, -0.04, 2.34);
    ship.add(engineGlowLeft);

    const engineGlowRight = engineGlowLeft.clone();
    engineGlowRight.position.x = 0.28;
    ship.add(engineGlowRight);

    ship.scale.setScalar(1.7);
    ship.rotation.order = "YXZ";
    return ship;
  }

  private rebuildChunk(chunk: RunwayChunk, chunkIndex: number) {
    this.disposeChunk(chunk.group);
    chunk.group.clear();

    const theme = this.getThemeForChunkIndex(chunkIndex);
    const palette = THEME_PALETTES[theme];
    chunk.theme = theme;
    chunk.chunkIndex = chunkIndex;
    chunk.group.position.set(0, 0, -chunkIndex * CHUNK_LENGTH);

    const baseWidth = theme === "canyon" ? 36 : theme === "city" ? 48 : 42;
    const shoulderWidth = theme === "forest" ? 150 : 120;

    const floorMaterial = makeMaterial(palette.platform, 0x101820, 0.9, 0.06);
    const laneMaterial = makeMaterial(palette.lane, palette.lane, 0.2, 0.5);
    const edgeMaterial = makeMaterial(palette.edge, palette.edge, 0.3, 0.6);
    const sideMaterial = makeMaterial(palette.side, palette.detail, 0.8, 0.08);
    const accentMaterial = makeMaterial(palette.accent, palette.accent, 0.55, 0.35);
    const ringMaterial = makeMaterial(palette.ring, palette.ring, 0.35, 0.9);
    const detailMaterial = makeMaterial(palette.detail, 0x091018, 0.9, 0.02);

    const floor = new Mesh(new BoxGeometry(shoulderWidth, 4.4, CHUNK_LENGTH), floorMaterial);
    floor.position.set(0, -8.6, -CHUNK_LENGTH * 0.5);
    chunk.group.add(floor);

    const runway = new Mesh(new BoxGeometry(baseWidth, 2.8, CHUNK_LENGTH - 10), floorMaterial);
    runway.position.set(0, -5.8, -CHUNK_LENGTH * 0.5);
    chunk.group.add(runway);

    const laneLeft = new Mesh(new BoxGeometry(2.1, 0.16, CHUNK_LENGTH - 18), laneMaterial);
    laneLeft.position.set(-baseWidth * 0.22, -4.3, -CHUNK_LENGTH * 0.5);
    chunk.group.add(laneLeft);

    const laneRight = laneLeft.clone();
    laneRight.position.x = baseWidth * 0.22;
    chunk.group.add(laneRight);

    const edgeLeft = new Mesh(new BoxGeometry(0.48, 0.2, CHUNK_LENGTH - 16), edgeMaterial);
    edgeLeft.position.set(-baseWidth * 0.5, -4.24, -CHUNK_LENGTH * 0.5);
    chunk.group.add(edgeLeft);

    const edgeRight = edgeLeft.clone();
    edgeRight.position.x = baseWidth * 0.5;
    chunk.group.add(edgeRight);

    for (let i = 0; i < 3; i += 1) {
      const z = -36 - i * 48;
      const ring = new Mesh(new TorusGeometry(9.5, 0.82, 10, 28), ringMaterial);
      ring.position.set(seededRange(chunkIndex * 21 + i, -8, 8), 8 + ((chunkIndex + i) % 2) * 1.5, z);
      chunk.group.add(ring);
    }

    if (theme === "city") {
      this.populateCityChunk(chunk.group, chunkIndex, baseWidth, sideMaterial, detailMaterial, accentMaterial);
      return;
    }
    if (theme === "canyon") {
      this.populateCanyonChunk(chunk.group, chunkIndex, baseWidth, sideMaterial, detailMaterial, accentMaterial);
      return;
    }
    this.populateForestChunk(chunk.group, chunkIndex, baseWidth, sideMaterial, detailMaterial, accentMaterial);
  }

  private populateCityChunk(
    group: Group,
    chunkIndex: number,
    baseWidth: number,
    sideMaterial: MeshStandardMaterial,
    detailMaterial: MeshStandardMaterial,
    accentMaterial: MeshStandardMaterial,
  ) {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 5; i += 1) {
        const seed = chunkIndex * 31 + i * 11 + (side === -1 ? 3 : 7);
        const width = seededRange(seed, 8, 18);
        const depth = seededRange(seed + 1, 10, 18);
        const height = seededRange(seed + 2, 18, 58);
        const x = side * seededRange(seed + 3, baseWidth * 0.72, 70);
        const z = -20 - i * 32 - seededRange(seed + 4, 0, 12);

        const tower = new Mesh(new BoxGeometry(width, height, depth), sideMaterial);
        tower.position.set(x, height * 0.5 - 6.4, z);
        group.add(tower);

        const crown = new Mesh(new BoxGeometry(width * 0.55, 2.2, depth * 0.55), accentMaterial);
        crown.position.set(x, tower.position.y + height * 0.5 + 1.2, z);
        group.add(crown);
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const z = -58 - i * 66;
      const overpass = new Mesh(new BoxGeometry(baseWidth + 18, 2.2, 12), detailMaterial);
      overpass.position.set(0, 15 + i * 2, z);
      group.add(overpass);
    }
  }

  private populateCanyonChunk(
    group: Group,
    chunkIndex: number,
    baseWidth: number,
    sideMaterial: MeshStandardMaterial,
    detailMaterial: MeshStandardMaterial,
    accentMaterial: MeshStandardMaterial,
  ) {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i += 1) {
        const seed = chunkIndex * 41 + i * 17 + (side === -1 ? 5 : 13);
        const width = seededRange(seed, 16, 34);
        const height = seededRange(seed + 1, 24, 52);
        const depth = seededRange(seed + 2, 22, 42);
        const x = side * seededRange(seed + 3, baseWidth * 0.62, 34);
        const z = -24 - i * 36;

        const cliff = new Mesh(new BoxGeometry(width, height, depth), sideMaterial);
        cliff.position.set(x, height * 0.5 - 8.5, z);
        cliff.rotation.z = side * seededRange(seed + 4, 0.08, 0.22);
        group.add(cliff);

        const spur = new Mesh(new BoxGeometry(width * 0.55, height * 0.4, depth * 0.5), detailMaterial);
        spur.position.set(x - side * width * 0.25, cliff.position.y + height * 0.18, z - depth * 0.18);
        spur.rotation.z = -side * 0.14;
        group.add(spur);
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const z = -44 - i * 62;
      const gateway = new Mesh(new BoxGeometry(baseWidth + 8, 1.8, 10), accentMaterial);
      gateway.position.set(0, 10 + i * 2.5, z);
      group.add(gateway);

      const pillarLeft = new Mesh(new BoxGeometry(4.2, 18, 7), detailMaterial);
      pillarLeft.position.set(-(baseWidth * 0.5 + 3), 0.5, z);
      group.add(pillarLeft);

      const pillarRight = pillarLeft.clone();
      pillarRight.position.x = baseWidth * 0.5 + 3;
      group.add(pillarRight);
    }
  }

  private populateForestChunk(
    group: Group,
    chunkIndex: number,
    baseWidth: number,
    sideMaterial: MeshStandardMaterial,
    detailMaterial: MeshStandardMaterial,
    accentMaterial: MeshStandardMaterial,
  ) {
    const grass = new Mesh(new BoxGeometry(190, 1.8, CHUNK_LENGTH), sideMaterial);
    grass.position.set(0, -7.9, -CHUNK_LENGTH * 0.5);
    group.add(grass);

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 8; i += 1) {
        const seed = chunkIndex * 59 + i * 13 + (side === -1 ? 9 : 19);
        const trunkHeight = seededRange(seed, 4, 8);
        const crownHeight = seededRange(seed + 1, 7, 14);
        const x = side * seededRange(seed + 2, baseWidth * 0.72, 84);
        const z = -14 - i * 20 - seededRange(seed + 3, 0, 8);

        const trunk = new Mesh(new CylinderGeometry(0.55, 0.75, trunkHeight, 6), detailMaterial);
        trunk.position.set(x, trunkHeight * 0.5 - 6.8, z);
        group.add(trunk);

        const crown = new Mesh(new ConeGeometry(crownHeight * 0.5, crownHeight, 6), accentMaterial);
        crown.position.set(x, trunk.position.y + trunkHeight * 0.5 + crownHeight * 0.4, z);
        group.add(crown);
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const z = -50 - i * 58;
      const bridge = new Mesh(new BoxGeometry(baseWidth + 10, 1.6, 9), detailMaterial);
      bridge.position.set(0, 12 + i * 1.8, z);
      group.add(bridge);

      const supportLeft = new Mesh(new BoxGeometry(3.6, 16, 4.8), detailMaterial);
      supportLeft.position.set(-(baseWidth * 0.5 + 4), 0.3, z);
      group.add(supportLeft);

      const supportRight = supportLeft.clone();
      supportRight.position.x = baseWidth * 0.5 + 4;
      group.add(supportRight);
    }
  }

  private disposeChunk(group: Group) {
    group.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    });
  }

  private getThemeForChunkIndex(chunkIndex: number): RunwayTheme {
    const band = Math.floor(chunkIndex / THEME_SPAN);
    const rotation = band % 3;
    if (rotation === 0) {
      return "city";
    }
    if (rotation === 1) {
      return "canyon";
    }
    return "forest";
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

    this.updateRunway(state.position.z);
    this.updateEnvironment(dt, state.position.z);
    this.updateCamera(dt);
  }

  private updateRunway(playerZ: number) {
    const playerChunk = Math.max(0, Math.floor(-playerZ / CHUNK_LENGTH));
    let maxChunkIndex = playerChunk;
    for (const chunk of this.runwayChunks) {
      if (chunk.chunkIndex > maxChunkIndex) {
        maxChunkIndex = chunk.chunkIndex;
      }
    }

    for (const chunk of this.runwayChunks) {
      if (chunk.chunkIndex < playerChunk - RECYCLE_DISTANCE) {
        maxChunkIndex += 1;
        this.rebuildChunk(chunk, maxChunkIndex);
      }
    }

    this.currentTheme = this.getThemeForChunkIndex(playerChunk);
  }

  private updateEnvironment(dt: number, playerZ: number) {
    const palette = THEME_PALETTES[this.getThemeForChunkIndex(Math.max(0, Math.floor(-playerZ / CHUNK_LENGTH)))];
    ENVIRONMENT_COLOR.setHex(palette.background);
    const background = this.scene.background;
    if (background instanceof Color) {
      background.lerp(ENVIRONMENT_COLOR, 1 - Math.exp(-1.6 * dt));
    }

    ENVIRONMENT_COLOR.setHex(palette.fog);
    if (this.scene.fog) {
      this.scene.fog.color.lerp(ENVIRONMENT_COLOR, 1 - Math.exp(-1.8 * dt));
    }
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
      -inputState.yaw * 0.85,
      this.config.camera.cameraFollowHeight + 0.12 + speedRatio * 0.2,
      this.config.camera.cameraFollowDistance - 3.2 + speedRatio * 0.8,
    );
    CAMERA_OFFSET.copy(LOCAL_CAMERA_OFFSET).applyQuaternion(state.orientation);
    CAMERA_TARGET.copy(state.position).add(CAMERA_OFFSET);

    SHIP_DRIFT.copy(state.right).multiplyScalar(-inputState.yaw * 0.55);
    CAMERA_TARGET.add(SHIP_DRIFT);

    const cameraBlend = 1 - Math.exp(-this.config.camera.cameraPositionLagK * dt);
    this.camera.position.lerp(CAMERA_TARGET, cameraBlend);

    VELOCITY_LOOK.copy(state.velocity);
    if (VELOCITY_LOOK.lengthSq() < 0.0001) {
      VELOCITY_LOOK.copy(state.forward);
    } else {
      VELOCITY_LOOK.normalize();
    }

    FORWARD_LOOK.copy(state.forward).multiplyScalar(10.5);
    UP_LOOK.copy(state.up).multiplyScalar(0.5);
    const lookTarget = LOOK_POINT.copy(state.position)
      .add(FORWARD_LOOK)
      .add(UP_LOOK)
      .add(VELOCITY_LOOK.multiplyScalar(3.2));
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
      zoneLabel: this.currentTheme.toUpperCase(),
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

function seededValue(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function seededRange(seed: number, min: number, max: number) {
  return min + (max - min) * seededValue(seed);
}

function makeMaterial(color: number, emissive: number, roughness: number, emissiveIntensity: number) {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    flatShading: true,
    metalness: 0.08,
    roughness,
  });
}
