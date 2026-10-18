import { InputButton } from "@janissary/shared";

const keyToButton = new Map<string, InputButton>([
  ["KeyW", InputButton.Forward],
  ["ArrowUp", InputButton.Forward],
  ["KeyS", InputButton.Backward],
  ["ArrowDown", InputButton.Backward],
  ["KeyA", InputButton.Left],
  ["ArrowLeft", InputButton.Left],
  ["KeyD", InputButton.Right],
  ["ArrowRight", InputButton.Right],
  ["KeyR", InputButton.Reload],
  ["KeyF", InputButton.Interact],
  ["KeyC", InputButton.Crouch],
  ["KeyG", InputButton.Torch],
  ["KeyB", InputButton.RaiseEarthwork],
  ["KeyN", InputButton.DigEarthwork],
  ["Space", InputButton.Jump],
  // Melee attack (Phase 8e-7): moved off right-click — RMB is now aim-down-
  // sights. With a blade equipped left-click also swings (server resolves the
  // same path); with a firearm equipped this is the butt stroke.
  ["KeyE", InputButton.Melee],
  // Weapon slots 1/2/3 (Phase 8e-3): blade / primary / sidearm.
  ["Digit1", InputButton.Slot1],
  ["Numpad1", InputButton.Slot1],
  ["Digit2", InputButton.Slot2],
  ["Numpad2", InputButton.Slot2],
  ["Digit3", InputButton.Slot3],
  ["Numpad3", InputButton.Slot3],
]);

/**
 * Client-side-only action keys (never sent on the wire). The view toggle is
 * deliberately NOT an InputButton — the server does not need to know about it.
 */
const keyToAction = new Map<string, "toggle-view">([
  ["KeyV", "toggle-view"],
]);

export class InputController {
  readonly #element: HTMLElement;
  readonly #pressed = new Set<InputButton>();
  #yaw = 0;
  #pitch = 0;
  #disposed = false;
  #textInputActive = false;
  #sensitivity = 0.002;
  // Phase 8e-7: ADS sensitivity multiplier (tan-ratio of aimed to base FOV),
  // fed per frame by GameClient. 1 = unscaled.
  #aimScale = 1;
  #locked = false;
  #onViewToggle: (() => void) | undefined;

  constructor(element: HTMLElement) {
    this.#element = element;
    window.addEventListener("keydown", this.#onKeyDown);
    window.addEventListener("keyup", this.#onKeyUp);
    window.addEventListener("blur", this.#onBlur);
    document.addEventListener("mousemove", this.#onMouseMove);
    document.addEventListener("mousedown", this.#onMouseDown);
    document.addEventListener("mouseup", this.#onMouseUp);
    document.addEventListener("pointerlockchange", this.#onPointerLockChange);
    document.addEventListener("pointerlockerror", this.#onPointerLockError);
    element.addEventListener("click", this.#onClick);
    // Right-click is ADS (Phase 8e-7): the context menu must never fire on the
    // game surface, locked or not (the menu can still pop during lock edge
    // transitions on some platforms).
    element.addEventListener("contextmenu", this.#onContextMenu);
    this.#locked = document.pointerLockElement === this.#element;
  }

  get buttons(): number {
    let value = 0;
    for (const button of this.#pressed) value |= button;
    return value;
  }

  get yaw(): number {
    return this.#yaw;
  }

  get pitch(): number {
    return this.#pitch;
  }

  get locked(): boolean {
    return this.#locked;
  }

  requestLock(): void {
    if (this.#textInputActive || document.pointerLockElement === this.#element) return;
    const result = this.#element.requestPointerLock();
    if (result !== undefined && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((reason: unknown) => {
        console.warn("Pointer lock request rejected — firing and look stay disabled until the game is clicked again.", reason);
      });
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.#element) document.exitPointerLock();
    this.#pressed.clear();
  }

  onViewToggle(callback: (() => void) | undefined): void {
    this.#onViewToggle = callback;
  }

  setTextInputActive(active: boolean): void {
    this.#textInputActive = active;
    if (active) this.#pressed.clear();
  }

  setSensitivity(sensitivity: number): void {
    this.#sensitivity = Math.max(0.0005, Math.min(0.01, sensitivity));
  }

  /** ADS zoom sensitivity multiplier (Phase 8e-7); 1 when not aiming. */
  setAimScale(scale: number): void {
    this.#aimScale = Math.max(0.2, Math.min(1, scale));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener("keydown", this.#onKeyDown);
    window.removeEventListener("keyup", this.#onKeyUp);
    window.removeEventListener("blur", this.#onBlur);
    document.removeEventListener("mousemove", this.#onMouseMove);
    document.removeEventListener("mousedown", this.#onMouseDown);
    document.removeEventListener("mouseup", this.#onMouseUp);
    document.removeEventListener("pointerlockchange", this.#onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.#onPointerLockError);
    this.#element.removeEventListener("click", this.#onClick);
    this.#element.removeEventListener("contextmenu", this.#onContextMenu);
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (this.#textInputActive) return;
    const button = keyToButton.get(event.code);
    if (button !== undefined) {
      event.preventDefault();
      this.#pressed.add(button);
      return;
    }
    const action = keyToAction.get(event.code);
    if (action === "toggle-view") {
      event.preventDefault();
      this.#onViewToggle?.();
    }
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    const button = keyToButton.get(event.code);
    if (button !== undefined) this.#pressed.delete(button);
  };

  readonly #onBlur = (): void => {
    this.#pressed.clear();
  };

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.#element) return;
    const sensitivity = this.#sensitivity * this.#aimScale;
    this.#yaw -= event.movementX * sensitivity;
    this.#pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this.#pitch - event.movementY * sensitivity));
  };

  readonly #onMouseDown = (event: MouseEvent): void => {
    if (this.#textInputActive) return;
    if (document.pointerLockElement !== this.#element) return;
    if (event.button === 0) this.#pressed.add(InputButton.Fire);
    // Phase 8e-7: right mouse is hold-to-aim (was melee pre-ADS; melee is E).
    if (event.button === 2) this.#pressed.add(InputButton.Aim);
  };

  readonly #onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.#pressed.delete(InputButton.Fire);
    if (event.button === 2) this.#pressed.delete(InputButton.Aim);
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  readonly #onClick = (): void => {
    if (this.#textInputActive) return;
    this.requestLock();
  };

  readonly #onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.#element;
    if (locked === this.#locked) return;
    this.#locked = locked;
    if (locked) return;
    // A browser can drop pointer lock without delivering mouseup. Clear the
    // trigger latch with the lock, otherwise the next reload can look like a
    // second shot from the same physical pull.
    this.#pressed.delete(InputButton.Fire);
    this.#pressed.delete(InputButton.Aim);
    console.warn("Pointer lock lost — firing and mouse look are disabled until the field is clicked again.");
  };

  readonly #onPointerLockError = (): void => {
    this.#locked = document.pointerLockElement === this.#element;
    this.#pressed.delete(InputButton.Fire);
    this.#pressed.delete(InputButton.Aim);
    console.warn("Pointer lock error — firing and mouse look are disabled. Click the field to re-engage the pointer.");
  };
}
