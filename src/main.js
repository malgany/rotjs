import * as ROT from "rot-js";
import "./styles.css";

const SIZE = 45;
const FOV_RADIUS = 10;
const WALL = "#";
const FLOOR = ".";

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

displayMount.appendChild(display.getContainer());

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

regenButton.addEventListener("click", regenerateFromInput);
seedInput.addEventListener("change", regenerateFromInput);
window.addEventListener("keydown", handleKeydown);

generateCave();
