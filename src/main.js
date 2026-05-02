import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

const CubeModel = window.Cube;

const canvas = document.querySelector("#cubeCanvas");
const moveCountEl = document.querySelector("#moveCount");
const scrambleTextEl = document.querySelector("#scrambleText");
const gameStatusEl = document.querySelector("#gameStatus");
const toastEl = document.querySelector("#toast");
const victoryPanel = document.querySelector("#victoryPanel");
const victoryStatsEl = document.querySelector("#victoryStats");
const resetBtn = document.querySelector("#resetBtn");
const newBtn = document.querySelector("#newBtn");
const solveBtn = document.querySelector("#solveBtn");
const paletteBtn = document.querySelector("#paletteBtn");
const modeButtons = [...document.querySelectorAll(".mode-btn")];
const turnButtons = [...document.querySelectorAll(".turn-btn")];
const allButtons = [...document.querySelectorAll("button")];

const CUBIE_SIZE = 0.94;
const STICKER_SIZE = 0.72;
const STICKER_OFFSET = CUBIE_SIZE / 2 + 0.006;
const SPACING = 1.05;
const MOVE_DURATION = 250;
const FACE_KEYS = ["U", "R", "F", "D", "L", "B"];
const SCRAMBLE_MIN = 24;
const SCRAMBLE_VARIANCE = 9;

const AXIS_BY_FACE = {
  U: "y",
  D: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z"
};

const OPPOSITE_FACE = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F"
};

const MOVE_DEFS = {
  U: { axis: "y", layer: 1, direction: -1 },
  D: { axis: "y", layer: -1, direction: 1 },
  R: { axis: "x", layer: 1, direction: -1 },
  L: { axis: "x", layer: -1, direction: 1 },
  F: { axis: "z", layer: 1, direction: -1 },
  B: { axis: "z", layer: -1, direction: 1 }
};

const PALETTES = [
  {
    name: "Классика",
    body: 0x101010,
    edge: 0x050505,
    stickers: {
      U: 0xf7f3e8,
      D: 0xffd338,
      R: 0xe84134,
      L: 0xff8c1a,
      F: 0x23b46e,
      B: 0x2166ff
    }
  },
  {
    name: "Неон",
    body: 0x141414,
    edge: 0x020202,
    stickers: {
      U: 0xf9fffb,
      D: 0xffe44d,
      R: 0xff3f7c,
      L: 0xff9650,
      F: 0x4af7c9,
      B: 0x5f78ff
    }
  },
  {
    name: "Мягкая",
    body: 0x181716,
    edge: 0x070707,
    stickers: {
      U: 0xfaf6e9,
      D: 0xf1c94a,
      R: 0xd95757,
      L: 0xf28f45,
      F: 0x51b98f,
      B: 0x4d7ecf
    }
  }
];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
});
const controls = new OrbitControls(camera, renderer.domElement);
const clock = new THREE.Clock();
const cubeRoot = new THREE.Group();
const victoryGroup = new THREE.Group();
const haloGroup = new THREE.Group();

let cubies = [];
let stickerMaterials = {};
let activePaletteIndex = 0;
let bodyMaterial;
let edgeMaterial;
let logicalCube = new CubeModel();
let scrambleMoves = [];
let currentAlgMoves = [];
let playerMoveCount = 0;
let bestScrambleSolution = "";
let selectedSuffix = "";
let moveQueue = [];
let isTurning = false;
let busy = false;
let autoSolving = false;
let victoryShown = false;
let toastTimer = null;
let solveRequestId = 0;
let confetti = [];

const solverWorker = new Worker(new URL("./solverWorker.js", import.meta.url));
const pendingSolves = new Map();

initScene();
initUi();
startNewGame();
animate();

function initScene() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera.position.set(4.8, 4.2, 6.2);

  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 10;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0xfff4df, 0x152623, 2.0);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  const fill = new THREE.PointLight(0x36d3bf, 4.4, 12);
  const warm = new THREE.PointLight(0xffb238, 2.8, 11);
  key.position.set(4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 15;
  fill.position.set(-4.2, 1.8, 4.8);
  warm.position.set(3.6, -1.2, -3.8);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x242321,
    transparent: true,
    opacity: 0.34,
    roughness: 0.92,
    metalness: 0.02
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.8, 96), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.08;
  floor.receiveShadow = true;

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f3e8,
    emissive: 0x36d3bf,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.18,
    roughness: 0.5
  });
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.01, 10, 160), ringMaterial);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = -1.96;

  createVictoryHalo();

  scene.add(ambient, key, fill, warm, floor, baseRing, cubeRoot, victoryGroup, haloGroup);
  window.addEventListener("resize", onResize);
}

function createVictoryHalo() {
  const geometry = new THREE.TorusGeometry(2.15, 0.018, 10, 160);
  const colors = [0x36d3bf, 0xffb238, 0xff6b5f];

  colors.forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.0,
      roughness: 0.3
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.set(Math.PI / 2, (index * Math.PI) / 3, (index * Math.PI) / 4);
    ring.userData.baseRotation = ring.rotation.clone();
    haloGroup.add(ring);
  });

  haloGroup.visible = false;
}

function initUi() {
  turnButtons.forEach((button) => {
    button.addEventListener("click", () => {
      playMove(`${button.dataset.face}${selectedSuffix}`);
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedSuffix = button.dataset.suffix;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  resetBtn.addEventListener("click", resetCurrentScramble);
  newBtn.addEventListener("click", startNewGame);
  solveBtn.addEventListener("click", autoSolveCurrent);
  paletteBtn.addEventListener("click", cyclePalette);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toUpperCase();

    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (FACE_KEYS.includes(key)) {
      event.preventDefault();
      playMove(`${key}${event.shiftKey ? "'" : selectedSuffix}`);
    }
  });

  solverWorker.addEventListener("message", (event) => {
    const { id, ok, error, solution, moves, elapsed } = event.data;
    const pending = pendingSolves.get(id);

    if (!pending) {
      return;
    }

    pendingSolves.delete(id);

    if (ok) {
      pending.resolve({ solution, moves, elapsed });
    } else {
      pending.reject(new Error(error));
    }
  });
}

function createMaterials() {
  const palette = PALETTES[activePaletteIndex];

  bodyMaterial = new THREE.MeshStandardMaterial({
    color: palette.body,
    roughness: 0.68,
    metalness: 0.12
  });
  edgeMaterial = new THREE.LineBasicMaterial({
    color: palette.edge,
    transparent: true,
    opacity: 0.74
  });

  stickerMaterials = Object.fromEntries(
    Object.entries(palette.stickers).map(([face, color]) => [
      face,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.035,
        roughness: 0.46,
        metalness: 0.02,
        side: THREE.FrontSide
      })
    ])
  );
}

function buildCube() {
  cubeRoot.clear();
  cubies = [];
  createMaterials();

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const cubie = createCubie(x, y, z);
        cubies.push(cubie);
        cubeRoot.add(cubie.group);
      }
    }
  }
}

function createCubie(x, y, z) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
  const body = new THREE.Mesh(geometry, bodyMaterial);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);

  group.position.set(x * SPACING, y * SPACING, z * SPACING);
  group.userData.home = { x, y, z };
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body, edges);

  if (y === 1) addSticker(group, "U", [0, STICKER_OFFSET, 0], [-Math.PI / 2, 0, 0]);
  if (y === -1) addSticker(group, "D", [0, -STICKER_OFFSET, 0], [Math.PI / 2, 0, 0]);
  if (x === 1) addSticker(group, "R", [STICKER_OFFSET, 0, 0], [0, Math.PI / 2, 0]);
  if (x === -1) addSticker(group, "L", [-STICKER_OFFSET, 0, 0], [0, -Math.PI / 2, 0]);
  if (z === 1) addSticker(group, "F", [0, 0, STICKER_OFFSET], [0, 0, 0]);
  if (z === -1) addSticker(group, "B", [0, 0, -STICKER_OFFSET], [0, Math.PI, 0]);

  return {
    group,
    coord: { x, y, z }
  };
}

function addSticker(group, face, position, rotation) {
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE), stickerMaterials[face]);
  sticker.position.set(...position);
  sticker.rotation.set(...rotation);
  sticker.userData.face = face;
  group.add(sticker);
}

async function startNewGame() {
  if (busy) return;

  busy = true;
  clearVictory();
  setButtonsDisabled(true);
  gameStatusEl.textContent = "Генерирую сложный расклад";

  buildCube();
  logicalCube = new CubeModel();
  scrambleMoves = generateScramble();
  currentAlgMoves = [...scrambleMoves];
  playerMoveCount = 0;
  bestScrambleSolution = CubeModel.inverse(scrambleMoves.join(" "));
  logicalCube.move(scrambleMoves.join(" "));

  updateHud();

  for (const move of scrambleMoves) {
    await enqueueMove(move, { animate: false });
  }

  setButtonsDisabled(false);
  busy = false;
  gameStatusEl.textContent = "Сложный расклад готов";
}

async function resetCurrentScramble() {
  if (busy || isTurning) return;

  busy = true;
  clearVictory();
  setButtonsDisabled(true);
  buildCube();
  logicalCube = new CubeModel();
  logicalCube.move(scrambleMoves.join(" "));
  currentAlgMoves = [...scrambleMoves];
  playerMoveCount = 0;

  for (const move of scrambleMoves) {
    await enqueueMove(move, { animate: false });
  }

  updateHud();
  gameStatusEl.textContent = "Расклад сброшен";
  setButtonsDisabled(false);
  busy = false;
  showToast("Попытка начата заново");
}

function generateScramble() {
  const length = SCRAMBLE_MIN + Math.floor(Math.random() * SCRAMBLE_VARIANCE);
  const suffixes = ["", "'", "2"];
  const moves = [];
  let previousFace = null;
  let previousAxis = null;

  while (moves.length < length) {
    const face = FACE_KEYS[Math.floor(Math.random() * FACE_KEYS.length)];
    const axis = AXIS_BY_FACE[face];

    if (face === previousFace || face === OPPOSITE_FACE[previousFace] || axis === previousAxis) {
      continue;
    }

    previousFace = face;
    previousAxis = axis;
    moves.push(`${face}${suffixes[Math.floor(Math.random() * suffixes.length)]}`);
  }

  return moves;
}

async function playMove(move) {
  if (busy || autoSolving || !MOVE_DEFS[move[0]]) return;

  await enqueueMove(move, {
    animate: true,
    updateLogical: true,
    record: true,
    count: true,
    checkSolved: true
  });
}

async function autoSolveCurrent() {
  if (busy || autoSolving || isTurning) return;

  autoSolving = true;
  setButtonsDisabled(true, { keepSolve: true });
  solveBtn.disabled = true;
  gameStatusEl.textContent = "Решатель ищет сборку";
  showToast("Считаю маршрут сборки");

  try {
    const currentAlgorithm = currentAlgMoves.join(" ");
    const fallbackSolution = CubeModel.inverse(currentAlgorithm);
    const result = await requestSolve(currentAlgorithm, {
      upperBoundSolution: fallbackSolution
    });
    const moves = parseSolution(result.solution);

    if (moves.length === 0) {
      checkSolved();
      return;
    }

    for (const move of moves) {
      await enqueueMove(move, {
        animate: true,
        updateLogical: true,
        record: true,
        count: true,
        checkSolved: true,
        duration: 210
      });
    }
  } catch (error) {
    showToast("Решатель не успел построить маршрут");
    gameStatusEl.textContent = "Можно собирать вручную";
  } finally {
    autoSolving = false;
    setButtonsDisabled(false);
  }
}

function cyclePalette() {
  activePaletteIndex = (activePaletteIndex + 1) % PALETTES.length;
  const palette = PALETTES[activePaletteIndex];

  createMaterials();
  cubies.forEach((cubie) => {
    cubie.group.traverse((object) => {
      if (object.isMesh && object.userData.face) {
        object.material = stickerMaterials[object.userData.face];
      } else if (object.isMesh) {
        object.material = bodyMaterial;
      } else if (object.isLineSegments) {
        object.material = edgeMaterial;
      }
    });
  });

  showToast(`Палитра: ${palette.name}`);
}

function enqueueMove(move, options = {}) {
  return new Promise((resolve) => {
    moveQueue.push({ move, options, resolve });
    pumpQueue();
  });
}

async function pumpQueue() {
  if (isTurning || moveQueue.length === 0) {
    return;
  }

  const item = moveQueue.shift();
  isTurning = true;
  await executeMove(item.move, item.options);
  isTurning = false;
  item.resolve();
  pumpQueue();
}

function executeMove(move, options) {
  const face = move[0];
  const suffix = move.slice(1);
  const def = MOVE_DEFS[face];

  if (!def) {
    return Promise.resolve();
  }

  const turns = suffix === "2" ? 2 : 1;
  const quarterSign = suffix === "'" ? -def.direction : def.direction;
  const angle = quarterSign * turns * (Math.PI / 2);
  const selected = cubies.filter((cubie) => cubie.coord[def.axis] === def.layer);
  const pivot = new THREE.Group();

  cubeRoot.add(pivot);
  selected.forEach((cubie) => pivot.attach(cubie.group));

  return animatePivot(pivot, def.axis, angle, options).then(() => {
    pivot.rotation[def.axis] = angle;
    pivot.updateMatrixWorld(true);
    selected.forEach((cubie) => cubeRoot.attach(cubie.group));
    cubeRoot.remove(pivot);

    for (let i = 0; i < turns; i += 1) {
      selected.forEach((cubie) => {
        cubie.coord = rotateCoord(cubie.coord, def.axis, quarterSign);
      });
    }

    selected.forEach(snapCubie);

    if (options.updateLogical) {
      logicalCube.move(move);
    }

    if (options.record) {
      currentAlgMoves.push(move);
    }

    if (options.count) {
      playerMoveCount += 1;
      updateHud();
    }

    if (options.checkSolved) {
      checkSolved();
    }
  });
}

function animatePivot(pivot, axis, angle, options) {
  const duration = options.animate === false ? 0 : options.duration || MOVE_DURATION;

  if (duration <= 0) {
    pivot.rotation[axis] = angle;
    return Promise.resolve();
  }

  const start = performance.now();

  return new Promise((resolve) => {
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      pivot.rotation[axis] = angle * easeOutCubic(progress);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

function rotateCoord(coord, axis, sign) {
  const { x, y, z } = coord;

  if (axis === "x") {
    return sign > 0 ? { x, y: -z, z: y } : { x, y: z, z: -y };
  }

  if (axis === "y") {
    return sign > 0 ? { x: z, y, z: -x } : { x: -z, y, z: x };
  }

  return sign > 0 ? { x: -y, y: x, z } : { x: y, y: -x, z };
}

function snapCubie(cubie) {
  cubie.group.position.set(
    cubie.coord.x * SPACING,
    cubie.coord.y * SPACING,
    cubie.coord.z * SPACING
  );
}

function checkSolved() {
  if (!logicalCube.isSolved() || victoryShown) {
    return;
  }

  triggerVictory();
}

function triggerVictory() {
  victoryShown = true;
  document.body.classList.add("victory-mode");
  victoryPanel.classList.add("visible");
  haloGroup.visible = true;
  gameStatusEl.textContent = "Куб собран";
  victoryStatsEl.textContent = `Ходов: ${playerMoveCount}`;
  spawnConfetti();
}

function clearVictory() {
  victoryShown = false;
  document.body.classList.remove("victory-mode");
  victoryPanel.classList.remove("visible");
  haloGroup.visible = false;
  haloGroup.children.forEach((ring) => {
    ring.material.opacity = 0;
  });
  confetti.forEach((particle) => {
    victoryGroup.remove(particle.mesh);
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
  });
  confetti = [];
}

function spawnConfetti() {
  const palette = PALETTES[activePaletteIndex].stickers;
  const colors = Object.values(palette);

  for (let i = 0; i < 190; i += 1) {
    const geometry = new THREE.BoxGeometry(0.045, 0.018, 0.045);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 1,
      roughness: 0.4
    });
    const mesh = new THREE.Mesh(geometry, material);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 1.2 + Math.random() * 2.8;

    mesh.position.set(0, 0, 0);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    victoryGroup.add(mesh);

    confetti.push({
      mesh,
      velocity: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 0.8,
        Math.sin(phi) * Math.sin(theta) * speed
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      ),
      age: 0,
      life: 2.4 + Math.random() * 1.8
    });
  }
}

function updateConfetti(delta) {
  for (let i = confetti.length - 1; i >= 0; i -= 1) {
    const particle = confetti[i];
    particle.age += delta;
    particle.velocity.y -= 1.25 * delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.mesh.rotation.x += particle.spin.x * delta;
    particle.mesh.rotation.y += particle.spin.y * delta;
    particle.mesh.rotation.z += particle.spin.z * delta;
    particle.mesh.material.opacity = Math.max(0, 1 - particle.age / particle.life);

    if (particle.age > particle.life) {
      victoryGroup.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      confetti.splice(i, 1);
    }
  }
}

function updateHalo(delta) {
  if (!haloGroup.visible) {
    return;
  }

  haloGroup.children.forEach((ring, index) => {
    ring.material.opacity = Math.min(0.72, ring.material.opacity + delta * 1.1);
    ring.rotation.x = ring.userData.baseRotation.x + performance.now() * 0.00032 * (index + 1);
    ring.rotation.y = ring.userData.baseRotation.y + performance.now() * 0.00024 * (index + 1);
  });
}

function updateHud() {
  moveCountEl.textContent = String(playerMoveCount);
  scrambleTextEl.textContent = scrambleMoves.join(" ");
  scrambleTextEl.title = scrambleMoves.join(" ");
}

function requestSolve(algorithm, options = {}) {
  solveRequestId += 1;
  const id = solveRequestId;
  const {
    refine = false,
    upperBoundSolution = "",
    probeLimit = 0
  } = options;

  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject });
    solverWorker.postMessage({ id, algorithm, refine, upperBoundSolution, probeLimit });
  });
}

function parseSolution(solution) {
  const trimmed = (solution || "").trim();
  return trimmed ? trimmed.split(/\s+/).filter((move) => MOVE_DEFS[move[0]]) : [];
}

function setButtonsDisabled(disabled, options = {}) {
  allButtons.forEach((button) => {
    button.disabled = disabled;
  });

  if (options.keepSolve) {
    solveBtn.disabled = false;
  }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 1700);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  controls.update();
  updateConfetti(delta);
  updateHalo(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
