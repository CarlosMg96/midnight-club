export type PlayerAction =
  | 'TOGGLE_CAMERA'
  | 'TOGGLE_GARAGE'
  | 'TOGGLE_MAP'
  | 'TOGGLE_SETTINGS'
  | 'RESET_VEHICLE'
  | 'START_RACE'
  | 'TOGGLE_MUTE';

export interface DrivingInputState {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly handbrake: boolean;
  readonly nitro: boolean;
}

export interface InputBindings {
  readonly throttle: readonly string[];
  readonly brake: readonly string[];
  readonly steerLeft: readonly string[];
  readonly steerRight: readonly string[];
  readonly handbrake: readonly string[];
  readonly nitro: readonly string[];
}

export const DEFAULT_INPUT_BINDINGS: InputBindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight'],
};

/**
 * Captura entradas combinadas de teclado y Gamepad API con soporte de sensibilidad,
 * zona muerta y arquitectura preparada para múltiples jugadores locales.
 */
export class InputManager {
  private readonly pressedKeys = new Set<string>();
  private readonly bindings: InputBindings;
  private readonly playerIndex: number;
  private readonly steerSensitivity: number;
  private readonly gamepadDeadzone: number;
  private readonly actionListeners = new Set<(action: PlayerAction) => void>();
  private readonly onKeyDownBound: (event: KeyboardEvent) => void;
  private readonly onKeyUpBound: (event: KeyboardEvent) => void;
  private readonly onBlurBound: () => void;

  public constructor(options?: {
    playerIndex?: number;
    bindings?: InputBindings;
    steerSensitivity?: number;
    gamepadDeadzone?: number;
  }) {
    this.playerIndex = options?.playerIndex ?? 0;
    this.bindings = options?.bindings ?? DEFAULT_INPUT_BINDINGS;
    this.steerSensitivity = options?.steerSensitivity ?? 1.0;
    this.gamepadDeadzone = options?.gamepadDeadzone ?? 0.14;

    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onBlurBound = () => this.pressedKeys.clear();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
      window.addEventListener('blur', this.onBlurBound);
    }
  }

  public onAction(listener: (action: PlayerAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  }

  public getDrivingInput(): DrivingInputState {
    const keyThrottle = this.isAnyKeyPressed(this.bindings.throttle) ? 1 : 0;
    const keyBrake = this.isAnyKeyPressed(this.bindings.brake) ? 1 : 0;
    const left = this.isAnyKeyPressed(this.bindings.steerLeft) ? 1 : 0;
    const right = this.isAnyKeyPressed(this.bindings.steerRight) ? 1 : 0;
    const keySteer = (right - left) * this.steerSensitivity;
    const keyHandbrake = this.isAnyKeyPressed(this.bindings.handbrake);
    const keyNitro = this.isAnyKeyPressed(this.bindings.nitro);

    const pad = this.readGamepadState();

    return {
      throttle: Math.min(1, Math.max(keyThrottle, pad.throttle)),
      brake: Math.min(1, Math.max(keyBrake, pad.brake)),
      steer: Math.max(-1, Math.min(1, Math.abs(pad.steer) > 0.01 ? pad.steer : keySteer)),
      handbrake: keyHandbrake || pad.handbrake,
      nitro: keyNitro || pad.nitro,
    };
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDownBound);
      window.removeEventListener('keyup', this.onKeyUpBound);
      window.removeEventListener('blur', this.onBlurBound);
    }
    this.pressedKeys.clear();
    this.actionListeners.clear();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }

    if (
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight'
    ) {
      event.preventDefault();
    }

    if (!event.repeat) {
      if (event.code === 'KeyC') {
        this.emitAction('TOGGLE_CAMERA');
      } else if (event.code === 'KeyG') {
        this.emitAction('TOGGLE_GARAGE');
      } else if (event.code === 'KeyM') {
        this.emitAction('TOGGLE_MAP');
      } else if (event.code === 'KeyO') {
        this.emitAction('TOGGLE_SETTINGS');
      } else if (event.code === 'KeyR') {
        this.emitAction('RESET_VEHICLE');
      } else if (event.code === 'KeyF') {
        this.emitAction('START_RACE');
      } else if (event.code === 'KeyV') {
        this.emitAction('TOGGLE_MUTE');
      }
    }

    this.pressedKeys.add(event.code);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.pressedKeys.delete(event.code);
  }

  private isAnyKeyPressed(codes: readonly string[]): boolean {
    for (const code of codes) {
      if (this.pressedKeys.has(code)) {
        return true;
      }
    }
    return false;
  }

  private emitAction(action: PlayerAction): void {
    for (const listener of this.actionListeners) {
      listener(action);
    }
  }

  private readGamepadState(): DrivingInputState {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    }

    const gamepads = navigator.getGamepads();
    const pad = gamepads[this.playerIndex];
    if (!pad || !pad.connected) {
      return { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    }

    const rawAxis = pad.axes[0] ?? 0;
    const steer =
      Math.abs(rawAxis) < this.gamepadDeadzone
        ? 0
        : ((rawAxis - Math.sign(rawAxis) * this.gamepadDeadzone) / (1 - this.gamepadDeadzone)) *
          this.steerSensitivity;

    const throttle = pad.buttons[7]?.value ?? 0;
    const brake = pad.buttons[6]?.value ?? 0;
    const handbrake = Boolean(pad.buttons[0]?.pressed || pad.buttons[2]?.pressed);
    const nitro = Boolean(pad.buttons[1]?.pressed);

    return {
      throttle,
      brake,
      steer: Math.max(-1, Math.min(1, steer)),
      handbrake,
      nitro,
    };
  }
}
