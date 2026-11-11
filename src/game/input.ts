export type TouchState = {
  x: number;
  y: number;
  jump: boolean;
  run: boolean;
  rcsUp: boolean;
  rcsDown: boolean;
  pitchUp: boolean;
  pitchDown: boolean;
};

export class Input {
  private keys = new Set<string>();
  private override: Set<string> | null = null;
  steerOverride: number | null = null;
  pointerLocked = false;
  private dx = 0;
  private dy = 0;
  private wheelAcc = 0;
  private dragX = 0;
  private dragY = 0;
  private onPointerMove: (e: PointerEvent) => void;
  private activePointer = -1;
  click: { x: number; y: number } | null = null;
  touch: TouchState = {
    x: 0,
    y: 0,
    jump: false,
    run: false,
    rcsUp: false,
    rcsDown: false,
    pitchUp: false,
    pitchDown: false,
  };
  interactPulse = false;
  launchPulse = false;
  camPulse = false;
  private canvas: HTMLCanvasElement | null = null;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onBlur: () => void;
  private onVis: () => void;
  private onLock: () => void;
  private onMove: (e: MouseEvent) => void;
  private onDown: (e: PointerEvent) => void;
  private onUp: (e: PointerEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onContext: (e: Event) => void;

  constructor() {
    this.onKeyDown = (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this.onBlur = () => {
      this.keys.clear();
      this.touch = { ...this.touch, x: 0, y: 0, jump: false, run: false, rcsUp: false, rcsDown: false };
    };
    this.onVis = () => {
      if (document.hidden) this.keys.clear();
    };
    this.onLock = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    this.onMove = (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    };
    this.onDown = (e) => {
      if (e.button !== 0) return;
      this.activePointer = e.pointerId;
      this.pressMoved = 0;
    };
    this.onPointerMove = (e) => {
      if (this.activePointer !== e.pointerId || document.pointerLockElement === this.canvas) return;
      this.pressMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.dragX += e.movementX;
      this.dragY += e.movementY;
    };
    this.onUp = (e) => {
      if (e.pointerId !== this.activePointer) return;
      this.activePointer = -1;
      if (this.pressMoved < 6 && this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        this.click = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.wheelAcc += e.deltaY;
    };
    this.onContext = (e) => e.preventDefault();
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    document.addEventListener("pointerlockchange", this.onLock);
    document.addEventListener("mousemove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);
    canvas.addEventListener("pointermove", this.onPointerMove);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    document.removeEventListener("pointerlockchange", this.onLock);
    document.removeEventListener("mousemove", this.onMove);
    this.canvas?.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    this.canvas?.removeEventListener("wheel", this.onWheel);
    this.canvas?.removeEventListener("contextmenu", this.onContext);
    this.canvas?.removeEventListener("pointermove", this.onPointerMove);
  }

  held(code: string): boolean {
    if (this.override) return this.override.has(code);
    return this.keys.has(code);
  }

  setOverride(codes: string[]): void {
    this.override = new Set(codes);
  }

  setTouch(partial: Partial<TouchState>): void {
    this.touch = { ...this.touch, ...partial };
  }

  pulseInteract(): void {
    this.interactPulse = true;
  }

  pulseLaunch(): void {
    this.launchPulse = true;
  }

  pulseCam(): void {
    this.camPulse = true;
  }

  requestLock(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeMouse(): { x: number; y: number } {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheelAcc;
    this.wheelAcc = 0;
    return w;
  }

  consumeDrag(): { x: number; y: number } {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  consumeClick(): { x: number; y: number } | null {
    const c = this.click;
    this.click = null;
    return c;
  }

  consumePulses(): { interact: boolean; launch: boolean; cam: boolean } {
    const p = {
      interact: this.interactPulse,
      launch: this.launchPulse,
      cam: this.camPulse,
    };
    this.interactPulse = false;
    this.launchPulse = false;
    this.camPulse = false;
    return p;
  }
}
