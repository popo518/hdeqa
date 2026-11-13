import * as THREE from 'three';
import { parseGardenSave, serializeGardenSave } from './save-data.js';
import { isWalkablePosition } from './world-rules.js';

// حديقتي — تجربة عالم مفتوح ثلاثية الأبعاد
// لا توجد حسابات أو خادم: التقدم محفوظ محليًا على جهاز المستخدم فقط.

const WORLD_HALF = 270;
const STORAGE_KEY = 'my-garden-save-v2';
const VALID_QUALITIES = ['auto', 'low', 'medium', 'high', 'ultra'];
const BUILD_ITEMS = {
  flower: { name: 'زهرة', cost: 1 },
  bush: { name: 'شجيرة', cost: 2 },
  tree: { name: 'شجرة', cost: 3 },
  bench: { name: 'مقعد خشبي', cost: 4 },
  lantern: { name: 'فانوس', cost: 3 },
  fountain: { name: 'نافورة', cost: 8 },
  arch: { name: 'قوس نباتي', cost: 10 },
  rock: { name: 'صخرة زينة', cost: 2 },
};
const TASKS = [
  {
    id: 'subhan',
    title: 'سبحان الله وبحمده',
    target: 100,
    reward: 5,
    detail: 'قل الذكر بنفسك، ثم اضغط «سجّلت تكرارًا» بعد كل مرة. عند إكمال 100 مرة تحصل على 5 بذور بناء.',
    reference: 'ورد فضل قولها مائة مرة في اليوم في صحيح البخاري (6405) وصحيح مسلم (2691).',
  },
];

const QUALITY = {
  low:    { label: 'منخفضة', dpr: 0.8,  shadows: false, shadowSize: 512,  trees: 72,  flowers: 280, wind: false, fireflies: false },
  medium: { label: 'متوسطة', dpr: 1.0,  shadows: false, shadowSize: 768,  trees: 105, flowers: 430, wind: false, fireflies: false },
  high:   { label: 'عالية',   dpr: 1.45, shadows: true,  shadowSize: 1024, trees: 135, flowers: 620, wind: false, fireflies: false },
  ultra:  { label: 'فائقة',   dpr: 1.7,  shadows: true,  shadowSize: 2048, trees: 160, flowers: 820, wind: true,  fireflies: true },
};

const QUALITY_DETAILS = {
  low: 'تفاصيل أقل ودقة رسم منخفضة، دون ظلال؛ لأجهزة أضعف.',
  medium: 'ألوان طبيعية وتفاصيل متوازنة مع أداء أخف، دون ظلال.',
  high: 'ظلال فعلية، وأشجار وزهور أكثر، وتفاصيل أوضح.',
  ultra: 'ظلال عالية الدقة، ألوان أغنى، أشجار متحركة ويراعات صغيرة ومؤثرات إضافية.',
};

const ui = {
  canvas: document.getElementById('world'),
  settingsToggle: document.getElementById('settingsToggle'),
  tasksToggle: document.getElementById('tasksToggle'),
  buildToggle: document.getElementById('buildToggle'),
  settingsBackdrop: document.getElementById('settingsBackdrop'),
  tasksBackdrop: document.getElementById('tasksBackdrop'),
  buildBackdrop: document.getElementById('buildBackdrop'),
  qualityOptions: document.getElementById('qualityOptions'),
  qualityNote: document.getElementById('qualityNote'),
  taskList: document.getElementById('taskList'),
  seedBalance: document.getElementById('seedBalance'),
  rotateBuild: document.getElementById('rotateBuild'),
  deleteBuild: document.getElementById('deleteBuild'),
  cancelBuild: document.getElementById('cancelBuild'),
  buildPrompt: document.getElementById('buildPrompt'),
  toast: document.getElementById('toast'),
  hint: document.getElementById('hint'),
  joystick: document.getElementById('joystick'),
  joystickKnob: document.getElementById('joystickKnob'),
};

function localDayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function freshDaily() {
  return { day: localDayKey(), tasks: {} };
}

function loadSavedState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing or restricted storage: continue with a fresh local session.
  }
  return parseGardenSave(raw, localDayKey(), 3);
}


const saved = loadSavedState();
const appState = {
  requestedQuality: saved.quality,
  activeQuality: 'medium',
  seeds: saved.seeds,
  daily: saved.daily,
  decorations: saved.decorations,
  buildMode: false,
  buildType: null,
  buildRotation: 0,
  selectedDecoration: null,
};

let toastTimeout = 0;
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => ui.toast.classList.remove('show'), 2400);
}

function saveState(showFailure = false) {
  try {
    const data = serializeGardenSave({
      quality: appState.requestedQuality,
      seeds: appState.seeds,
      daily: appState.daily,
      decorations: placedDecorations.map((entry) => ({
        type: entry.type,
        x: entry.group.position.x,
        z: entry.group.position.z,
        rotation: entry.group.rotation.y,
      })),
    });
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    if (showFailure) showToast('تعذّر حفظ التقدم على هذا الجهاز.');
  }
}

// ----- WebGL renderer and scene -----
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: ui.canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });
} catch {
  const message = document.createElement('div');
  message.dir = 'rtl';
  message.textContent = 'هذا الجهاز أو المتصفح لا يدعم تشغيل الرسومات ثلاثية الأبعاد (WebGL). جرّب تحديث المتصفح أو تفعيل تسريع الرسومات.';
  Object.assign(message.style, {
    position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', padding: '28px',
    color: '#264438', background: '#e6efd9', textAlign: 'center', font: 'bold 18px Tahoma, Arial', lineHeight: '2',
  });
  document.body.append(message);
  throw new Error('WebGL is not available');
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xb9d8b2, 1);

ui.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showToast('توقفت الرسومات مؤقتًا. حدّث الصفحة لإعادة تشغيل الحديقة.');
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9d8b2);
scene.fog = new THREE.FogExp2(0xb9d8b2, 0.00215);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 900);
let cameraYaw = 0;
let cameraPitch = 0.52;
let cameraDistance = 12.4;
const cameraTarget = new THREE.Vector3();

const hemisphere = new THREE.HemisphereLight(0xe4f3ff, 0x557747, 1.4);
scene.add(hemisphere);
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const sunlight = new THREE.DirectionalLight(0xfff0d4, 2.15);
sunlight.position.set(-75, 105, 65);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 330;
sunlight.shadow.camera.left = -145;
sunlight.shadow.camera.right = 145;
sunlight.shadow.camera.top = 145;
sunlight.shadow.camera.bottom = -145;
sunlight.shadow.bias = -0.00025;
sunlight.shadow.normalBias = 0.03;
scene.add(sunlight);

const worldGroup = new THREE.Group();
scene.add(worldGroup);
const environmentGroup = new THREE.Group();
worldGroup.add(environmentGroup);
const decorationsGroup = new THREE.Group();
scene.add(decorationsGroup);

function terrainHeight(x, z) {
  return Math.sin(x * 0.014) * 1.25
    + Math.cos(z * 0.017) * 1.0
    + Math.sin((x + z) * 0.009) * 1.25
    + Math.cos((x - z) * 0.006) * 0.8;
}

let terrainMesh;
function createTerrain() {
  const size = WORLD_HALF * 2;
  const geometry = new THREE.PlaneGeometry(size, size, 170, 170);
  const positions = geometry.attributes.position;
  const colors = [];
  const colorA = new THREE.Color(0x6c9b58);
  const colorB = new THREE.Color(0x82aa64);
  const colorC = new THREE.Color(0x5e8b50);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const height = terrainHeight(x, z);
    positions.setZ(i, height);
    const variation = (Math.sin(x * 0.07) + Math.cos(z * 0.06) + Math.sin((x + z) * 0.035)) / 6;
    const tint = colorA.clone().lerp(colorB, clampNumber(0.45 + variation, 0, 1, 0.45)).lerp(colorC, 0.13);
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.userData.isTerrain = true;
  environmentGroup.add(terrainMesh);
}

// ----- River and walking paths -----
const riverPoints = [
  new THREE.Vector3(-270, 0, -145),
  new THREE.Vector3(-215, 0, -72),
  new THREE.Vector3(-145, 0, -35),
  new THREE.Vector3(-75, 0, 5),
  new THREE.Vector3(-5, 0, 58),
  new THREE.Vector3(78, 0, 100),
  new THREE.Vector3(155, 0, 82),
  new THREE.Vector3(225, 0, 132),
  new THREE.Vector3(270, 0, 190),
];
const riverCurve = new THREE.CatmullRomCurve3(riverPoints, false, 'catmullrom', 0.45);
const riverSamples = riverCurve.getPoints(180);
const bridgeCrossings = [];

function riverDistance(x, z) {
  let nearest = Infinity;
  for (let i = 0; i < riverSamples.length; i += 2) {
    const dx = x - riverSamples[i].x;
    const dz = z - riverSamples[i].z;
    nearest = Math.min(nearest, Math.hypot(dx, dz));
  }
  return nearest;
}

function makeRiverRibbon(width, lift, material) {
  const segments = 230;
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = riverCurve.getPointAt(t);
    const tangent = riverCurve.getTangentAt(t).normalize();
    const nx = -tangent.z;
    const nz = tangent.x;
    const h = terrainHeight(point.x, point.z) + lift;
    vertices.push(point.x + nx * width * 0.5, h, point.z + nz * width * 0.5);
    vertices.push(point.x - nx * width * 0.5, h, point.z - nz * width * 0.5);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  environmentGroup.add(mesh);
  return mesh;
}

const waterMaterial = new THREE.MeshStandardMaterial({
  color: 0x5eb8ae,
  roughness: 0.17,
  metalness: 0.08,
  transparent: true,
  opacity: 0.94,
  side: THREE.DoubleSide,
});
const waterEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b47e, roughness: 1, side: THREE.DoubleSide });
const waterMesh = { surface: null, edge: null };
function createRiver() {
  waterMesh.edge = makeRiverRibbon(19, 0.19, waterEdgeMaterial);
  waterMesh.surface = makeRiverRibbon(12.5, 0.43, waterMaterial);

  for (const offset of [-2.5, 2.6]) {
    const points = riverCurve.getPoints(140).map((point, index) => {
      const t = index / 140;
      const tangent = riverCurve.getTangentAt(t);
      return new THREE.Vector3(
        point.x - tangent.z * offset,
        terrainHeight(point.x, point.z) + 0.5,
        point.z + tangent.x * offset,
      );
    });
    const lineCurve = new THREE.CatmullRomCurve3(points);
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(lineCurve, 160, 0.055, 5, false),
      new THREE.MeshBasicMaterial({ color: 0xc2f4dc, transparent: true, opacity: 0.24 }),
    );
    environmentGroup.add(line);
    waterRippleMaterials.push(line.material);
  }
  createBridge(0.34);
  createBridge(0.72);
}
const waterRippleMaterials = [];

function createBridge(t) {
  const point = riverCurve.getPointAt(t);
  const tangent = riverCurve.getTangentAt(t).normalize();
  const angle = Math.atan2(tangent.x, tangent.z);
  bridgeCrossings.push({ x: point.x, z: point.z, angle });
  const group = new THREE.Group();
  group.position.set(point.x, terrainHeight(point.x, point.z) + 0.72, point.z);
  group.rotation.y = angle;
  const wood = new THREE.MeshStandardMaterial({ color: 0x9b764b, roughness: 0.92 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x674c35, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 4.3), wood);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(18, 0.22, 0.22), darkWood);
    rail.position.set(0, 0.65, side * 1.8);
    group.add(rail);
    for (let x = -8; x <= 8; x += 4) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), darkWood);
      post.position.set(x, 0.35, side * 1.8);
      group.add(post);
    }
  }
  group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  environmentGroup.add(group);
}

function createGardenPath() {
  const points = [
    new THREE.Vector3(-22, 0, 12),
    new THREE.Vector3(-16, 0, 4),
    new THREE.Vector3(-9, 0, -7),
    new THREE.Vector3(3, 0, -17),
    new THREE.Vector3(20, 0, -27),
    new THREE.Vector3(35, 0, -34),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getPoints(70);
  const vertices = [];
  const indices = [];
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    const tangent = curve.getTangent(i / (samples.length - 1));
    const nx = -tangent.z;
    const nz = tangent.x;
    const h = terrainHeight(point.x, point.z) + 0.22;
    vertices.push(point.x + nx * 3, h, point.z + nz * 3, point.x - nx * 3, h, point.z - nz * 3);
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd0bb8b, roughness: 1, side: THREE.DoubleSide }));
  path.receiveShadow = true;
  environmentGroup.add(path);
}

// ----- Trees, flowers, shrubs, stones and distant hills -----
const treeCanopies = [];
const flowerMeshRefs = [];
let fireflyPoints = null;
let fireflyPositions = null;

function createTree(x, z, scale = 1, phase = Math.random() * Math.PI * 2) {
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  group.scale.setScalar(scale);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 3.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x79563a, roughness: 1 }),
  );
  trunk.position.y = 1.55;
  trunk.castShadow = true;
  group.add(trunk);

  const canopy = new THREE.Group();
  canopy.position.y = 3.45;
  const greens = [0x5d8d4b, 0x6d9c56, 0x4f8147, 0x7ca65d];
  const green = greens[Math.floor(Math.random() * greens.length)];
  const leafMaterial = new THREE.MeshStandardMaterial({ color: green, roughness: 0.95 });
  const main = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 1), leafMaterial);
  main.castShadow = true;
  canopy.add(main);
  for (const [ox, oy, oz, size] of [[-1.1, -0.3, 0.2, 1.15], [1.0, -0.45, -0.3, 1.2], [0.1, 0.75, 0.25, 1.05]]) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), leafMaterial);
    leaf.position.set(ox, oy, oz);
    leaf.castShadow = true;
    canopy.add(leaf);
  }
  canopy.userData.windPhase = phase;
  group.add(canopy);
  treeCanopies.push(canopy);
  group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  environmentGroup.add(group);
}

function createInstancedFlowers(maxCount) {
  const flowerGeometry = new THREE.SphereGeometry(0.14, 7, 6);
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true });
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 820);
  flowers.count = maxCount;
  flowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  const palette = [0xffe6a7, 0xfff4d5, 0xf4c6c8, 0xd9c6ef, 0xe4e9ad, 0xffffff];
  for (let i = 0; i < maxCount; i++) {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      x = (Math.random() - 0.5) * 480;
      z = (Math.random() - 0.5) * 480;
      if (riverDistance(x, z) > 13 && Math.hypot(x, z) > 13) break;
    }
    dummy.position.set(x, terrainHeight(x, z) + 0.3, z);
    const scale = 0.65 + Math.random() * 0.85;
    dummy.scale.setScalar(scale);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(palette[Math.floor(Math.random() * palette.length)]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.receiveShadow = true;
  environmentGroup.add(flowers);
  flowerMeshRefs.push(flowers);
}

function createShrubInstances() {
  const count = 155;
  const geometry = new THREE.IcosahedronGeometry(0.8, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x669453, roughness: 1 });
  const shrubs = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x = (Math.random() - 0.5) * 470;
    let z = (Math.random() - 0.5) * 470;
    if (riverDistance(x, z) < 15 || Math.hypot(x, z) < 17) { x += 35; z -= 28; }
    dummy.position.set(x, terrainHeight(x, z) + 0.45, z);
    dummy.scale.set(0.65 + Math.random() * 0.7, 0.55 + Math.random() * 0.5, 0.65 + Math.random() * 0.7);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
  }
  shrubs.instanceMatrix.needsUpdate = true;
  shrubs.castShadow = true;
  environmentGroup.add(shrubs);
}

function createRockInstances() {
  const count = 110;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.65, 0),
    new THREE.MeshStandardMaterial({ color: 0x8c9783, roughness: 1 }),
    count,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x = (Math.random() - 0.5) * 485;
    let z = (Math.random() - 0.5) * 485;
    if (riverDistance(x, z) < 11) x += 28;
    dummy.position.set(x, terrainHeight(x, z) + 0.25, z);
    dummy.scale.set(0.6 + Math.random(), 0.35 + Math.random() * 0.4, 0.65 + Math.random());
    dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.3);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  environmentGroup.add(rocks);
}

function createHills() {
  const material = new THREE.MeshStandardMaterial({ color: 0x7fa66e, roughness: 1 });
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2;
    const radius = 255 + Math.random() * 50;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
    const scale = 28 + Math.random() * 35;
    hill.position.set(x, -12 + scale * 0.12, z);
    hill.scale.set(scale * 1.5, scale * 0.62, scale);
    environmentGroup.add(hill);
  }
}

function createSunAndClouds() {
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(9, 22, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe8aa }),
  );
  sun.position.set(-160, 118, -215);
  environmentGroup.add(sun);

  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xf1f5e8, roughness: 1, transparent: true, opacity: 0.72 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const x = (Math.random() - 0.5) * 460;
    const z = (Math.random() - 0.5) * 440;
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(5 + Math.random() * 3, 10, 8), cloudMaterial);
      puff.position.set(j * 5 - 7, Math.random() * 2, Math.random() * 3);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(x, 65 + Math.random() * 28, z);
    environmentGroup.add(cloud);
  }
}

function createFireflies() {
  const count = 95;
  fireflyPositions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    fireflyPositions[i * 3] = (Math.random() - 0.5) * 170;
    fireflyPositions[i * 3 + 1] = 1.5 + Math.random() * 7;
    fireflyPositions[i * 3 + 2] = (Math.random() - 0.5) * 170;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  const material = new THREE.PointsMaterial({ color: 0xfff4ad, size: 0.55, transparent: true, opacity: 0.82, sizeAttenuation: true });
  fireflyPoints = new THREE.Points(geometry, material);
  fireflyPoints.visible = false;
  environmentGroup.add(fireflyPoints);
}

function generateGarden() {
  createTerrain();
  createRiver();
  createGardenPath();
  createHills();
  createSunAndClouds();
  createInstancedFlowers(820);
  createShrubInstances();
  createRockInstances();
  const treePositions = [];
  let attempts = 0;
  while (treePositions.length < 160 && attempts < 2400) {
    attempts += 1;
    const x = (Math.random() - 0.5) * 474;
    const z = (Math.random() - 0.5) * 474;
    if (riverDistance(x, z) < 18 || Math.hypot(x, z) < 18) continue;
    if (treePositions.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 10)) continue;
    treePositions.push([x, z]);
  }
  treePositions.forEach(([x, z], index) => createTree(x, z, 0.82 + Math.random() * 0.45, index * 0.81));
  createFireflies();
}

// ----- Avatar and movement -----
const keys = Object.create(null);
const joystickState = { x: 0, y: 0, pointerId: null };
const avatar = new THREE.Group();
const avatarBody = new THREE.Group();
avatar.add(avatarBody);
const robeMaterial = new THREE.MeshStandardMaterial({ color: 0x65845a, roughness: 0.88 });
const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xc99470, roughness: 0.9 });
const clothMaterial = new THREE.MeshStandardMaterial({ color: 0xe8ddbd, roughness: 0.95 });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.9 });

const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.59, 1.27, 12), robeMaterial);
robe.position.y = 0.78;
robe.castShadow = true;
avatarBody.add(robe);
const upperBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.45, 4, 8), robeMaterial);
upperBody.position.y = 1.26;
upperBody.castShadow = true;
avatarBody.add(upperBody);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 14), skinMaterial);
head.position.set(0, 1.74, -0.015);
head.castShadow = true;
avatarBody.add(head);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.258, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), darkMaterial);
hair.position.set(0, 1.8, 0.015);
avatarBody.add(hair);
const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.065, 7, 16), clothMaterial);
scarf.position.y = 1.48;
scarf.rotation.x = Math.PI / 2;
avatarBody.add(scarf);
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x45372d });
for (const x of [-0.085, 0.085]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 7), eyeMaterial);
  eye.position.set(x, 1.76, -0.238);
  avatarBody.add(eye);
}
const armGeometry = new THREE.CapsuleGeometry(0.11, 0.48, 3, 7);
const leftArm = new THREE.Mesh(armGeometry, robeMaterial);
leftArm.position.set(-0.45, 1.08, -0.02);
leftArm.rotation.z = -0.22;
leftArm.castShadow = true;
avatarBody.add(leftArm);
const rightArm = new THREE.Mesh(armGeometry, robeMaterial);
rightArm.position.set(0.45, 1.08, -0.02);
rightArm.rotation.z = 0.22;
rightArm.castShadow = true;
avatarBody.add(rightArm);
const belt = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 18), clothMaterial);
belt.position.y = 0.56;
belt.rotation.x = Math.PI / 2;
avatarBody.add(belt);
avatarBody.traverse((object) => { if (object.isMesh) object.castShadow = true; });
scene.add(avatar);

const player = {
  x: 0,
  z: 0,
  velocityX: 0,
  velocityZ: 0,
  rotation: 0,
  walkTime: 0,
  update(dt, time) {
    let right = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joystickState.x;
    let forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joystickState.y;
    const length = Math.hypot(right, forward);
    if (length > 1) { right /= length; forward /= length; }
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);
    const directionX = rightX * right + forwardX * forward;
    const directionZ = rightZ * right + forwardZ * forward;
    const moving = Math.hypot(directionX, directionZ) > 0.04;
    const targetSpeed = 8.5;
    const targetX = moving ? directionX * targetSpeed : 0;
    const targetZ = moving ? directionZ * targetSpeed : 0;
    const smoothing = 1 - Math.exp(-(moving ? 12 : 8) * dt);
    this.velocityX += (targetX - this.velocityX) * smoothing;
    this.velocityZ += (targetZ - this.velocityZ) * smoothing;
    const nextX = clampNumber(this.x + this.velocityX * dt, -WORLD_HALF + 9, WORLD_HALF - 9, this.x);
    const nextZ = clampNumber(this.z + this.velocityZ * dt, -WORLD_HALF + 9, WORLD_HALF - 9, this.z);
    if (isWalkablePosition(nextX, nextZ, { worldHalf: WORLD_HALF, riverDistance, bridges: bridgeCrossings })) {
      this.x = nextX;
      this.z = nextZ;
    } else {
      // Slide along the riverbank instead of allowing the character to walk through water.
      if (isWalkablePosition(nextX, this.z, { worldHalf: WORLD_HALF, riverDistance, bridges: bridgeCrossings })) this.x = nextX;
      else this.velocityX *= 0.12;
      if (isWalkablePosition(this.x, nextZ, { worldHalf: WORLD_HALF, riverDistance, bridges: bridgeCrossings })) this.z = nextZ;
      else this.velocityZ *= 0.12;
    }

    if (moving) {
      const targetRotation = Math.atan2(-directionX, -directionZ);
      let delta = targetRotation - this.rotation;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.rotation += delta * (1 - Math.exp(-13 * dt));
    }
    this.walkTime += dt * (moving ? 9 : 2.4);
    avatar.position.set(this.x, terrainHeight(this.x, this.z), this.z);
    avatar.rotation.y = this.rotation;
    const bob = moving ? Math.abs(Math.sin(this.walkTime)) * 0.055 : Math.sin(time * 1.2) * 0.012;
    avatarBody.position.y = bob;
    leftArm.rotation.x = moving ? Math.sin(this.walkTime) * 0.42 : 0;
    rightArm.rotation.x = moving ? -Math.sin(this.walkTime) * 0.42 : 0;
  },
};

// ----- Buildable objects -----
let placedDecorations = [];
let previewGroup = null;
let selectedRing = null;
let nextDecorationId = 1;
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function mat(color, ghost = false, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: ghost,
    opacity: ghost ? 0.48 : 1,
    depthWrite: !ghost,
  });
}

function addMesh(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = !material.transparent;
  mesh.receiveShadow = !material.transparent;
  group.add(mesh);
  return mesh;
}

function makeDecoration(type, ghost = false) {
  const group = new THREE.Group();
  const green = mat(0x668d4d, ghost);
  const darkGreen = mat(0x4e7743, ghost);
  const wood = mat(0x946b45, ghost);
  const paleWood = mat(0xb38a5a, ghost);
  const stone = mat(0x929a82, ghost);
  const gold = mat(0xc89a52, ghost, 0.48, 0.2);
  const water = mat(0x77c9c2, ghost, 0.17, 0.1);

  if (type === 'flower') {
    addMesh(group, new THREE.CylinderGeometry(0.035, 0.045, 0.72, 6), green, [0, 0.36, 0]);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      addMesh(group, new THREE.SphereGeometry(0.19, 9, 7), mat(0xf4d58d, ghost), [Math.cos(angle) * 0.22, 0.78, Math.sin(angle) * 0.22]);
    }
    addMesh(group, new THREE.SphereGeometry(0.13, 8, 8), gold, [0, 0.79, 0]);
  } else if (type === 'bush') {
    addMesh(group, new THREE.IcosahedronGeometry(0.76, 1), green, [0, 0.65, 0]);
    addMesh(group, new THREE.IcosahedronGeometry(0.58, 1), darkGreen, [-0.48, 0.45, 0.05]);
    addMesh(group, new THREE.IcosahedronGeometry(0.56, 1), green, [0.44, 0.46, -0.05]);
  } else if (type === 'tree') {
    addMesh(group, new THREE.CylinderGeometry(0.23, 0.34, 2.8, 8), wood, [0, 1.35, 0]);
    addMesh(group, new THREE.IcosahedronGeometry(1.55, 1), green, [0, 3.05, 0]);
    addMesh(group, new THREE.IcosahedronGeometry(0.95, 1), darkGreen, [-0.83, 2.65, 0.12]);
    addMesh(group, new THREE.IcosahedronGeometry(1.0, 1), green, [0.8, 2.68, -0.12]);
  } else if (type === 'bench') {
    addMesh(group, new THREE.BoxGeometry(2.4, 0.18, 0.75), wood, [0, 0.72, 0]);
    addMesh(group, new THREE.BoxGeometry(2.4, 0.95, 0.16), paleWood, [0, 1.18, 0.3], [-0.12, 0, 0]);
    for (const x of [-0.9, 0.9]) {
      addMesh(group, new THREE.BoxGeometry(0.16, 0.8, 0.65), wood, [x, 0.39, 0]);
      addMesh(group, new THREE.BoxGeometry(0.15, 0.14, 0.65), darkGreen, [x, 0.12, 0]);
    }
  } else if (type === 'lantern') {
    addMesh(group, new THREE.CylinderGeometry(0.1, 0.14, 1.9, 9), wood, [0, 0.95, 0]);
    addMesh(group, new THREE.BoxGeometry(0.72, 0.75, 0.72), gold, [0, 2.13, 0]);
    addMesh(group, new THREE.ConeGeometry(0.55, 0.42, 8), wood, [0, 2.72, 0]);
    addMesh(group, new THREE.SphereGeometry(0.22, 10, 8), mat(0xffe5a0, ghost, 0.25), [0, 2.12, 0]);
    if (!ghost) {
      const light = new THREE.PointLight(0xffd58a, 1.15, 10);
      light.position.set(0, 2.1, 0);
      group.add(light);
    }
  } else if (type === 'fountain') {
    addMesh(group, new THREE.CylinderGeometry(1.42, 1.55, 0.5, 24), stone, [0, 0.28, 0]);
    addMesh(group, new THREE.CylinderGeometry(1.2, 1.2, 0.11, 24), water, [0, 0.56, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.25, 0.34, 1.25, 12), paleWood, [0, 1.15, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.75, 0.82, 0.2, 18), stone, [0, 1.83, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8), water, [0, 2.18, 0]);
  } else if (type === 'arch') {
    for (const x of [-1.45, 1.45]) {
      addMesh(group, new THREE.CylinderGeometry(0.18, 0.22, 3.5, 9), wood, [x, 1.72, 0]);
      addMesh(group, new THREE.IcosahedronGeometry(0.5, 0), green, [x, 3.15, 0]);
    }
    addMesh(group, new THREE.BoxGeometry(3.2, 0.32, 0.38), wood, [0, 3.45, 0]);
    const vine = addMesh(group, new THREE.TorusGeometry(1.35, 0.12, 8, 20, Math.PI), green, [0, 3.2, 0]);
    vine.rotation.z = Math.PI;
  } else if (type === 'rock') {
    const rock = addMesh(group, new THREE.DodecahedronGeometry(0.85, 0), stone, [0, 0.45, 0]);
    rock.scale.set(1.2, 0.65, 0.92);
  }
  group.traverse((object) => {
    if (object.isMesh) {
      object.userData.isPlaceableMesh = true;
      if (ghost) object.material.depthWrite = false;
    }
  });
  return group;
}

function assignDecorationId(group, id) {
  group.traverse((object) => { object.userData.placeableId = id; });
}

function addDecoration(type, x, z, rotation = 0, persist = true) {
  if (!Object.hasOwn(BUILD_ITEMS, type)) return null;
  const group = makeDecoration(type, false);
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = rotation;
  const id = nextDecorationId++;
  assignDecorationId(group, id);
  decorationsGroup.add(group);
  const entry = { id, type, group };
  placedDecorations.push(entry);
  if (persist) saveState(true);
  return entry;
}

function createBuildPreview(type) {
  if (previewGroup) decorationsGroup.remove(previewGroup);
  previewGroup = type ? makeDecoration(type, true) : null;
  if (previewGroup) {
    previewGroup.visible = false;
    decorationsGroup.add(previewGroup);
  }
}

function setSelectedDecoration(entry) {
  appState.selectedDecoration = entry;
  ui.deleteBuild.disabled = !entry;
  if (selectedRing) {
    selectedRing.visible = Boolean(entry);
    if (entry) {
      selectedRing.position.set(entry.group.position.x, entry.group.position.y + 0.12, entry.group.position.z);
    }
  }
  if (entry) showToast(`تم تحديد ${BUILD_ITEMS[entry.type].name}`);
}

function makeSelectionRing() {
  const geometry = new THREE.RingGeometry(1.15, 1.27, 40);
  geometry.rotateX(-Math.PI / 2);
  selectedRing = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xffe3a2, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }),
  );
  selectedRing.visible = false;
  scene.add(selectedRing);
}

function updateBuildPrompt() {
  if (appState.buildMode && appState.buildType) {
    ui.buildPrompt.textContent = `اضغط على الأرض لوضع ${BUILD_ITEMS[appState.buildType].name} · Esc للإلغاء`;
    ui.buildPrompt.classList.add('show');
  } else if (appState.buildMode) {
    ui.buildPrompt.textContent = 'اضغط على عنصر بنيته لتحديده، أو اختر عنصرًا من قائمة البناء';
    ui.buildPrompt.classList.add('show');
  } else {
    ui.buildPrompt.classList.remove('show');
  }
  ui.buildToggle.classList.toggle('active', appState.buildMode);
}

function openPanel(panel) {
  closeAllPanels();
  panel.classList.add('open');
}
function closeAllPanels() {
  for (const panel of [ui.settingsBackdrop, ui.tasksBackdrop, ui.buildBackdrop]) panel.classList.remove('open');
}
function panelOpen() {
  return [ui.settingsBackdrop, ui.tasksBackdrop, ui.buildBackdrop].some((panel) => panel.classList.contains('open'));
}

function openBuildMenu() {
  appState.buildMode = true;
  appState.buildType = null;
  appState.buildRotation = 0;
  createBuildPreview(null);
  setSelectedDecoration(null);
  renderBuildMenu();
  updateBuildPrompt();
  openPanel(ui.buildBackdrop);
}

function cancelBuildMode() {
  appState.buildMode = false;
  appState.buildType = null;
  appState.buildRotation = 0;
  createBuildPreview(null);
  setSelectedDecoration(null);
  updateBuildPrompt();
  ui.hint.classList.remove('hidden');
  closeAllPanels();
}

function chooseBuildItem(type) {
  if (!Object.hasOwn(BUILD_ITEMS, type)) return;
  const cost = BUILD_ITEMS[type].cost;
  if (appState.seeds < cost) {
    showToast(`تحتاج ${cost - appState.seeds} بذور إضافية لهذا العنصر.`);
    return;
  }
  appState.buildMode = true;
  appState.buildType = type;
  appState.buildRotation = 0;
  setSelectedDecoration(null);
  createBuildPreview(type);
  closeAllPanels();
  updateBuildPrompt();
  showToast('اضغط في المكان الذي تريد البناء فيه.');
}

function placeBuildAt(point) {
  if (!appState.buildType) return;
  const { type } = appState;
  if (Math.abs(point.x) > WORLD_HALF - 8 || Math.abs(point.z) > WORLD_HALF - 8) {
    showToast('اختر مكانًا داخل حدود الحديقة.');
    return;
  }
  if (riverDistance(point.x, point.z) < 10) {
    showToast('اترك مساحة النهر والمجرى المائي خالية.');
    return;
  }
  if (placedDecorations.length >= 900) {
    showToast('وصلت إلى الحد الأقصى لعناصر البناء المحفوظة.');
    return;
  }
  const cost = BUILD_ITEMS[type].cost;
  if (appState.seeds < cost) {
    showToast('انتهت بذور البناء لديك. أكمل مهمة ذكر لتحصل على المزيد.');
    return;
  }
  const x = clampNumber(point.x, -WORLD_HALF + 8, WORLD_HALF - 8, 0);
  const z = clampNumber(point.z, -WORLD_HALF + 8, WORLD_HALF - 8, 0);
  appState.seeds -= cost;
  addDecoration(type, x, z, appState.buildRotation, false);
  saveState(true);
  renderBuildMenu();
  showToast(`تم وضع ${BUILD_ITEMS[type].name}.`);
}

function removeSelectedDecoration() {
  const selected = appState.selectedDecoration;
  if (!selected) return;
  decorationsGroup.remove(selected.group);
  placedDecorations = placedDecorations.filter((entry) => entry.id !== selected.id);
  setSelectedDecoration(null);
  saveState(true);
  renderBuildMenu();
  showToast('تم حذف العنصر.');
}

function rotateCurrentBuild() {
  if (appState.buildType && previewGroup) {
    appState.buildRotation += Math.PI / 4;
    previewGroup.rotation.y = appState.buildRotation;
    showToast('تم تدوير العنصر.');
    return;
  }
  if (appState.selectedDecoration) {
    appState.selectedDecoration.group.rotation.y += Math.PI / 4;
    saveState(true);
    showToast('تم تدوير العنصر المحدد.');
  }
}

function renderBuildMenu() {
  ui.seedBalance.textContent = String(appState.seeds);
  for (const button of document.querySelectorAll('[data-build]')) {
    button.classList.toggle('selected', button.dataset.build === appState.buildType);
  }
  ui.deleteBuild.disabled = !appState.selectedDecoration;
}

// ----- Daily dhikr tasks -----
function ensureDailyTasks() {
  if (!appState.daily || appState.daily.day !== localDayKey()) appState.daily = freshDaily();
  for (const task of TASKS) {
    if (!appState.daily.tasks[task.id]) appState.daily.tasks[task.id] = { count: 0, completed: false };
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderTasks() {
  ensureDailyTasks();
  ui.taskList.replaceChildren();
  for (const task of TASKS) {
    const progress = appState.daily.tasks[task.id];
    const card = makeElement('article', 'task-card');
    const top = makeElement('div', 'task-top');
    const description = document.createElement('div');
    description.append(makeElement('h3', 'task-name', task.title));
    description.append(makeElement('div', 'task-meta', task.detail));
    description.append(makeElement('div', 'task-meta', task.reference));
    top.append(description, makeElement('span', 'task-reward', `+${task.reward} بذور`));
    const bar = makeElement('div', 'task-progress');
    const fill = document.createElement('span');
    fill.style.width = `${Math.min(100, (progress.count / task.target) * 100)}%`;
    bar.append(fill);
    const footer = makeElement('div', 'task-footer');
    footer.append(makeElement('span', 'task-count', `${progress.count} / ${task.target}`));
    const button = makeElement('button', 'task-button', progress.completed ? 'اكتملت ✓' : 'سجّلت تكرارًا +1');
    button.type = 'button';
    button.disabled = progress.completed;
    button.setAttribute('aria-label', progress.completed ? 'اكتملت المهمة' : `تسجيل تكرار من ${task.title}`);
    button.addEventListener('click', () => incrementTask(task.id));
    footer.append(button);
    card.append(top, bar, footer);
    ui.taskList.append(card);
  }
}

function incrementTask(taskId) {
  const task = TASKS.find((entry) => entry.id === taskId);
  if (!task) return;
  ensureDailyTasks();
  const progress = appState.daily.tasks[taskId];
  if (progress.completed) return;
  progress.count = Math.min(task.target, progress.count + 1);
  if (progress.count >= task.target) {
    progress.completed = true;
    appState.seeds = Math.min(999999, appState.seeds + task.reward);
    showToast(`أكملت المهمة! أُضيفت ${task.reward} بذور للبناء.`);
  }
  saveState(true);
  renderTasks();
  renderBuildMenu();
}

// ----- Quality presets and automatic adaptation -----
function guessDeviceQuality() {
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 0;
  const isMobile = matchMedia('(pointer: coarse)').matches;
  if (!isMobile && cores >= 8 && memory >= 8) return 'ultra';
  if (cores >= 6 && memory >= 4) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

function qualityRank(name) {
  return ['low', 'medium', 'high', 'ultra'].indexOf(name);
}

function applyQuality(qualityName) {
  const preset = QUALITY[qualityName] || QUALITY.medium;
  appState.activeQuality = qualityName;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, preset.dpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = preset.shadows;
  sunlight.castShadow = preset.shadows;
  sunlight.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
  sunlight.shadow.camera.updateProjectionMatrix();
  ambient.intensity = qualityName === 'low' ? 0.78 : qualityName === 'medium' ? 0.65 : 0.55;
  hemisphere.intensity = qualityName === 'low' ? 1.1 : 1.4;
  renderer.toneMappingExposure = qualityName === 'ultra' ? 1.13 : qualityName === 'low' ? 0.98 : 1.05;
  const sky = qualityName === 'ultra' ? 0xaed7c0 : qualityName === 'high' ? 0xb8d8b1 : qualityName === 'medium' ? 0xbdd5ae : 0xc5d7b7;
  scene.background.setHex(sky);
  scene.fog.color.setHex(sky);
  scene.fog.density = qualityName === 'low' ? 0.0027 : 0.00215;
  for (let i = 0; i < treeCanopies.length; i++) {
    const visible = i < preset.trees;
    treeCanopies[i].parent.visible = visible;
  }
  for (const flowers of flowerMeshRefs) flowers.count = preset.flowers;
  if (fireflyPoints) fireflyPoints.visible = preset.fireflies;
  updateQualityButtons();
}

function updateQualityButtons() {
  for (const button of ui.qualityOptions.querySelectorAll('[data-quality]')) {
    button.classList.toggle('selected', button.dataset.quality === appState.requestedQuality);
    button.setAttribute('aria-pressed', button.dataset.quality === appState.requestedQuality ? 'true' : 'false');
  }
  const label = QUALITY[appState.activeQuality]?.label || 'متوسطة';
  const details = QUALITY_DETAILS[appState.activeQuality] || QUALITY_DETAILS.medium;
  ui.qualityNote.textContent = appState.requestedQuality === 'auto'
    ? `التلقائي يعمل حاليًا على الجودة ${label}. ${details} يخفّضها أو يرفعها حسب سلاسة الأداء.`
    : `الجودة المختارة: ${label}. ${details} يمكنك الرجوع إلى «تلقائي» ليتكيف العرض مع جهازك.`;
}

function setRequestedQuality(name) {
  if (!VALID_QUALITIES.includes(name)) return;
  appState.requestedQuality = name;
  autoCeiling = name === 'auto' ? guessDeviceQuality() : name;
  applyQuality(name === 'auto' ? autoCeiling : name);
  saveState(true);
}

let autoCeiling = saved.quality === 'auto' ? guessDeviceQuality() : saved.quality;
let qualitySampleTime = 0;
let qualityFrames = 0;
let poorSamples = 0;
let goodSamples = 0;
function monitorAutomaticQuality(dt) {
  if (appState.requestedQuality !== 'auto') return;
  qualitySampleTime += dt;
  qualityFrames += 1;
  if (qualitySampleTime < 3) return;
  const fps = qualityFrames / qualitySampleTime;
  qualitySampleTime = 0;
  qualityFrames = 0;
  let rank = qualityRank(appState.activeQuality);
  if (fps < 34 && rank > 0) {
    poorSamples += 1;
    goodSamples = 0;
    if (poorSamples >= 1) {
      rank -= 1;
      poorSamples = 0;
      applyQuality(['low', 'medium', 'high', 'ultra'][rank]);
    }
  } else if (fps > 56 && rank < qualityRank(autoCeiling)) {
    goodSamples += 1;
    poorSamples = 0;
    if (goodSamples >= 3) {
      rank += 1;
      goodSamples = 0;
      applyQuality(['low', 'medium', 'high', 'ultra'][rank]);
    }
  } else {
    poorSamples = 0;
    goodSamples = 0;
  }
}

// ----- Raycasting, camera and pointer input -----
function updatePointerFromEvent(event) {
  const rect = ui.canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function groundHit() {
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(terrainMesh, false);
  return hits.length ? hits[0].point : null;
}

function updatePreviewAtPointer() {
  if (!previewGroup || !appState.buildMode || !appState.buildType) return;
  const point = groundHit();
  if (!point) { previewGroup.visible = false; return; }
  previewGroup.position.set(point.x, terrainHeight(point.x, point.z), point.z);
  previewGroup.rotation.y = appState.buildRotation;
  previewGroup.visible = riverDistance(point.x, point.z) >= 10;
}

function selectDecorationAtPointer() {
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(placedDecorations.map((entry) => entry.group), true);
  if (!hits.length) {
    setSelectedDecoration(null);
    return;
  }
  const id = hits[0].object.userData.placeableId;
  const entry = placedDecorations.find((item) => item.id === id);
  setSelectedDecoration(entry || null);
}

let pointerDrag = null;
ui.canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || panelOpen()) return;
  updatePointerFromEvent(event);
  pointerDrag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
  };
  ui.canvas.setPointerCapture?.(event.pointerId);
});

ui.canvas.addEventListener('pointermove', (event) => {
  updatePointerFromEvent(event);
  if (!pointerDrag || pointerDrag.id !== event.pointerId) {
    updatePreviewAtPointer();
    return;
  }
  const dx = event.clientX - pointerDrag.lastX;
  const dy = event.clientY - pointerDrag.lastY;
  if (Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 4) pointerDrag.moved = true;
  if (pointerDrag.moved) {
    cameraYaw -= dx * 0.0052;
    cameraPitch = clampNumber(cameraPitch + dy * 0.0036, 0.22, 1.12, 0.48);
  }
  pointerDrag.lastX = event.clientX;
  pointerDrag.lastY = event.clientY;
  updatePreviewAtPointer();
});

ui.canvas.addEventListener('pointerup', (event) => {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return;
  updatePointerFromEvent(event);
  const wasClick = !pointerDrag.moved;
  pointerDrag = null;
  if (!wasClick || panelOpen() || !appState.buildMode) return;
  const point = groundHit();
  if (!point) return;
  if (appState.buildType) placeBuildAt(point);
  else selectDecorationAtPointer();
});
ui.canvas.addEventListener('pointercancel', () => { pointerDrag = null; });
ui.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
ui.canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraDistance = clampNumber(cameraDistance + Math.sign(event.deltaY) * 1.15, 7.5, 25, 12.4);
}, { passive: false });

function updateCamera(dt) {
  cameraTarget.set(player.x, terrainHeight(player.x, player.z) + 1.3, player.z);
  const horizontal = cameraDistance * Math.cos(cameraPitch);
  const vertical = cameraDistance * Math.sin(cameraPitch);
  const desired = new THREE.Vector3(
    player.x + Math.sin(cameraYaw) * horizontal,
    cameraTarget.y + vertical + 0.3,
    player.z + Math.cos(cameraYaw) * horizontal,
  );
  camera.position.lerp(desired, 1 - Math.exp(-5.5 * dt));
  camera.lookAt(cameraTarget);
}

// ----- On-screen mobile movement -----
function setJoystickFromEvent(event) {
  const rect = ui.joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const max = 39;
  const distance = Math.min(max, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const clampedX = Math.cos(angle) * distance;
  const clampedY = Math.sin(angle) * distance;
  joystickState.x = clampedX / max;
  joystickState.y = -clampedY / max;
  ui.joystickKnob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
}
ui.joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  joystickState.pointerId = event.pointerId;
  ui.joystick.setPointerCapture?.(event.pointerId);
  setJoystickFromEvent(event);
});
ui.joystick.addEventListener('pointermove', (event) => {
  if (joystickState.pointerId === event.pointerId) setJoystickFromEvent(event);
});
function resetJoystick(event) {
  if (event && joystickState.pointerId !== event.pointerId) return;
  joystickState.pointerId = null;
  joystickState.x = 0;
  joystickState.y = 0;
  ui.joystickKnob.style.transform = 'translate(0, 0)';
}
ui.joystick.addEventListener('pointerup', resetJoystick);
ui.joystick.addEventListener('pointercancel', resetJoystick);

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys[event.code] = true;
  if (event.code === 'Escape') {
    if (appState.buildMode) cancelBuildMode();
    else closeAllPanels();
  }
});
window.addEventListener('keyup', (event) => { keys[event.code] = false; });
window.addEventListener('blur', () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  resetJoystick();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const key of Object.keys(keys)) keys[key] = false; resetJoystick(); } });

// ----- UI events -----
ui.settingsToggle.addEventListener('click', () => openPanel(ui.settingsBackdrop));
ui.tasksToggle.addEventListener('click', () => { renderTasks(); openPanel(ui.tasksBackdrop); });
ui.buildToggle.addEventListener('click', () => {
  if (appState.buildMode) cancelBuildMode();
  else openBuildMenu();
});
for (const closeButton of document.querySelectorAll('[data-close]')) {
  closeButton.addEventListener('click', () => document.getElementById(closeButton.dataset.close)?.classList.remove('open'));
}
for (const backdrop of [ui.settingsBackdrop, ui.tasksBackdrop, ui.buildBackdrop]) {
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.classList.remove('open');
  });
}
ui.qualityOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-quality]');
  if (button) setRequestedQuality(button.dataset.quality);
});
document.querySelectorAll('[data-build]').forEach((button) => {
  button.addEventListener('click', () => chooseBuildItem(button.dataset.build));
});
ui.rotateBuild.addEventListener('click', rotateCurrentBuild);
ui.deleteBuild.addEventListener('click', removeSelectedDecoration);
ui.cancelBuild.addEventListener('click', cancelBuildMode);

// ----- Load validated saved garden -----
makeSelectionRing();
for (const item of appState.decorations) {
  addDecoration(item.type, item.x, item.z, item.rotation, false);
}
ensureDailyTasks();

// ----- Main loop -----
let elapsed = 0;
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  player.update(dt, elapsed);
  updateCamera(dt);

  if (appState.selectedDecoration && selectedRing) {
    selectedRing.position.set(
      appState.selectedDecoration.group.position.x,
      appState.selectedDecoration.group.position.y + 0.12,
      appState.selectedDecoration.group.position.z,
    );
  }
  if (QUALITY[appState.activeQuality].wind) {
    for (const canopy of treeCanopies) {
      const phase = canopy.userData.windPhase || 0;
      canopy.rotation.z = Math.sin(elapsed * 0.75 + phase) * 0.025;
      canopy.rotation.x = Math.cos(elapsed * 0.62 + phase) * 0.018;
    }
  }
  if (waterRippleMaterials.length) {
    const shimmer = 0.18 + (Math.sin(elapsed * 1.5) + 1) * 0.065;
    for (const material of waterRippleMaterials) material.opacity = shimmer;
  }
  if (fireflyPoints?.visible && fireflyPositions) {
    const attribute = fireflyPoints.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
      const baseY = 1.5 + (i % 17) * 0.36;
      attribute.setY(i, baseY + Math.sin(elapsed * 1.6 + i) * 0.55);
      attribute.setX(i, fireflyPositions[i * 3] + Math.sin(elapsed * 0.22 + i * 0.3) * 0.35);
    }
    attribute.needsUpdate = true;
    fireflyPoints.material.opacity = 0.62 + Math.sin(elapsed * 2.2) * 0.16;
  }
  monitorAutomaticQuality(dt);
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const preset = QUALITY[appState.activeQuality] || QUALITY.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dpr));
}
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState(false);
});
window.addEventListener('pagehide', () => saveState(false));

// ----- Initial state: open directly inside the garden -----
generateGarden();
setRequestedQuality(appState.requestedQuality);
renderTasks();
renderBuildMenu();
updateBuildPrompt();
window.setTimeout(() => ui.hint.classList.add('hidden'), 7500);
renderer.setAnimationLoop(animate);

// Publicly visible readiness marker for automated smoke tests; no game control API is exposed.
window.__GARDEN_READY__ = true;
