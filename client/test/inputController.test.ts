import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputButton } from "@janissary/shared";
import { InputController } from "../src/game/InputController";

/**
 * InputController owns every player action. It is DOM-adjacent by nature, so
 * this suite drives it through a minimal fake window/document registry — no
 * jsdom, no browser — dispatching plain events exactly as the real handlers
 * consume them. The mapping table and the pointer-lock/clamp logic are the
 * risk surface (a miswired key or an unbounded pitch is felt every match).
 */

interface FakeEvent {
  readonly code?: string;
  readonly key?: string;
  readonly button?: number;
  readonly movementX?: number;
  readonly movementY?: number;
  preventDefault: () => void;
}

interface FakeElement {
  readonly elementListeners: Map<string, Set<(event: FakeEvent) => void>>;
  requestPointerLock: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
}

interface FakeDom {
  readonly windowListeners: Map<string, Set<(event: FakeEvent) => void>>;
  readonly documentListeners: Map<string, Set<(event: FakeEvent) => void>>;
  pointerLockElement: object | null;
  dispatchWindow: (type: string, event: FakeEvent) => void;
  dispatchDocument: (type: string, event: FakeEvent) => void;
}

function fakeElement(): FakeElement {
  const elementListeners = new Map<string, Set<(event: FakeEvent) => void>>();
  const addEventListener = (type: string, listener: (event: FakeEvent) => void): void => {
    let set = elementListeners.get(type);
    if (set === undefined) {
      set = new Set();
      elementListeners.set(type, set);
    }
    set.add(listener);
  };
  return {
    elementListeners,
    requestPointerLock: vi.fn(() => undefined),
    addEventListener,
    removeEventListener: (type: string, listener: (event: FakeEvent) => void): void => {
      elementListeners.get(type)?.delete(listener);
    },
  };
}

function fakeDom(): FakeDom {
  const windowListeners = new Map<string, Set<(event: FakeEvent) => void>>();
  const documentListeners = new Map<string, Set<(event: FakeEvent) => void>>();
  const register = (map: Map<string, Set<(event: FakeEvent) => void>>, type: string, listener: (event: FakeEvent) => void): void => {
    let set = map.get(type);
    if (set === undefined) {
      set = new Set();
      map.set(type, set);
    }
    set.add(listener);
  };
  const dom: FakeDom = {
    windowListeners,
    documentListeners,
    pointerLockElement: null,
    dispatchWindow: (type, event) => {
      for (const listener of [...(windowListeners.get(type) ?? [])]) listener(event);
    },
    dispatchDocument: (type, event) => {
      for (const listener of [...(documentListeners.get(type) ?? [])]) listener(event);
    },
  };
  globalThis.window = {
    addEventListener: (type: string, listener: (event: FakeEvent) => void): void => register(windowListeners, type, listener),
    removeEventListener: (type: string, listener: (event: FakeEvent) => void): void => {
      windowListeners.get(type)?.delete(listener);
    },
  } as unknown as Window & typeof globalThis;
  // The global document must BE the handle the test mutates: the handlers read
  // `document.pointerLockElement`, so a second object would never see updates.
  globalThis.document = {
    addEventListener: (type: string, listener: (event: FakeEvent) => void): void => register(documentListeners, type, listener),
    removeEventListener: (type: string, listener: (event: FakeEvent) => void): void => {
      documentListeners.get(type)?.delete(listener);
    },
    get pointerLockElement(): object | null {
      return dom.pointerLockElement;
    },
  } as unknown as Document;
  return dom;
}

function keyEvent(code: string): FakeEvent {
  return { code, preventDefault: vi.fn() };
}

function mouseEvent(button: number): FakeEvent {
  return { button, preventDefault: vi.fn() };
}

let dom: FakeDom;
let element: FakeElement;
let controller: InputController;

beforeEach(() => {
  dom = fakeDom();
  element = fakeElement();
  controller = new InputController(element as unknown as HTMLElement);
});

afterEach(() => {
  controller.dispose();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
});

describe("keyboard mapping", () => {
  it("maps WASD, arrows, and every action key to its InputButton bit", () => {
    const cases: ReadonlyArray<readonly [string, number]> = [
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
      ["KeyE", InputButton.Melee],
      ["Digit1", InputButton.Slot1],
      ["Numpad1", InputButton.Slot1],
      ["Digit2", InputButton.Slot2],
      ["Numpad2", InputButton.Slot2],
      ["Digit3", InputButton.Slot3],
      ["Numpad3", InputButton.Slot3],
    ];
    for (const [code, bit] of cases) {
      const event = keyEvent(code);
      dom.dispatchWindow("keydown", event);
      expect(controller.buttons).toBe(bit);
      expect(event.preventDefault).toHaveBeenCalled();
      dom.dispatchWindow("keyup", event);
      expect(controller.buttons).toBe(0);
    }
  });

  it("combines held keys into a single button word", () => {
    dom.dispatchWindow("keydown", keyEvent("KeyW"));
    dom.dispatchWindow("keydown", keyEvent("Digit2"));
    expect(controller.buttons).toBe(InputButton.Forward | InputButton.Slot2);
  });

  it("ignores unbound keys without preventing their default", () => {
    const event = keyEvent("KeyQ");
    dom.dispatchWindow("keydown", event);
    expect(controller.buttons).toBe(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("fires the view-toggle action on V without touching the button word", () => {
    const onViewToggle = vi.fn();
    controller.onViewToggle(onViewToggle);
    const event = keyEvent("KeyV");
    dom.dispatchWindow("keydown", event);
    expect(onViewToggle).toHaveBeenCalledTimes(1);
    expect(controller.buttons).toBe(0);
  });

  it("does not echo keyboard input while a text field is focused", () => {
    controller.setTextInputActive(true);
    dom.dispatchWindow("keydown", keyEvent("KeyW"));
    expect(controller.buttons).toBe(0);
  });

  it("clears every held button when entering a text field and on window blur", () => {
    dom.dispatchWindow("keydown", keyEvent("KeyW"));
    controller.setTextInputActive(true);
    expect(controller.buttons).toBe(0);
    dom.dispatchWindow("keydown", keyEvent("KeyA"));
    expect(controller.buttons).toBe(0);
    controller.setTextInputActive(false);
    dom.dispatchWindow("keydown", keyEvent("KeyA"));
    expect(controller.buttons).toBe(InputButton.Left);
    dom.dispatchWindow("blur", keyEvent(""));
    expect(controller.buttons).toBe(0);
  });
});

describe("mouse look and fire", () => {
  it("ignores mouse movement without pointer lock", () => {
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 100, preventDefault: vi.fn() });
    expect(controller.yaw).toBe(0);
    expect(controller.pitch).toBe(0);
  });

  it("applies sensitivity and clamps pitch to the ±89.6° horizon", () => {
    dom.pointerLockElement = element;
    dom.dispatchDocument("mousemove", { movementX: 1000, movementY: 1000, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-1000 * 0.002, 6);
    expect(controller.pitch).toBeCloseTo(-Math.PI * 0.49, 6);
    dom.dispatchDocument("mousemove", { movementX: 0, movementY: -10_000, preventDefault: vi.fn() });
    expect(controller.pitch).toBeCloseTo(Math.PI * 0.49, 6);
  });

  it("clamps configured sensitivity into the valid band", () => {
    controller.setSensitivity(0.5);
    dom.pointerLockElement = element;
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-1, 6);
    controller.setSensitivity(0.0001);
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-1.05, 6);
  });

  it("adds Fire on left-click and Aim on right-click while locked (Phase 8e-7)", () => {
    dom.pointerLockElement = element;
    dom.dispatchDocument("mousedown", mouseEvent(0));
    expect(controller.buttons).toBe(InputButton.Fire);
    dom.dispatchDocument("mousedown", mouseEvent(2));
    expect(controller.buttons).toBe(InputButton.Fire | InputButton.Aim);
    dom.dispatchDocument("mouseup", mouseEvent(0));
    expect(controller.buttons).toBe(InputButton.Aim);
    dom.dispatchDocument("mouseup", mouseEvent(2));
    expect(controller.buttons).toBe(0);
  });

  it("suppresses the context menu on the game element (RMB is ADS)", () => {
    const event = { preventDefault: vi.fn() };
    for (const listener of element.elementListeners.get("contextmenu") ?? []) listener(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("scales mouse look by the ADS sensitivity multiplier", () => {
    dom.pointerLockElement = element;
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-100 * 0.002, 6);
    controller.setAimScale(0.5);
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-100 * 0.002 - 50 * 0.002, 6);
    controller.setAimScale(1);
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-200 * 0.002 - 50 * 0.002, 6);
  });

  it("clamps the ADS sensitivity multiplier into [0.2, 1]", () => {
    dom.pointerLockElement = element;
    controller.setAimScale(9);
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-100 * 0.002, 6);
    controller.setAimScale(0.01);
    dom.dispatchDocument("mousemove", { movementX: 100, movementY: 0, preventDefault: vi.fn() });
    expect(controller.yaw).toBeCloseTo(-100 * 0.002 - 100 * 0.002 * 0.2, 6);
  });

  it("does not fire from mouse buttons while unlocked or typing", () => {
    dom.dispatchDocument("mousedown", mouseEvent(0));
    expect(controller.buttons).toBe(0);
    controller.setTextInputActive(true);
    dom.pointerLockElement = element;
    dom.dispatchDocument("mousedown", mouseEvent(0));
    expect(controller.buttons).toBe(0);
  });
});

describe("pointer lock lifecycle", () => {
  it("requests lock on element click only when unlocked and not typing", () => {
    const click = { preventDefault: vi.fn() };
    for (const listener of element.elementListeners.get("click") ?? []) listener(click);
    expect(element.requestPointerLock).toHaveBeenCalledTimes(1);

    dom.pointerLockElement = element;
    for (const listener of element.elementListeners.get("click") ?? []) listener(click);
    expect(element.requestPointerLock).toHaveBeenCalledTimes(1);

    controller.setTextInputActive(true);
    for (const listener of element.elementListeners.get("click") ?? []) listener(click);
    expect(element.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("tracks pointer-lock loss through the pointerlockchange event", () => {
    expect(controller.locked).toBe(false);
    dom.pointerLockElement = element;
    dom.dispatchDocument("pointerlockchange", { preventDefault: vi.fn() });
    expect(controller.locked).toBe(true);
    dom.pointerLockElement = null;
    dom.dispatchDocument("pointerlockchange", { preventDefault: vi.fn() });
    expect(controller.locked).toBe(false);
  });

  it("stops reacting to keys and mouse after dispose", () => {
    controller.dispose();
    dom.dispatchWindow("keydown", keyEvent("KeyW"));
    expect(controller.buttons).toBe(0);
    dom.dispatchDocument("mousedown", mouseEvent(0));
    expect(controller.buttons).toBe(0);
  });
});
