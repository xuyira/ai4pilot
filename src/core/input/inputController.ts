export type InputState = {
  speedAdjust: number;
  yaw: number;
  pitch: number;
  roll: number;
  boost: boolean;
  brake: boolean;
};

const INITIAL_INPUT: InputState = {
  speedAdjust: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  boost: false,
  brake: false,
};

export class InputController {
  private readonly pressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener("keydown", (event) => {
      this.pressed.add(event.code);
    });
    target.addEventListener("keyup", (event) => {
      this.pressed.delete(event.code);
    });
    target.addEventListener("blur", () => {
      this.pressed.clear();
    });
  }

  getState(): InputState {
    const speedAdjust = Number(this.isPressed("KeyW")) - Number(this.isPressed("KeyS"));
    const yaw = Number(this.isPressed("KeyD")) - Number(this.isPressed("KeyA"));
    const pitch = Number(this.isPressed("ArrowDown")) - Number(this.isPressed("ArrowUp"));
    const roll = Number(this.isPressed("KeyE")) - Number(this.isPressed("KeyQ"));

    return {
      ...INITIAL_INPUT,
      speedAdjust,
      yaw,
      pitch,
      roll,
      boost: this.isPressed("ShiftLeft") || this.isPressed("ShiftRight"),
      brake: this.isPressed("Space"),
    };
  }

  private isPressed(code: string) {
    return this.pressed.has(code);
  }
}
