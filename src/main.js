import * as ROT from "rot-js";
import wallCornerUrl from "./assets/canto.png";
import wallMiddleUrl from "./assets/meio.png";
import "./styles.css";

const MAP_SIZE = 45;
const VIEWPORT_SIZE = 15;
const CANVAS_SIZE = 720;
const VIEWPORT_CENTER = Math.floor(VIEWPORT_SIZE / 2);
const FAR_SCALE = 0.52;
const NEAR_SCALE = 1.28;
const FOV_RADIUS = 10;
const WALL = "#";
const FLOOR = ".";
const JOYSTICK_KNOB_LIMIT = 34;
const JOYSTICK_DEAD_ZONE = 12;
const JOYSTICK_STEP_MS = 140;
const WALL_TILE_SIZE = 38;
const WALL_TILE_MAX_SLICES = 72;

const palette = {
  bg: "#08090a",
  wallHidden: "#1b1f25",
  wall: "#2a2d31",
  wallVisible: "#747b84",
  floorHidden: "#15181c",
  floor: "#141619",
  floorVisible: "#d5d8dc",
  player: "#ffffff",
  text: "#d5d8dc"
};

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
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");
const joystick = document.createElement("div");
const joystickKnob = document.createElement("div");
const wallTiles = {
  corner: createTileImage(wallCornerUrl),
  middle: createTileImage(wallMiddleUrl)
};

const joystickState = {
  active: false,
  pointerId: null,
  origin: { x: 0, y: 0 },
  direction: { x: 0, y: 0 },
  timer: null
};

canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;
context.textAlign = "center";
context.textBaseline = "middle";
context.imageSmoothingEnabled = false;
displayMount.appendChild(canvas);
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

function createTileImage(src) {
  const image = new Image();
  image.src = src;
  image.addEventListener("load", () => {
    if (state.map.size > 0) draw();
  });
  return image;
}

function isOpen(x, y) {
  return getCell(x, y) === FLOOR;
}

function generateCave() {
  ROT.RNG.setSeed(state.seed);
  state.map.clear();
  state.visible.clear();
  state.explored.clear();

  const generator = new ROT.Map.Cellular(MAP_SIZE, MAP_SIZE, {
    connected: true,
    topology: 8
  });

  generator.randomize(0.47);
  for (let i = 0; i < 5; i += 1) generator.create();
  generator.connect((x, y, value) => {
    const border = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
    setCell(x, y, border || value ? WALL : FLOOR);
  }, 1);

  state.player = chooseStartCell();
  draw();
}

function chooseStartCell() {
  const openCells = [...state.map.entries()]
    .filter(([, value]) => value === FLOOR)
    .map(([cellKey]) => readKey(cellKey));

  const center = Math.floor(MAP_SIZE / 2);
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

function getCameraOrigin() {
  const maxOrigin = MAP_SIZE - VIEWPORT_SIZE;

  return {
    x: Math.max(0, Math.min(state.player.x - VIEWPORT_CENTER, maxOrigin)),
    y: Math.max(0, Math.min(state.player.y - VIEWPORT_CENTER, maxOrigin))
  };
}

function getProjectionMetrics(y) {
  const boundedY = Math.max(0, Math.min(y, VIEWPORT_SIZE - 1));
  const depth = boundedY / (VIEWPORT_SIZE - 1);
  const easedDepth = depth ** 1.35;
  const scale = FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * easedDepth;

  return {
    xStep: 38 * scale,
    y: 34 + easedDepth * 612,
    scale
  };
}

function getProjectedCell(xOffset, y) {
  const metrics = getProjectionMetrics(y);

  return {
    x: CANVAS_SIZE / 2 + xOffset * metrics.xStep,
    y: metrics.y,
    scale: metrics.scale
  };
}

function getVisibleColumnRadius(y) {
  const { xStep } = getProjectionMetrics(y);
  return Math.ceil((CANVAS_SIZE / 2 - 32) / xStep);
}

function getGlyph(cell) {
  return cell === WALL ? "#" : ".";
}

function getColor(cell, visible) {
  if (cell === WALL) return visible ? palette.wallVisible : palette.wall;
  return visible ? palette.floorVisible : palette.floor;
}

function isInsideMap(x, y) {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

function clearCanvas() {
  context.fillStyle = palette.bg;
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawGlyph(x, y, glyph, color, alpha = 1) {
  const projected = getProjectedCell(x, y);
  context.fillStyle = color;
  context.font = `${Math.round(29 * projected.scale)}px Consolas, 'Courier New', monospace`;
  context.globalAlpha = (0.72 + projected.scale * 0.22) * alpha;
  context.fillText(glyph, projected.x, projected.y);
  context.globalAlpha = 1;
}

function getWallTile(mapX, mapY) {
  return getCell(mapX, mapY + 1) === FLOOR ? wallTiles.corner : wallTiles.middle;
}

function drawPerspectiveTile(image, screenXOffset, screenY, projected) {
  const baseSize = WALL_TILE_SIZE * projected.scale;
  const height = baseSize * 0.86;
  const slices = Math.max(1, Math.min(WALL_TILE_MAX_SLICES, Math.ceil(height)));
  const topProjection = getProjectedCell(screenXOffset, screenY - 0.36);
  const bottomProjection = getProjectedCell(screenXOffset, screenY + 0.36);
  const topWidth = baseSize * 0.9;
  const bottomWidth = baseSize * 1.08;
  const topY = projected.y - height / 2;

  for (let slice = 0; slice < slices; slice += 1) {
    const t = slice / slices;
    const nextT = (slice + 1) / slices;
    const centerX = topProjection.x + (bottomProjection.x - topProjection.x) * t;
    const width = topWidth + (bottomWidth - topWidth) * t;
    const y = topY + height * t;
    const sliceHeight = height * (nextT - t);
    const sourceY = image.naturalHeight * t;
    const sourceHeight = image.naturalHeight * (nextT - t);

    context.drawImage(
      image,
      0,
      sourceY,
      image.naturalWidth,
      sourceHeight,
      centerX - width / 2,
      y,
      width,
      sliceHeight
    );
  }
}

function drawWallTile(screenXOffset, screenY, mapX, mapY, alpha = 1) {
  const tile = getWallTile(mapX, mapY);
  const projected = getProjectedCell(screenXOffset, screenY);

  if (!tile.complete || tile.naturalWidth === 0) {
    drawGlyph(screenXOffset, screenY, WALL, palette.wall, alpha);
    return;
  }

  context.globalAlpha = (0.72 + projected.scale * 0.22) * alpha;
  drawPerspectiveTile(tile, screenXOffset, screenY, projected);
  context.globalAlpha = 1;
}

function drawMapCell(screenXOffset, screenY, mapX, mapY) {
  if (!isInsideMap(mapX, mapY)) return;

  const cellKey = key(mapX, mapY);
  const cell = getCell(mapX, mapY);
  const explored = state.explored.has(cellKey);
  const visible = state.visible.has(cellKey);
  const hiddenColor = cell === WALL ? palette.wallHidden : palette.floorHidden;

  if (cell === WALL) {
    drawWallTile(screenXOffset, screenY, mapX, mapY, explored ? 1 : 0.86);
    return;
  }

  drawGlyph(
    screenXOffset,
    screenY,
    getGlyph(cell),
    explored ? getColor(cell, visible) : hiddenColor,
    explored ? 1 : 0.86
  );
}

function draw() {
  computeFov();
  clearCanvas();

  const camera = getCameraOrigin();

  for (let y = 0; y < VIEWPORT_SIZE; y += 1) {
    const mapY = camera.y + y;
    const columnRadius = getVisibleColumnRadius(y);

    for (let xOffset = -columnRadius; xOffset <= columnRadius; xOffset += 1) {
      drawMapCell(xOffset, y, state.player.x + xOffset, mapY);
    }
  }

  drawGlyph(0, state.player.y - camera.y, "@", palette.player);
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
