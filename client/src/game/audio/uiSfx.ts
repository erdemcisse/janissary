import type { AudioEngine } from "./audioEngine";

let registered: AudioEngine | undefined;

export function registerUiAudio(engine: AudioEngine): void {
  registered = engine;
}

export function unregisterUiAudio(engine: AudioEngine): void {
  if (registered === engine) registered = undefined;
}

export function playUiClick(): void {
  registered?.uiClick();
}

export function playUiHover(): void {
  registered?.uiHover();
}
