import * as ROT from "rot-js";
import wallCornerUrl from "./assets/concreto/canto.jpg";
import wallMiddle00Url from "./assets/concreto/meio-0-0.jpg";
import wallMiddle10Url from "./assets/concreto/meio-1-0.jpg";
import wallMiddle20Url from "./assets/concreto/meio-2-0.jpg";
import wallMiddle01Url from "./assets/concreto/meio-0-1.jpg";
import wallMiddle11Url from "./assets/concreto/meio-1-1.jpg";
import wallMiddle21Url from "./assets/concreto/meio-2-1.jpg";
import wallMiddle02Url from "./assets/concreto/meio-0-2.jpg";
import wallMiddle12Url from "./assets/concreto/meio-1-2.jpg";
import wallMiddle22Url from "./assets/concreto/meio-2-2.jpg";
import floorTileUrl from "./assets/concreto/floor.jpg";
import warriorSpritesheetUrl from "./assets/characters/warrior-spritesheet.png";
import "./styles.css";

const MAP_SIZE = 45;
const CANVAS_SIZE = 720;
const CELL_SIZE = CANVAS_SIZE / MAP_SIZE;
const DEFAULT_CAMERA_ZOOM = 2;
const MIN_CAMERA_ZOOM = 1;
const MAX_CAMERA_ZOOM = 6;
const ZOOM_STEP = 1.16;
const FOV_RADIUS = 10;
const WALL = "#";
const FLOOR = ".";
const JOYSTICK_KNOB_LIMIT = 34;
const JOYSTICK_DEAD_ZONE = 12;
const JOYSTICK_STEP_MS = 140;
const AUTO_WALK_STEP_MS = 90;
const FLOOR_TEXTURE_CELLS = 3;
const WALL_MIDDLE_TEXTURE_CELLS = 3;
const SPRITESHEET_COLUMNS = 4;
const SPRITESHEET_ROWS = 4;
const PLAYER_SPRITE_SCALE = 1.5;

const palette = {
  bg: "#08090a",
  wall: "#2a2d31",
  floor: "#141619",
  player: "#ffffff"
};

const state = {
  seed: 1979,
  map: new Map(),
  visible: new Set(),
  explored: new Set(),
  zoom: DEFAULT_CAMERA_ZOOM,
  walkTimer: null,
  stepTimer: null,
  player: { x: 0, y: 0 },
  playerDirection: "down",
  playerFrame: 0,
  playerWalking: false
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
  middle: [
    [createTileImage(wallMiddle00Url), createTileImage(wallMiddle10Url), createTileImage(wallMiddle20Url)],
    [createTileImage(wallMiddle01Url), createTileImage(wallMiddle11Url), createTileImage(wallMiddle21Url)],
    [createTileImage(wallMiddle02Url), createTileImage(wallMiddle12Url), createTileImage(wallMiddle22Url)]
  ]
};
const floorTile = createTileImage(floorTileUrl);
const playerSpritesheet = createTileImage(warriorSpritesheetUrl);

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

function isInsideMap(x, y) {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getRenderCellSize() {
  return CELL_SIZE * state.zoom;
}

function getViewportCells() {
  return CANVAS_SIZE / getRenderCellSize();
}

function getCameraOrigin() {
  const viewportCells = getViewportCells();
  const maxOrigin = MAP_SIZE - viewportCells;

  return {
    x: clamp(state.player.x + 0.5 - viewportCells / 2, 0, maxOrigin),
    y: clamp(state.player.y + 0.5 - viewportCells / 2, 0, maxOrigin)
  };
}

function getScreenCell(mapX, mapY, camera) {
  const renderCellSize = getRenderCellSize();

  return {
    x: (mapX - camera.x) * renderCellSize,
    y: (mapY - camera.y) * renderCellSize,
    size: renderCellSize
  };
}

function getMapCellFromClientPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = CANVAS_SIZE / rect.width;
  const canvasX = (clientX - rect.left) * scale;
  const canvasY = (clientY - rect.top) * scale;
  const camera = getCameraOrigin();

  return {
    x: Math.floor(camera.x + canvasX / getRenderCellSize()),
    y: Math.floor(camera.y + canvasY / getRenderCellSize())
  };
}

function clearCanvas() {
  context.fillStyle = palette.bg;
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawGlyph(mapX, mapY, glyph, color, alpha = 1, camera = getCameraOrigin()) {
  const screenCell = getScreenCell(mapX, mapY, camera);

  context.fillStyle = color;
  context.font = `${Math.round(getRenderCellSize() * 0.9)}px Consolas, 'Courier New', monospace`;
  context.globalAlpha = alpha;
  context.fillText(glyph, screenCell.x + screenCell.size / 2, screenCell.y + screenCell.size / 2);
  context.globalAlpha = 1;
}

function getWallTile(mapX, mapY) {
  if (getCell(mapX, mapY + 1) === FLOOR) return wallTiles.corner;

  const tileX = ((mapX % WALL_MIDDLE_TEXTURE_CELLS) + WALL_MIDDLE_TEXTURE_CELLS) % WALL_MIDDLE_TEXTURE_CELLS;
  const tileY = ((mapY % WALL_MIDDLE_TEXTURE_CELLS) + WALL_MIDDLE_TEXTURE_CELLS) % WALL_MIDDLE_TEXTURE_CELLS;
  return wallTiles.middle[tileY][tileX];
}

function drawWallTile(mapX, mapY, alpha = 1, camera = getCameraOrigin()) {
  const tile = getWallTile(mapX, mapY);

  if (!tile.complete || tile.naturalWidth === 0) {
    drawGlyph(mapX, mapY, WALL, palette.wall, alpha, camera);
    return;
  }

  const screenCell = getScreenCell(mapX, mapY, camera);

  context.globalAlpha = alpha;
  context.drawImage(tile, screenCell.x, screenCell.y, screenCell.size, screenCell.size);
  context.globalAlpha = 1;
}

function drawFloorTile(mapX, mapY, alpha = 1, camera = getCameraOrigin()) {
  if (!floorTile.complete || floorTile.naturalWidth === 0) {
    drawGlyph(mapX, mapY, FLOOR, palette.floor, alpha, camera);
    return;
  }

  const screenCell = getScreenCell(mapX, mapY, camera);
  const sourceWidth = floorTile.naturalWidth / FLOOR_TEXTURE_CELLS;
  const sourceHeight = floorTile.naturalHeight / FLOOR_TEXTURE_CELLS;
  const sourceX = ((mapX % FLOOR_TEXTURE_CELLS) + FLOOR_TEXTURE_CELLS) % FLOOR_TEXTURE_CELLS;
  const sourceY = ((mapY % FLOOR_TEXTURE_CELLS) + FLOOR_TEXTURE_CELLS) % FLOOR_TEXTURE_CELLS;

  context.globalAlpha = alpha;
  context.drawImage(
    floorTile,
    sourceX * sourceWidth,
    sourceY * sourceHeight,
    sourceWidth,
    sourceHeight,
    screenCell.x,
    screenCell.y,
    screenCell.size,
    screenCell.size
  );
  context.globalAlpha = 1;
}

function drawMapCell(mapX, mapY, camera) {
  if (!isInsideMap(mapX, mapY)) return;

  const cellKey = key(mapX, mapY);
  const cell = getCell(mapX, mapY);
  const explored = state.explored.has(cellKey);
  const visible = state.visible.has(cellKey);

  if (cell === WALL) {
    drawWallTile(mapX, mapY, explored ? 1 : 0.42, camera);
    return;
  }

  drawFloorTile(mapX, mapY, explored ? (visible ? 1 : 0.55) : 0.18, camera);
}

function getPlayerFrameRow() {
  if (state.playerDirection === "up") return 3;
  if (state.playerDirection === "left" || state.playerDirection === "right") return 2;
  return state.playerWalking ? 1 : 0;
}

function drawPlayer(camera) {
  if (!playerSpritesheet.complete || playerSpritesheet.naturalWidth === 0) {
    drawGlyph(state.player.x, state.player.y, "@", palette.player, 1, camera);
    return;
  }

  const screenCell = getScreenCell(state.player.x, state.player.y, camera);
  const frameWidth = playerSpritesheet.naturalWidth / SPRITESHEET_COLUMNS;
  const frameHeight = playerSpritesheet.naturalHeight / SPRITESHEET_ROWS;
  const frameColumn = state.playerFrame % SPRITESHEET_COLUMNS;
  const frameRow = getPlayerFrameRow();
  const spriteSize = screenCell.size * PLAYER_SPRITE_SCALE;
  const spriteX = screenCell.x + (screenCell.size - spriteSize) / 2;
  const spriteY = screenCell.y + (screenCell.size - spriteSize) / 2;

  context.save();
  if (state.playerDirection === "left") {
    context.translate(spriteX + spriteSize, spriteY);
    context.scale(-1, 1);
    context.drawImage(
      playerSpritesheet,
      frameColumn * frameWidth,
      frameRow * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      spriteSize,
      spriteSize
    );
  } else {
    context.drawImage(
      playerSpritesheet,
      frameColumn * frameWidth,
      frameRow * frameHeight,
      frameWidth,
      frameHeight,
      spriteX,
      spriteY,
      spriteSize,
      spriteSize
    );
  }
  context.restore();
}

function draw() {
  computeFov();
  clearCanvas();

  const camera = getCameraOrigin();
  const viewportCells = getViewportCells();
  const startX = Math.max(0, Math.floor(camera.x));
  const startY = Math.max(0, Math.floor(camera.y));
  const endX = Math.min(MAP_SIZE - 1, Math.ceil(camera.x + viewportCells));
  const endY = Math.min(MAP_SIZE - 1, Math.ceil(camera.y + viewportCells));

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      drawMapCell(x, y, camera);
    }
  }

  drawPlayer(camera);
}

function handleWheel(event) {
  event.preventDefault();

  const direction = event.deltaY < 0 ? 1 : -1;
  const nextZoom = direction > 0
    ? state.zoom * ZOOM_STEP
    : state.zoom / ZOOM_STEP;

  state.zoom = clamp(nextZoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  draw();
}

function stopAutoWalk() {
  clearInterval(state.walkTimer);
  state.walkTimer = null;
  state.playerWalking = false;
}

function settlePlayerIdle() {
  clearTimeout(state.stepTimer);
  state.stepTimer = setTimeout(() => {
    if (state.walkTimer) return;
    state.playerWalking = false;
    draw();
  }, AUTO_WALK_STEP_MS);
}

function findPathTo(target) {
  const path = [];
  const astar = new ROT.Path.AStar(target.x, target.y, (x, y) => isInsideMap(x, y) && isOpen(x, y), {
    topology: 4
  });

  astar.compute(state.player.x, state.player.y, (x, y) => {
    path.push({ x, y });
  });

  return path;
}

function walkPath(path) {
  stopAutoWalk();

  if (path.length <= 1) return;

  let nextStep = 1;
  state.playerWalking = true;
  state.walkTimer = setInterval(() => {
    const step = path[nextStep];

    if (!step || !isOpen(step.x, step.y)) {
      stopAutoWalk();
      return;
    }

    updatePlayerAnimation(step.x - state.player.x, step.y - state.player.y);
    state.player = step;
    nextStep += 1;
    draw();

    if (nextStep >= path.length) {
      stopAutoWalk();
      draw();
    }
  }, AUTO_WALK_STEP_MS);
}

function handleCanvasClick(event) {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const target = getMapCellFromClientPoint(event.clientX, event.clientY);

  if (!isInsideMap(target.x, target.y) || !isOpen(target.x, target.y)) return;
  if (target.x === state.player.x && target.y === state.player.y) return;

  walkPath(findPathTo(target));
}

function movePlayer(dx, dy) {
  stopAutoWalk();

  const next = {
    x: state.player.x + dx,
    y: state.player.y + dy
  };

  if (!isOpen(next.x, next.y)) return;

  updatePlayerAnimation(dx, dy);
  state.player = next;
  draw();
  settlePlayerIdle();
}

function updatePlayerAnimation(dx, dy) {
  if (dx > 0) state.playerDirection = "right";
  if (dx < 0) state.playerDirection = "left";
  if (dy > 0) state.playerDirection = "down";
  if (dy < 0) state.playerDirection = "up";

  state.playerFrame = (state.playerFrame + 1) % SPRITESHEET_COLUMNS;
  state.playerWalking = true;
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
  stopAutoWalk();
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
  if (event.pointerType !== "touch") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isControlTarget(event.target)) return;

  event.preventDefault();
  stopAutoWalk();
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
canvas.addEventListener("click", handleCanvasClick);
canvas.addEventListener("wheel", handleWheel, { passive: false });
window.addEventListener("keydown", handleKeydown);
window.addEventListener("pointerdown", handlePointerDown, { passive: false });
window.addEventListener("pointermove", handlePointerMove, { passive: false });
window.addEventListener("pointerup", handlePointerEnd);
window.addEventListener("pointercancel", handlePointerEnd);
window.addEventListener("blur", stopJoystick);

generateCave();
