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
  // free-cam-v1: separate look channel. Touch: 1 finger on the canvas = orbit, 2 fingers = pinch zoom.
  // Mouse: right button drag = orbit (left click still locks the pointer for steering), wheel = zoom.
  // The on-screen stick and buttons are DOM elements with their own pointer capture, so they never reach these.
  private lookDX = 0;
  private lookDY = 0;
  private lookZoom = 0;
  private lookRight = false;
  private lookPinch = 0;
  private lookTouches = new Map<number, { x: number; y: number }>();
  private pinchDist(): number {
    const p = [...this.lookTouches.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
  }
  private onLookDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") {
      if (e.button === 2) this.lookRight = true;
      return;
    }
    this.lookTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.lookTouches.size === 2) this.lookPinch = this.pinchDist();
  };
  private onLookMove = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") {
      if (this.lookRight) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
      return;
    }
    const t = this.lookTouches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.lookTouches.size === 1) {
      this.lookDX += dx;
      this.lookDY += dy;
    } else {
      const d = this.pinchDist();
      this.lookZoom += d - this.lookPinch;
      this.lookPinch = d;
    }
  };
  private onLookUp = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") {
      if (e.button === 2) this.lookRight = false;
      return;
    }
    this.lookTouches.delete(e.pointerId);
    if (this.lookTouches.size === 2) this.lookPinch = this.pinchDist();
  };
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
    // A lost pointerup (app backgrounded, alt-tab) must never leave a button or look finger "held".
    this.onBlur = () => this.releaseAll();
    this.onVis = () => {
      if (document.hidden) this.releaseAll();
    };
    this.onLock = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    this.onMove = (e) => {
      if (document.pointerLockElement === this.canvas && !this.lookRight) {
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
    canvas.addEventListener("pointerdown", this.onLookDown);
    canvas.addEventListener("pointermove", this.onLookMove);
    window.addEventListener("pointerup", this.onLookUp);
    window.addEventListener("pointercancel", this.onLookUp);
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
    this.canvas?.removeEventListener("pointerdown", this.onLookDown);
    this.canvas?.removeEventListener("pointermove", this.onLookMove);
    window.removeEventListener("pointerup", this.onLookUp);
    window.removeEventListener("pointercancel", this.onLookUp);
  }

  /** Drop every look pointer so a missed pointerup cannot leave the free camera stuck. */
  resetLook(): void {
    this.lookTouches.clear();
    this.lookRight = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookZoom = 0;
    this.lookPinch = 0;
  }

  private releaseAll(): void {
    this.keys.clear();
    this.touch = {
      ...this.touch,
      x: 0,
      y: 0,
      jump: false,
      run: false,
      rcsUp: false,
      rcsDown: false,
      pitchUp: false,
      pitchDown: false,
    };
    this.resetLook();
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

  /** free-cam-v1: look drag (px), pinch (px, + = fingers apart) and whether a look pointer is down. */
  consumeLook(): { dx: number; dy: number; zoom: number; active: boolean } {
    const r = { dx: this.lookDX, dy: this.lookDY, zoom: this.lookZoom, active: this.lookRight || this.lookTouches.size > 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookZoom = 0;
    return r;
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
