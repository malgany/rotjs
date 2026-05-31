import * as ROT from "rot-js";
import "./styles.css";

const SIZE = 45;
const FOV_RADIUS = 10;
const WALL = "#";
const FLOOR = ".";
const JOYSTICK_KNOB_LIMIT = 34;
const JOYSTICK_DEAD_ZONE = 12;
const JOYSTICK_STEP_MS = 140;

const palette = {
  bg: "#020402",
  wall: "#0b2d13",
  wallVisible: "#1b5f2c",
  floor: "#06220c",
  floorVisible: "#22b14c",
  player: "#b8ff9b",
  text: "#7cff8a"
};

const display = new ROT.Display({
  width: SIZE,
  height: SIZE,
  fontSize: 18,
  fontFamily: "Consolas, 'Courier New', monospace",
  forceSquareRatio: true,
  bg: palette.bg,
  fg: palette.text
});

const state = {
  seed: 1979,
  map: new Map(),
  visible: new Set(),
  explored: new Set(),
  player: { x: 0, y: 0 }
};

const displayMount = document.querySelector("#rot-display");
const seedInput = document.querySelector("#seed");
const regenButton = document.querySelector("#regen");
const joystick = document.createElement("div");
const joystickKnob = document.createElement("div");

const joystickState = {
  active: false,
  pointerId: null,
  origin: { x: 0, y: 0 },
  direction: { x: 0, y: 0 },
  timer: null
};

displayMount.appendChild(display.getContainer());
joystick.className = "touch-joystick";
joystick.setAttribute("aria-hidden", "true");
joystickKnob.className = "touch-joystick-knob";
joystick.appendChild(joystickKnob);
document.body.appendChild(joystick);

function key(x, y) {
  return `${x},${y}`;
}

function readKey(cellKey) {
  const [x, y] = cellKey.split(",").map(Number);
  return { x, y };
}

function getCell(x, y) {
  return state.map.get(key(x, y)) ?? WALL;
}

function setCell(x, y, value) {
  state.map.set(key(x, y), value);
}

function isOpen(x, y) {
  return getCell(x, y) === FLOOR;
}

function generateCave() {
  ROT.RNG.setSeed(state.seed);
  state.map.clear();
  state.visible.clear();
  state.explored.clear();

  const generator = new ROT.Map.Cellular(SIZE, SIZE, {
    connected: true,
    topology: 8
  });

  generator.randomize(0.47);
  for (let i = 0; i < 5; i += 1) generator.create();
  generator.connect((x, y, value) => {
    const border = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
    setCell(x, y, border || value ? WALL : FLOOR);
  }, 1);

  state.player = chooseStartCell();
  draw();
}

function chooseStartCell() {
  const openCells = [...state.map.entries()]
    .filter(([, value]) => value === FLOOR)
    .map(([cellKey]) => readKey(cellKey));

  const center = Math.floor(SIZE / 2);
  return openCells.sort((a, b) => distanceToCenter(a, center) - distanceToCenter(b, center))[0] ?? { x: center, y: center };
}

function distanceToCenter(cell, center) {
  return Math.abs(cell.x - center) + Math.abs(cell.y - center);
}

function computeFov() {
  state.visible.clear();

  const fov = new ROT.FOV.PreciseShadowcasting((x, y) => isOpen(x, y));
  fov.compute(state.player.x, state.player.y, FOV_RADIUS, (x, y) => {
    const cellKey = key(x, y);
    state.visible.add(cellKey);
    state.explored.add(cellKey);
  });
}

function draw() {
  computeFov();
  display.clear();

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cellKey = key(x, y);
      if (!state.explored.has(cellKey)) {
        display.draw(x, y, " ", palette.wall, palette.bg);
        continue;
      }

      const cell = getCell(x, y);
      const visible = state.visible.has(cellKey);
      const glyph = cell === WALL ? "#" : ".";
      const color = cell === WALL
        ? visible ? palette.wallVisible : palette.wall
        : visible ? palette.floorVisible : palette.floor;

      display.draw(x, y, glyph, color, palette.bg);
    }
  }

  display.draw(state.player.x, state.player.y, "@", palette.player, palette.bg);
}

function movePlayer(dx, dy) {
  const next = {
    x: state.player.x + dx,
    y: state.player.y + dy
  };

  if (!isOpen(next.x, next.y)) return;

  state.player = next;
  draw();
}

function moveFromJoystick() {
  if (!joystickState.direction.x && !joystickState.direction.y) return;
  movePlayer(joystickState.direction.x, joystickState.direction.y);
}

function handleKeydown(event) {
  const movement = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    W: [0, -1],
    s: [0, 1],
    S: [0, 1],
    a: [-1, 0],
    A: [-1, 0],
    d: [1, 0],
    D: [1, 0]
  }[event.key];

  if (!movement) return;
  event.preventDefault();
  movePlayer(movement[0], movement[1]);
}

function regenerateFromInput() {
  state.seed = Number(seedInput.value) || ROT.RNG.getUniformInt(1, 999999);
  seedInput.value = String(state.seed);
  generateCave();
}

function isControlTarget(target) {
  return target instanceof Element && Boolean(target.closest("button, input, select, textarea, a, label"));
}

function showJoystick(x, y) {
  joystick.style.left = `${x}px`;
  joystick.style.top = `${y}px`;
  joystick.classList.add("is-active");
}

function setJoystickKnob(x, y) {
  joystickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function updateJoystick(clientX, clientY) {
  const rawX = clientX - joystickState.origin.x;
  const rawY = clientY - joystickState.origin.y;
  const distance = Math.hypot(rawX, rawY);
  const limitedDistance = Math.min(distance, JOYSTICK_KNOB_LIMIT);
  const scale = distance > 0 ? limitedDistance / distance : 0;
  const knobX = rawX * scale;
  const knobY = rawY * scale;

  setJoystickKnob(knobX, knobY);

  if (distance < JOYSTICK_DEAD_ZONE) {
    joystickState.direction = { x: 0, y: 0 };
    return;
  }

  joystickState.direction = Math.abs(rawX) > Math.abs(rawY)
    ? { x: Math.sign(rawX), y: 0 }
    : { x: 0, y: Math.sign(rawY) };
}

function stopJoystick() {
  joystickState.active = false;
  joystickState.pointerId = null;
  joystickState.direction = { x: 0, y: 0 };
  clearInterval(joystickState.timer);
  joystickState.timer = null;
  setJoystickKnob(0, 0);
  joystick.classList.remove("is-active");
}

function handlePointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isControlTarget(event.target)) return;

  event.preventDefault();
  joystickState.active = true;
  joystickState.pointerId = event.pointerId;
  joystickState.origin = { x: event.clientX, y: event.clientY };
  joystickState.direction = { x: 0, y: 0 };
  showJoystick(event.clientX, event.clientY);
  setJoystickKnob(0, 0);

  try {
    event.target.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events used in tests may not have a capturable pointer.
  }

  clearInterval(joystickState.timer);
  joystickState.timer = setInterval(moveFromJoystick, JOYSTICK_STEP_MS);
}

function handlePointerMove(event) {
  if (!joystickState.active || event.pointerId !== joystickState.pointerId) return;
  event.preventDefault();
  updateJoystick(event.clientX, event.clientY);
}

function handlePointerEnd(event) {
  if (!joystickState.active || event.pointerId !== joystickState.pointerId) return;
  stopJoystick();
}

regenButton.addEventListener("click", regenerateFromInput);
seedInput.addEventListener("change", regenerateFromInput);
window.addEventListener("keydown", handleKeydown);
window.addEventListener("pointerdown", handlePointerDown, { passive: false });
window.addEventListener("pointermove", handlePointerMove, { passive: false });
window.addEventListener("pointerup", handlePointerEnd);
window.addEventListener("pointercancel", handlePointerEnd);
window.addEventListener("blur", stopJoystick);

generateCave();
