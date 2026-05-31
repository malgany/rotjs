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
import warriorUrl from "./assets/characters/warrior.png";
import goblinUrl from "./assets/enemies/goblin.png";
import impUrl from "./assets/enemies/imp.png";
import skeletonUrl from "./assets/enemies/skeleton.png";
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
const PLAYER_SPRITE_SCALE = 1.9;
const ENEMY_SPRITE_SCALE = 1.75;
const ENEMY_COUNT = 6;
const ENEMY_PATROL_RADIUS = 3;
const ENEMY_VISION_RADIUS = 8;
const ENEMY_STEP_MS = 420;
const ENEMY_ATTACK_COOLDOWN_MS = 950;
const PLAYER_ATTACK_COOLDOWN_MS = 430;
const ATTACK_SWING_MS = 180;
const HIT_FLASH_MS = 170;
const DAMAGE_FLASH_MS = 260;
const SHAKE_MS = 190;
const PLAYER_MAX_HP = 6;

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
  enemyTimer: null,
  animationFrame: null,
  enemies: [],
  nextEnemyId: 1,
  player: { x: 0, y: 0 },
  playerHp: PLAYER_MAX_HP,
  playerDirection: "right",
  playerWalking: false,
  playerAttackUntil: 0,
  playerAttackCooldownUntil: 0,
  playerBlinkUntil: 0,
  screenFlashUntil: 0,
  shakeUntil: 0
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
const actorTiles = {
  player: createTileImage(warriorUrl),
  goblin: createTileImage(goblinUrl),
  imp: createTileImage(impUrl),
  skeleton: createTileImage(skeletonUrl)
};
const enemyTypes = [
  { type: "goblin", hp: 2, damage: 1 },
  { type: "skeleton", hp: 2, damage: 1 },
  { type: "imp", hp: 3, damage: 1 }
];

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

function getAliveEnemies() {
  return state.enemies.filter((enemy) => enemy.hp > 0);
}

function getEnemyAt(x, y) {
  return getAliveEnemies().find((enemy) => enemy.x === x && enemy.y === y);
}

function isPlayerAt(x, y) {
  return state.player.x === x && state.player.y === y;
}

function isActorBlocked(x, y, ignoredEnemyId = null) {
  return isPlayerAt(x, y) || getAliveEnemies().some((enemy) => enemy.id !== ignoredEnemyId && enemy.x === x && enemy.y === y);
}

function generateCave() {
  stopEnemyLoop();
  stopAutoWalk();
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
  state.playerHp = PLAYER_MAX_HP;
  state.playerDirection = "right";
  state.playerWalking = false;
  spawnEnemies();
  startEnemyLoop();
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

function distanceBetween(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function shuffleCells(cells) {
  return cells.sort(() => ROT.RNG.getUniform() - 0.5);
}

function spawnEnemies() {
  const openCells = shuffleCells([...state.map.entries()]
    .filter(([, value]) => value === FLOOR)
    .map(([cellKey]) => readKey(cellKey))
    .filter((cell) => distanceBetween(cell, state.player) > 5));
  const firstSightCells = openCells
    .filter((cell) => distanceBetween(cell, state.player) <= ENEMY_VISION_RADIUS && lineOfSight(cell, state.player))
    .slice(0, 2);
  const selectedCells = [...firstSightCells];

  for (const cell of openCells) {
    if (selectedCells.length >= ENEMY_COUNT) break;
    if (selectedCells.some((selected) => selected.x === cell.x && selected.y === cell.y)) continue;
    selectedCells.push(cell);
  }

  state.enemies = selectedCells.map((cell, index) => {
    const enemyType = enemyTypes[index % enemyTypes.length];

    return {
      id: state.nextEnemyId,
      type: enemyType.type,
      x: cell.x,
      y: cell.y,
      origin: { x: cell.x, y: cell.y },
      hp: enemyType.hp,
      maxHp: enemyType.hp,
      damage: enemyType.damage,
      direction: "right",
      nextAttackAt: 0,
      hitFlashUntil: 0
    };
  });
  state.nextEnemyId += state.enemies.length;
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

function lineOfSight(from, to) {
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;

  while (!(x0 === x1 && y0 === y1)) {
    const twiceError = error * 2;
    if (twiceError > -dy) {
      error -= dy;
      x0 += sx;
    }
    if (twiceError < dx) {
      error += dx;
      y0 += sy;
    }
    if (!(x0 === x1 && y0 === y1) && !isOpen(x0, y0)) return false;
  }

  return true;
}

function canEnemySeePlayer(enemy) {
  return distanceBetween(enemy, state.player) <= ENEMY_VISION_RADIUS && lineOfSight(enemy, state.player);
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

function drawActorImage({ image, x, y, camera, direction = "right", scale = 1, flashWhite = false, attackUntil = 0 }) {
  if (!image.complete || image.naturalWidth === 0) {
    drawGlyph(x, y, "@", palette.player, 1, camera);
    return;
  }

  const now = performance.now();
  const screenCell = getScreenCell(x, y, camera);
  const spriteSize = screenCell.size * scale;
  const attackProgress = Math.max(0, attackUntil - now) / ATTACK_SWING_MS;
  const attackNudge = Math.sin(attackProgress * Math.PI * 2) * screenCell.size * 0.18;
  const directionSign = direction === "left" ? -1 : 1;
  const spriteX = screenCell.x + (screenCell.size - spriteSize) / 2;
  const spriteY = screenCell.y + screenCell.size - spriteSize * 0.88;
  const drawX = spriteX + attackNudge * directionSign;

  context.save();
  context.imageSmoothingEnabled = false;
  context.filter = flashWhite ? "brightness(3.8) grayscale(1)" : "none";
  if (direction === "left") {
    context.translate(drawX + spriteSize, spriteY);
    context.scale(-1, 1);
    context.drawImage(image, 0, 0, spriteSize, spriteSize);
  } else {
    context.drawImage(image, drawX, spriteY, spriteSize, spriteSize);
  }
  context.filter = "none";
  context.restore();
}

function drawHealthBar(x, y, camera, current, max) {
  if (current >= max) return;

  const screenCell = getScreenCell(x, y, camera);
  const width = screenCell.size * 0.82;
  const height = Math.max(3, screenCell.size * 0.08);
  const barX = screenCell.x + (screenCell.size - width) / 2;
  const barY = screenCell.y + screenCell.size * 0.08;

  context.fillStyle = "rgba(8, 9, 10, 0.78)";
  context.fillRect(barX, barY, width, height);
  context.fillStyle = "#c94444";
  context.fillRect(barX, barY, width * (current / max), height);
}

function drawEnemies(camera, now) {
  for (const enemy of getAliveEnemies()) {
    if (!state.visible.has(key(enemy.x, enemy.y))) continue;

    drawActorImage({
      image: actorTiles[enemy.type],
      x: enemy.x,
      y: enemy.y,
      camera,
      direction: enemy.direction,
      scale: ENEMY_SPRITE_SCALE,
      flashWhite: enemy.hitFlashUntil > now
    });
    drawHealthBar(enemy.x, enemy.y, camera, enemy.hp, enemy.maxHp);
  }
}

function drawPlayer(camera, now) {
  drawActorImage({
    image: actorTiles.player,
    x: state.player.x,
    y: state.player.y,
    camera,
    direction: state.playerDirection,
    scale: PLAYER_SPRITE_SCALE,
    flashWhite: state.playerBlinkUntil > now,
    attackUntil: state.playerAttackUntil
  });
}

function getShakeOffset(now) {
  if (state.shakeUntil <= now) return { x: 0, y: 0 };

  const progress = (state.shakeUntil - now) / SHAKE_MS;
  const amplitude = 8 * progress;
  return {
    x: Math.sin(now * 0.09) * amplitude,
    y: Math.cos(now * 0.11) * amplitude
  };
}

function drawScreenEffects(now) {
  if (state.screenFlashUntil > now) {
    const alpha = 0.34 * ((state.screenFlashUntil - now) / DAMAGE_FLASH_MS);
    context.fillStyle = `rgba(190, 22, 22, ${alpha})`;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  context.fillStyle = "rgba(8, 9, 10, 0.52)";
  context.fillRect(12, 12, 118, 28);
  context.fillStyle = "#d5d8dc";
  context.font = "16px Consolas, 'Courier New', monospace";
  context.textAlign = "left";
  context.fillText(`HP ${state.playerHp}/${PLAYER_MAX_HP}`, 22, 27);
  context.textAlign = "center";

  if (hasActiveEffects(now)) scheduleAnimationFrame();
}

function draw() {
  const now = performance.now();
  computeFov();
  clearCanvas();

  const camera = getCameraOrigin();
  const shake = getShakeOffset(now);
  const viewportCells = getViewportCells();
  const startX = Math.max(0, Math.floor(camera.x));
  const startY = Math.max(0, Math.floor(camera.y));
  const endX = Math.min(MAP_SIZE - 1, Math.ceil(camera.x + viewportCells));
  const endY = Math.min(MAP_SIZE - 1, Math.ceil(camera.y + viewportCells));

  context.save();
  context.translate(shake.x, shake.y);
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      drawMapCell(x, y, camera);
    }
  }

  drawEnemies(camera, now);
  drawPlayer(camera, now);
  context.restore();
  drawScreenEffects(now);
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

function hasActiveEffects(now = performance.now()) {
  return state.shakeUntil > now
    || state.screenFlashUntil > now
    || state.playerBlinkUntil > now
    || state.playerAttackUntil > now
    || getAliveEnemies().some((enemy) => enemy.hitFlashUntil > now);
}

function scheduleAnimationFrame() {
  if (state.animationFrame) return;

  state.animationFrame = requestAnimationFrame(() => {
    state.animationFrame = null;
    draw();
  });
}

function triggerShake(duration = SHAKE_MS) {
  state.shakeUntil = Math.max(state.shakeUntil, performance.now() + duration);
  scheduleAnimationFrame();
}

function findPath(from, target, { ignoredEnemyId = null, allowTargetOccupied = false } = {}) {
  const path = [];
  const astar = new ROT.Path.AStar(target.x, target.y, (x, y) => {
    if (!isInsideMap(x, y) || !isOpen(x, y)) return false;
    if (allowTargetOccupied && x === target.x && y === target.y) return true;
    return !isActorBlocked(x, y, ignoredEnemyId);
  }, {
    topology: 4
  });

  astar.compute(from.x, from.y, (x, y) => {
    path.push({ x, y });
  });

  return path;
}

function findPathTo(target) {
  return findPath(state.player, target);
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

    const enemy = getEnemyAt(step.x, step.y);
    if (enemy) {
      stopAutoWalk();
      attackEnemy(enemy);
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
  const enemy = getEnemyAt(target.x, target.y);

  if (enemy && distanceBetween(enemy, state.player) === 1) {
    attackEnemy(enemy);
    return;
  }

  if (!isInsideMap(target.x, target.y) || !isOpen(target.x, target.y)) return;
  if (target.x === state.player.x && target.y === state.player.y) return;

  walkPath(findPathTo(target));
}

function faceTarget(target) {
  if (target.x > state.player.x) state.playerDirection = "right";
  if (target.x < state.player.x) state.playerDirection = "left";
}

function attackEnemy(enemy) {
  const now = performance.now();
  if (now < state.playerAttackCooldownUntil) return;

  faceTarget(enemy);
  state.playerAttackUntil = now + ATTACK_SWING_MS;
  state.playerAttackCooldownUntil = now + PLAYER_ATTACK_COOLDOWN_MS;
  enemy.hitFlashUntil = now + HIT_FLASH_MS;
  enemy.hp -= 1;
  triggerShake(120);

  if (enemy.hp <= 0) {
    state.enemies = state.enemies.filter((candidate) => candidate.id !== enemy.id);
  }

  draw();
  scheduleAnimationFrame();
}

function attackNearestEnemy() {
  const enemy = getAliveEnemies()
    .filter((candidate) => distanceBetween(candidate, state.player) === 1)
    .sort((a, b) => {
      const directionScoreA = a.x > state.player.x === (state.playerDirection === "right") ? 0 : 1;
      const directionScoreB = b.x > state.player.x === (state.playerDirection === "right") ? 0 : 1;
      return directionScoreA - directionScoreB;
    })[0];

  if (enemy) attackEnemy(enemy);
}

function damagePlayer(amount) {
  const now = performance.now();
  state.playerHp = Math.max(0, state.playerHp - amount);
  state.playerBlinkUntil = now + HIT_FLASH_MS;
  state.screenFlashUntil = now + DAMAGE_FLASH_MS;
  triggerShake();

  if (state.playerHp <= 0) {
    stopAutoWalk();
    state.player = chooseStartCell();
    state.playerHp = PLAYER_MAX_HP;
    state.playerBlinkUntil = now + DAMAGE_FLASH_MS;
  }

  draw();
  scheduleAnimationFrame();
}

function movePlayer(dx, dy) {
  stopAutoWalk();

  const next = {
    x: state.player.x + dx,
    y: state.player.y + dy
  };

  const enemy = getEnemyAt(next.x, next.y);
  if (enemy) {
    updatePlayerAnimation(dx, dy);
    attackEnemy(enemy);
    return;
  }

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

  state.playerWalking = true;
}

function stopEnemyLoop() {
  clearInterval(state.enemyTimer);
  state.enemyTimer = null;
}

function startEnemyLoop() {
  stopEnemyLoop();
  state.enemyTimer = setInterval(tickEnemies, ENEMY_STEP_MS);
}

function getEnemyNeighbors(enemy) {
  return [
    { x: enemy.x + 1, y: enemy.y },
    { x: enemy.x - 1, y: enemy.y },
    { x: enemy.x, y: enemy.y + 1 },
    { x: enemy.x, y: enemy.y - 1 }
  ].filter((cell) => isOpen(cell.x, cell.y) && !isActorBlocked(cell.x, cell.y, enemy.id));
}

function moveEnemy(enemy, next) {
  if (next.x > enemy.x) enemy.direction = "right";
  if (next.x < enemy.x) enemy.direction = "left";
  enemy.x = next.x;
  enemy.y = next.y;
}

function choosePatrolStep(enemy) {
  const neighbors = getEnemyNeighbors(enemy)
    .filter((cell) => distanceBetween(cell, enemy.origin) <= ENEMY_PATROL_RADIUS);

  if (neighbors.length === 0 || ROT.RNG.getUniform() < 0.35) return null;
  return neighbors[ROT.RNG.getUniformInt(0, neighbors.length - 1)];
}

function chasePlayer(enemy) {
  const path = findPath(enemy, state.player, {
    ignoredEnemyId: enemy.id,
    allowTargetOccupied: true
  });

  if (path.length <= 1) return;
  const next = path[1];
  if (isPlayerAt(next.x, next.y)) return;
  if (isOpen(next.x, next.y) && !isActorBlocked(next.x, next.y, enemy.id)) moveEnemy(enemy, next);
}

function enemyAttackPlayer(enemy, now) {
  if (now < enemy.nextAttackAt) return;

  enemy.nextAttackAt = now + ENEMY_ATTACK_COOLDOWN_MS;
  if (enemy.x > state.player.x) enemy.direction = "left";
  if (enemy.x < state.player.x) enemy.direction = "right";
  damagePlayer(enemy.damage);
}

function tickEnemies() {
  const now = performance.now();
  let moved = false;

  for (const enemy of getAliveEnemies()) {
    if (distanceBetween(enemy, state.player) === 1) {
      enemyAttackPlayer(enemy, now);
      continue;
    }

    if (canEnemySeePlayer(enemy)) {
      chasePlayer(enemy);
      moved = true;
      continue;
    }

    const patrolStep = choosePatrolStep(enemy);
    if (patrolStep) {
      moveEnemy(enemy, patrolStep);
      moved = true;
    }
  }

  if (moved) draw();
}

function moveFromJoystick() {
  if (!joystickState.direction.x && !joystickState.direction.y) return;
  movePlayer(joystickState.direction.x, joystickState.direction.y);
}

function handleKeydown(event) {
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    attackNearestEnemy();
    return;
  }

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
