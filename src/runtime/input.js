const keyMap = new Map([
  ["ArrowUp", "up"],
  ["KeyW", "up"],
  ["ArrowDown", "down"],
  ["KeyS", "down"],
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
  ["ArrowRight", "right"],
  ["KeyD", "right"],
  ["KeyZ", "fire"],
  ["Space", "fire"],
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.usingGamepad = false;
    this.state = {
      x: 0,
      y: 0,
      fire: false,
    };

    window.addEventListener("keydown", (event) => {
      if (keyMap.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        this.usingGamepad = false;
      }
    });

    window.addEventListener("keyup", (event) => {
      if (keyMap.has(event.code)) {
        event.preventDefault();
        this.keys.delete(event.code);
      }
    });

    const update = () => {
      this.readKeyboard();
      this.readGamepad();
      requestAnimationFrame(update);
    };

    update();
  }

  readKeyboard() {
    const active = new Set([...this.keys].map((code) => keyMap.get(code)));
    this.state.x = Number(active.has("right")) - Number(active.has("left"));
    this.state.y = Number(active.has("down")) - Number(active.has("up"));
    this.state.fire = active.has("fire");
  }

  readGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find(Boolean);

    if (!pad) {
      return;
    }

    const axisX = Math.abs(pad.axes[0] ?? 0) > 0.22 ? pad.axes[0] : 0;
    const axisY = Math.abs(pad.axes[1] ?? 0) > 0.22 ? pad.axes[1] : 0;
    const dpadX = Number(pad.buttons[15]?.pressed) - Number(pad.buttons[14]?.pressed);
    const dpadY = Number(pad.buttons[13]?.pressed) - Number(pad.buttons[12]?.pressed);
    const fire = Boolean(pad.buttons[0]?.pressed || pad.buttons[5]?.pressed || pad.buttons[7]?.pressed);

    if (axisX || axisY || dpadX || dpadY || fire) {
      this.usingGamepad = true;
      this.state.x = dpadX || axisX;
      this.state.y = dpadY || axisY;
      this.state.fire = fire;
    }
  }
}
