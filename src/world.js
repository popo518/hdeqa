import * as THREE from 'three/webgpu';
import { riverCenterX, riverSurfaceY, terrainHeight } from './terrain.js';

const CHUNK_SIZE = 48;
const TERRAIN_SEGMENTS = 24;
const RIVER_HALF_WIDTH = 2.35;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function hashSeed(seed, a, b) {
  let value = (seed ^ Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


function makeMaterial(color, roughness = 1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function makeBridge(scene) {
  const group = new THREE.Group();
  const wood = makeMaterial('#8b6846');
  const woodLight = makeMaterial('#aa8155');
  const dark = makeMaterial('#684a34');
  const deck = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.24, 2.6), woodLight);
  deck.castShadow = true;
  deck.receiveShadow = true;
  deck.position.y = 0.48;
  group.add(deck);
  for (let i = -5; i <= 5; i += 1) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 2.62), wood);
    plank.position.set(i * 1.02, 0.64, 0);
    group.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.16, 0.14), dark);
    rail.position.set(0, 1.1, side * 1.18);
    group.add(rail);
    for (let i = -5; i <= 5; i += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.86, 0.18), wood);
      post.position.set(i * 1.02, 0.95, side * 1.18);
      group.add(post);
    }
  }
  for (const x of [-4.4, 4.4]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 3), dark);
    support.position.set(x, 0.08, 0);
    group.add(support);
  }
  group.position.set(riverCenterX(0), riverSurfaceY(0) - 0.05, 0);
  group.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  scene.add(group);
  return group;
}

function createCharacter() {
  const root = new THREE.Group();
  const shirt = makeMaterial('#e5e0c9');
  const trousers = makeMaterial('#526c51');
  const skin = makeMaterial('#bd9677');
  const shoes = makeMaterial('#514b3d');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.72, 4, 8), shirt);
  body.position.y = 1.18;
  body.castShadow = true;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.95;
  head.castShadow = true;
  root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.275, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), makeMaterial('#493f34'));
  hair.position.y = 2.05;
  root.add(hair);

  const limbs = [];
  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.43, 1.48, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 3, 7), shirt);
    arm.position.y = -0.28;
    arm.castShadow = true;
    armPivot.add(arm);
    root.add(armPivot);
    limbs.push(armPivot);

    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.19, 0.76, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.48, 3, 7), trousers);
    leg.position.y = -0.26;
    leg.castShadow = true;
    legPivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.42), shoes);
    shoe.position.set(0, -0.53, -0.09);
    legPivot.add(shoe);
    root.add(legPivot);
    limbs.push(legPivot);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), new THREE.MeshBasicMaterial({ color: '#344537', transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  root.add(shadow);
  root.userData.limbs = limbs;
  return root;
}

function makeFlowerGroup(palette = 0) {
  const group = new THREE.Group();
  const stemMaterial = makeMaterial('#4f8050');
  const petalColors = ['#e9c7a4', '#e7a7a1', '#e9d786', '#d7b4db', '#f4e6ca'];
  const petalMaterial = makeMaterial(petalColors[palette % petalColors.length]);
  const centerMaterial = makeMaterial('#e4b85c');
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 5), stemMaterial);
  stem.position.y = 0.23;
  group.add(stem);
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.105, 6, 5), petalMaterial);
    petal.scale.set(0.9, 0.55, 1.15);
    petal.position.set(Math.cos(angle) * 0.12, 0.48, Math.sin(angle) * 0.12);
    group.add(petal);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 6), centerMaterial);
  center.position.y = 0.49;
  group.add(center);
  return group;
}

function addNaturalTrees(chunkGroup, rng, cx, cz, obstacles, seed) {
  const count = 6 + Math.floor(rng() * 5);
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.26, 2.65, 7);
  const crownGeometry = new THREE.SphereGeometry(1.35, 9, 7);
  const trunkMaterial = makeMaterial('#75553a');
  const crownMaterial = makeMaterial('#62895a');
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
  trunks.castShadow = true;
  crowns.castShadow = true;
  const dummy = new THREE.Object3D();
  let accepted = 0;
  for (let attempt = 0; attempt < count * 5 && accepted < count; attempt += 1) {
    const x = cx + (rng() - 0.5) * CHUNK_SIZE * 0.88;
    const z = cz + (rng() - 0.5) * CHUNK_SIZE * 0.88;
    const riverDistance = Math.abs(x - riverCenterX(z));
    if (riverDistance < 7) continue;
    if (Math.hypot(x - 8, z - 8) < 12) continue;
    const y = terrainHeight(x, z);
    const scale = 0.82 + rng() * 0.5;
    dummy.position.set(x, y + 1.25 * scale, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(accepted, dummy.matrix);
    dummy.position.y = y + 3.0 * scale;
    dummy.scale.set(1.05 * scale, 1.28 * scale, 1.0 * scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(accepted, dummy.matrix);
    const tint = new THREE.Color().setHSL(0.27 + rng() * 0.045, 0.28 + rng() * 0.12, 0.37 + rng() * 0.08);
    crowns.setColorAt(accepted, tint);
    obstacles.push({ x, z, radius: 0.72 * scale, type: 'tree', id: `${seed}-${cx}-${cz}-${accepted}` });
    accepted += 1;
  }
  trunks.count = accepted;
  crowns.count = accepted;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (accepted) {
    chunkGroup.add(trunks, crowns);
  } else {
    trunkGeometry.dispose();
    crownGeometry.dispose();
  }
}

function addNaturalRocks(chunkGroup, rng, cx, cz, obstacles) {
  const count = 5;
  const geometry = new THREE.DodecahedronGeometry(0.55, 0);
  const material = makeMaterial('#899184');
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  rocks.castShadow = true;
  const dummy = new THREE.Object3D();
  let accepted = 0;
  for (let attempt = 0; attempt < count * 4 && accepted < count; attempt += 1) {
    const x = cx + (rng() - 0.5) * CHUNK_SIZE * 0.9;
    const z = cz + (rng() - 0.5) * CHUNK_SIZE * 0.9;
    if (Math.abs(x - riverCenterX(z)) < 7.5 || Math.hypot(x - 8, z - 8) < 10) continue;
    const scale = 0.5 + rng() * 0.9;
    dummy.position.set(x, terrainHeight(x, z) + 0.25 * scale, z);
    dummy.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3);
    dummy.scale.set(scale * 1.1, scale * 0.65, scale);
    dummy.updateMatrix();
    rocks.setMatrixAt(accepted, dummy.matrix);
    obstacles.push({ x, z, radius: 0.5 * scale, type: 'rock' });
    accepted += 1;
  }
  rocks.count = accepted;
  rocks.instanceMatrix.needsUpdate = true;
  if (accepted) chunkGroup.add(rocks);
  else geometry.dispose();
}

function addWildflowers(chunkGroup, rng, cx, cz) {
  const count = 12;
  const flowerGeometry = new THREE.SphereGeometry(0.105, 5, 4);
  const flowerMaterial = makeMaterial('#ead2ad');
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, count);
  const dummy = new THREE.Object3D();
  let accepted = 0;
  for (let i = 0; i < count * 3 && accepted < count; i += 1) {
    const x = cx + (rng() - 0.5) * CHUNK_SIZE * 0.92;
    const z = cz + (rng() - 0.5) * CHUNK_SIZE * 0.92;
    if (Math.abs(x - riverCenterX(z)) < 5.8) continue;
    const y = terrainHeight(x, z);
    dummy.position.set(x, y + 0.38, z);
    dummy.scale.set(0.7 + rng() * 0.8, 0.55, 0.7 + rng() * 0.8);
    dummy.rotation.y = rng() * Math.PI;
    dummy.updateMatrix();
    flowers.setMatrixAt(accepted, dummy.matrix);
    flowers.setColorAt(accepted, new THREE.Color().setHSL(0.07 + rng() * 0.2, 0.48, 0.72));
    accepted += 1;
  }
  flowers.count = accepted;
  flowers.instanceMatrix.needsUpdate = true;
  if (accepted) chunkGroup.add(flowers);
  else flowerGeometry.dispose();
}

function addGrass(chunkGroup, rng, cx, cz) {
  const count = 155;
  const geometry = new THREE.ConeGeometry(0.045, 0.42, 3);
  const material = makeMaterial('#6f9860');
  const grass = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  let accepted = 0;
  for (let i = 0; i < count * 3 && accepted < count; i += 1) {
    const x = cx + (rng() - 0.5) * CHUNK_SIZE * 0.98;
    const z = cz + (rng() - 0.5) * CHUNK_SIZE * 0.98;
    if (Math.abs(x - riverCenterX(z)) < 5.2) continue;
    if (Math.hypot(x - 8, z - 8) < 7) continue;
    const y = terrainHeight(x, z);
    const scale = 0.55 + rng() * 0.85;
    dummy.position.set(x, y + 0.18 * scale, z);
    dummy.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI, (rng() - 0.5) * 0.2);
    dummy.scale.set(0.8 + rng() * 0.7, scale, 0.8 + rng() * 0.7);
    dummy.updateMatrix();
    grass.setMatrixAt(accepted, dummy.matrix);
    grass.setColorAt(accepted, new THREE.Color().setHSL(0.25 + rng() * 0.055, 0.32, 0.34 + rng() * 0.15));
    accepted += 1;
  }
  grass.count = accepted;
  grass.instanceMatrix.needsUpdate = true;
  if (accepted) chunkGroup.add(grass);
  else geometry.dispose();
}

function createRiverMesh(cz) {
  const segments = 40;
  const across = 4;
  const vertices = [];
  const indices = [];
  const uvs = [];
  for (let i = 0; i <= segments; i += 1) {
    const z = cz - CHUNK_SIZE / 2 + (i / segments) * CHUNK_SIZE;
    const center = riverCenterX(z);
    const y = riverSurfaceY(z);
    for (let j = 0; j <= across; j += 1) {
      const t = j / across * 2 - 1;
      const x = center + t * RIVER_HALF_WIDTH;
      vertices.push(x, y + 0.01 * Math.sin(z * 0.3 + j), z);
      uvs.push(j / across, i / segments);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const a = i * (across + 1) + j;
      const b = a + across + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: '#6eabc1', roughness: 0.23, metalness: 0.05, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function createTerrainChunk(scene, cx, cz, seed, obstacles) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  const positions = geometry.attributes.position;
  const colors = [];
  const normals = [];
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const localX = positions.getX(i);
    const localY = positions.getY(i);
    const x = cx + localX;
    const z = cz - localY;
    const y = terrainHeight(x, z);
    positions.setZ(i, y);
    const epsilon = 0.35;
    const dx = (terrainHeight(x + epsilon, z) - terrainHeight(x - epsilon, z)) / (2 * epsilon);
    const dz = (terrainHeight(x, z + epsilon) - terrainHeight(x, z - epsilon)) / (2 * epsilon);
    const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
    normals.push(normal.x, normal.y, normal.z);
    const heightTint = THREE.MathUtils.clamp((y + 1.0) / 3.0, 0, 1);
    color.setHSL(0.285 - heightTint * 0.03, 0.34 + heightTint * 0.1, 0.36 + heightTint * 0.11);
    const riverEdge = Math.abs(x - riverCenterX(z));
    if (riverEdge < 5.3 && riverEdge > RIVER_HALF_WIDTH) color.lerp(new THREE.Color('#8d9c68'), 0.25);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  terrain.position.set(cx, 0, cz);
  terrain.receiveShadow = true;
  terrain.userData.isTerrain = true;
  group.add(terrain);
  const water = createRiverMesh(cz);
  group.add(water);
  const rng = randomGenerator(hashSeed(seed, Math.round(cx / CHUNK_SIZE), Math.round(cz / CHUNK_SIZE)));
  const chunkObstacles = [];
  addNaturalTrees(group, rng, cx, cz, chunkObstacles, seed);
  addNaturalRocks(group, rng, cx, cz, chunkObstacles);
  addWildflowers(group, rng, cx, cz);
  addGrass(group, rng, cx, cz);
  obstacles.push(...chunkObstacles);
  scene.add(group);
  return { group, terrain, water, obstacles: chunkObstacles };
}

function makeObjectModel(type, ghost = false) {
  const group = new THREE.Group();
  const opacity = ghost ? 0.53 : 1;
  const material = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, transparent: ghost, opacity, depthWrite: !ghost });
  const wood = material('#956f49');
  const woodLight = material('#b28d61');
  const green = material('#5b8554');
  const leaves = material('#658f5c');
  const stone = material('#a6a99a');
  const cream = material('#e4d4b9');
  const flowerColors = ['#e4a4a0', '#e9d38c', '#c8aed7', '#f0e3ca'];

  if (type === 'flower' || type === 'flowerbed') {
    const count = type === 'flower' ? 1 : 7;
    for (let i = 0; i < count; i += 1) {
      const f = makeFlowerGroup(i);
      const angle = i * 2.4;
      const radius = type === 'flower' ? 0 : 0.58 + (i % 2) * 0.16;
      f.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      f.scale.setScalar(type === 'flower' ? 1 : 0.78 + (i % 3) * 0.08);
      if (ghost) f.traverse(node => { if (node.isMesh) { node.material = material(flowerColors[i % flowerColors.length]); } });
      group.add(f);
    }
  } else if (type === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 8), wood);
    trunk.position.y = 1.2;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.45, 11, 9), leaves);
    crown.scale.set(1.0, 1.2, 1.0);
    crown.position.y = 3.0;
    group.add(crown);
    const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 9, 7), green);
    crown2.position.set(0.62, 2.85, 0.22);
    group.add(crown2);
  } else if (type === 'bench') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.62), woodLight);
    seat.position.y = 0.72;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.16), wood);
    back.position.set(0, 1.15, 0.26);
    back.rotation.x = -0.12;
    group.add(back);
    for (const x of [-0.78, 0.78]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.48), wood);
      leg.position.set(x, 0.34, 0);
      group.add(leg);
      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.05, 0.13), wood);
      backLeg.position.set(x, 0.75, 0.27);
      group.add(backLeg);
    }
  } else if (type === 'fountain') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.34, 16), stone);
    base.position.y = 0.17;
    group.add(base);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.02, 0.44, 16, 1, true), cream);
    bowl.position.y = 0.47;
    group.add(bowl);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 16), material('#72b5c7', 0.24));
    water.position.y = 0.64;
    group.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.8, 8), stone);
    column.position.y = 0.98;
    group.add(column);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), cream);
    top.position.y = 1.43;
    group.add(top);
  } else if (type === 'cottage') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.7, 3.6), cream);
    body.position.y = 1.35;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.25, 2.0, 4), material('#865d43'));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.12, 1, 0.92);
    roof.position.y = 3.55;
    group.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.55, 0.11), wood);
    door.position.set(0.8, 0.8, -1.86);
    group.add(door);
    const windowMaterial = material('#92b4aa', 0.32);
    for (const x of [-1.25, 1.8]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.68, 0.1), windowMaterial);
      window.position.set(x, 1.63, -1.86);
      group.add(window);
    }
    for (const x of [-1.6, 1.6]) {
      const porch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), wood);
      porch.position.set(x, 0.85, -2.1);
      group.add(porch);
    }
  }
  group.traverse(node => {
    if (node.isMesh) {
      node.castShadow = !ghost;
      node.receiveShadow = !ghost;
    }
  });
  return group;
}

export class GardenWorld {
  constructor({ canvas, state, onPositionSave, onObjectSelect, onPreviewChange, onCameraChange, onError, joystick, joystickKnob, reducedMotion = false }) {
    this.canvas = canvas;
    this.state = state;
    this.onPositionSave = onPositionSave;
    this.onObjectSelect = onObjectSelect;
    this.onPreviewChange = onPreviewChange;
    this.onCameraChange = onCameraChange;
    this.onError = onError;
    this.joystick = joystick;
    this.joystickKnob = joystickKnob;
    this.reducedMotion = reducedMotion;
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.chunks = new Map();
    this.obstacles = [];
    this.terrainMeshes = [];
    this.placedGroups = new Map();
    this.buildType = null;
    this.buildRotation = 0;
    this.preview = null;
    this.previewPlacement = null;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.cameraYaw = 0;
    this.cameraPitch = 0.42;
    this.cameraDistance = state.settings.cameraDistance || 10;
    this.playerVelocity = new THREE.Vector3();
    this.lastSavedAt = 0;
    this.lastPerformanceCheck = 0;
    this.frameSamples = [];
    this.dynamicScale = 1;
    this.lastFrame = 0;
    this.lastRender = 0;
    this.disposed = false;

    try {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      throw new Error('تعذر إنشاء محرك الرسوم. تحقق من دعم WebGL 2 في المتصفح.');
    }
    this.configureRenderer();
    this.rendererReady = this.renderer.init().catch(async error => {
      console.warn('Automatic renderer initialization failed; retrying with the WebGL 2 backend:', error);
      try { this.renderer.dispose(); } catch { /* Ignore an uninitialized renderer. */ }
      // WebGPURenderer exposes a supported WebGL 2 backend via forceWebGL.
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', forceWebGL: true });
      this.configureRenderer();
      await this.renderer.init();
      if (this.profileSettings) this.setGraphics(this.profile || 'auto');
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b9d7d9');
    this.scene.fog = new THREE.FogExp2('#c7d9ce', 0.0035);
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 420);
    this.addLighting();
    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.placedRoot = new THREE.Group();
    this.scene.add(this.placedRoot);
    this.bridge = makeBridge(this.scene);
    this.player = createCharacter();
    this.scene.add(this.player);
    this.player.position.set(state.player.x ?? 8, terrainHeight(state.player.x ?? 8, state.player.z ?? 8), state.player.z ?? 8);
    this.cameraYaw = Number.isFinite(state.player.yaw) ? state.player.yaw : 0;
    this.cameraTarget = new THREE.Vector3();

    this.profile = 'auto';
    this.chunkRadius = 2;
    this.lastChunkCenterKey = null;
    this.inputPaused = false;
    this.setGraphics(state.settings.graphics || 'auto');
    this.loadPlacedItems();
    this.ensureChunks();
    this.addEvents();
    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler, { passive: true });
    this.frame = this.frame.bind(this);
    this.updateCamera(1);
    this.rendererReady.then(() => {
      if (!this.disposed) this.raf = requestAnimationFrame(this.frame);
    }).catch(error => {
      console.error(error);
      this.onError?.(error);
    });
  }

  configureRenderer() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    if (this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      // Use the renderer's supported default shadow filter.
    }
  }

  addLighting() {
    const hemisphere = new THREE.HemisphereLight('#edf6e9', '#75846a', 1.5);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff1d7', 2.15);
    sun.position.set(-28, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -38;
    sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 38;
    sun.shadow.camera.bottom = -38;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);
    this.sun = sun;
  }

  setGraphics(profile) {
    const settings = {
      auto: { radius: 2, pixel: 1.45, shadows: true, fps: 60 },
      battery: { radius: 1, pixel: 0.78, shadows: false, fps: 30 },
      'very-low': { radius: 1, pixel: 0.72, shadows: false, fps: 30 },
      low: { radius: 1, pixel: 0.9, shadows: false, fps: 30 },
      medium: { radius: 2, pixel: 1.15, shadows: true, fps: 45 },
      high: { radius: 2, pixel: 1.55, shadows: true, fps: 60 },
      ultra: { radius: 3, pixel: 1.9, shadows: true, fps: 60 },
    };
    let selected = profile;
    if (profile === 'auto') {
      const cores = navigator.hardwareConcurrency || 4;
      const narrow = Math.min(window.innerWidth, window.innerHeight) < 600;
      selected = cores <= 4 || narrow ? 'low' : cores <= 8 ? 'medium' : 'high';
    }
    this.profile = profile;
    this.activeProfile = selected;
    this.profileSettings = settings[selected] || settings.medium;
    this.chunkRadius = this.profileSettings.radius;
    if (this.renderer.shadowMap) this.renderer.shadowMap.enabled = this.profileSettings.shadows;
    this.sun.castShadow = this.profileSettings.shadows;
    this.applyResolution();
    if (this.chunks) this.ensureChunks(true);
  }

  applyResolution() {
    const max = this.profileSettings?.pixel || 1.2;
    const dynamic = this.profile === 'auto' ? this.dynamicScale : 1;
    const pixelRatio = Math.min((window.devicePixelRatio || 1) * dynamic, max, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  addEvents() {
    this.onKeyDown = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      this.keys.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'q' && this.buildType) this.rotateBuild(-Math.PI / 8);
      if (event.key.toLowerCase() === 'e' && this.buildType) this.rotateBuild(Math.PI / 8);
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    this.onBlur = () => { this.keys.clear(); this.joy.x = 0; this.joy.y = 0; };
    window.addEventListener('blur', this.onBlur);

    this.drag = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.buildType) this.updatePreviewFromPointer(event);
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      if (Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 5) this.drag.moved = true;
      if (this.drag.moved && !this.buildType && !this.inputPaused && event.pointerType !== 'touch') {
        this.cameraYaw -= dx * 0.005;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.0035, 0.16, 1.0);
      } else if (this.drag.moved && !this.buildType && !this.inputPaused && event.pointerType === 'touch') {
        this.cameraYaw -= dx * 0.006;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, 0.18, 0.98);
      }
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
    });
    const finishPointer = (event) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const wasClick = !this.drag.moved;
      this.drag = null;
      if (wasClick && !this.buildType && !this.inputPaused) this.inspectAtPointer(event);
      if (wasClick && this.buildType) this.updatePreviewFromPointer(event);
    };
    this.canvas.addEventListener('pointerup', finishPointer);
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    this.canvas.addEventListener('wheel', event => {
      if (this.buildType) return;
      event.preventDefault();
      this.setCameraDistance(this.cameraDistance + event.deltaY * 0.008);
    }, { passive: false });

    if (this.joystick) {
      let joyPointer = null;
      const updateJoy = (event) => {
        const rect = this.joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let x = (event.clientX - cx) / (rect.width * 0.36);
        let y = (cy - event.clientY) / (rect.height * 0.36);
        const length = Math.hypot(x, y);
        if (length > 1) { x /= length; y /= length; }
        this.joy.x = x;
        this.joy.y = y;
        this.joy.active = true;
        this.joystickKnob.style.transform = `translate(calc(-50% + ${x * 28}px), calc(-50% - ${y * 28}px))`;
      };
      this.joystick.addEventListener('pointerdown', (event) => {
        joyPointer = event.pointerId;
        this.joystick.classList.add('active');
        this.joystick.setPointerCapture(event.pointerId);
        updateJoy(event);
      });
      this.joystick.addEventListener('pointermove', (event) => { if (joyPointer === event.pointerId) updateJoy(event); });
      const endJoy = (event) => {
        if (joyPointer !== event.pointerId) return;
        joyPointer = null;
        this.joy.x = 0;
        this.joy.y = 0;
        this.joy.active = false;
        this.joystick.classList.remove('active');
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
      };
      this.joystick.addEventListener('pointerup', endJoy);
      this.joystick.addEventListener('pointercancel', endJoy);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyResolution();
  }

  ensureChunks(force = false) {
    if (!this.scene || !this.player) return;
    const cx = Math.floor(this.player.position.x / CHUNK_SIZE) * CHUNK_SIZE;
    const cz = Math.floor(this.player.position.z / CHUNK_SIZE) * CHUNK_SIZE;
    const centerKey = `${cx}:${cz}:${this.chunkRadius}`;
    if (!force && centerKey === this.lastChunkCenterKey) return;
    this.lastChunkCenterKey = centerKey;
    const required = new Set();
    for (let x = -this.chunkRadius; x <= this.chunkRadius; x += 1) {
      for (let z = -this.chunkRadius; z <= this.chunkRadius; z += 1) {
        const chunkX = cx + x * CHUNK_SIZE;
        const chunkZ = cz + z * CHUNK_SIZE;
        const key = `${chunkX}:${chunkZ}`;
        required.add(key);
        if (!this.chunks.has(key)) {
          const result = createTerrainChunk(this.worldRoot, chunkX, chunkZ, this.state.worldSeed, this.obstacles);
          this.chunks.set(key, result);
          this.terrainMeshes.push(result.terrain);
        }
      }
    }
    for (const [key, chunk] of this.chunks.entries()) {
      if (required.has(key)) continue;
      this.worldRoot.remove(chunk.group);
      const terrainIndex = this.terrainMeshes.indexOf(chunk.terrain);
      if (terrainIndex >= 0) this.terrainMeshes.splice(terrainIndex, 1);
      chunk.group.traverse(object => {
        if (object.isMesh || object.isInstancedMesh) {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
          else object.material?.dispose?.();
        }
      });
      this.chunks.delete(key);
    }
    this.obstacles = [...this.chunks.values()].flatMap(chunk => chunk.obstacles || []);
    const radius = CHUNK_SIZE * (this.chunkRadius + 0.5);
    this.obstacles = this.obstacles.filter(item => Math.abs(item.x - this.player.position.x) < radius && Math.abs(item.z - this.player.position.z) < radius);
  }

  loadPlacedItems() {
    for (const item of this.state.placedItems || []) this.addPlacedItem(item);
  }

  addPlacedItem(item) {
    const group = makeObjectModel(item.type, false);
    const y = terrainHeight(item.x, item.z);
    group.position.set(item.x, y, item.z);
    group.rotation.y = item.rotation || 0;
    group.userData.itemId = item.id;
    group.traverse(node => {
      if (node.isMesh) node.userData.itemId = item.id;
    });
    this.placedRoot.add(group);
    this.placedGroups.set(item.id, group);
    return group;
  }

  removePlacedItem(id) {
    const group = this.placedGroups.get(id);
    if (!group) return;
    this.placedRoot.remove(group);
    group.traverse(node => { node.geometry?.dispose?.(); });
    this.placedGroups.delete(id);
  }

  setBuildType(type) {
    this.cancelBuild();
    this.buildType = type;
    this.buildRotation = 0;
    this.preview = makeObjectModel(type, true);
    this.preview.visible = false;
    this.scene.add(this.preview);
    this.previewPlacement = null;
  }

  cancelBuild() {
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview.traverse(node => { node.geometry?.dispose?.(); if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.()); else node.material?.dispose?.(); });
    }
    this.preview = null;
    this.previewPlacement = null;
    this.onPreviewChange?.(false);
    this.buildType = null;
    this.buildRotation = 0;
  }

  rotateBuild(amount) {
    if (!this.buildType || !this.preview) return;
    this.buildRotation += amount;
    this.preview.rotation.y = this.buildRotation;
    if (this.previewPlacement) this.validatePreview(this.previewPlacement.x, this.previewPlacement.z);
  }

  updatePreviewFromPointer(event) {
    if (!this.buildType || !this.preview) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.terrainMeshes, false);
    if (!hits.length) {
      this.preview.visible = false;
      this.previewPlacement = null;
      this.onPreviewChange?.(false);
      return;
    }
    const point = hits[0].point;
    this.validatePreview(point.x, point.z);
  }

  validatePreview(x, z) {
    if (!this.preview) return false;
    const y = terrainHeight(x, z);
    const riverDistance = Math.abs(x - riverCenterX(z));
    const slope = Math.max(
      Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)),
      Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1)),
    );
    const tooCloseToPlayer = Math.hypot(x - this.player.position.x, z - this.player.position.z) < 2.5;
    const tooCloseToBridge = Math.hypot(x - riverCenterX(0), z) < 7 && riverDistance < 6.5;
    const tooCloseToObject = (this.state.placedItems || []).some(item => Math.hypot(item.x - x, item.z - z) < (item.radius || 1.2) + (this.objectRadius(this.buildType)) + 0.9);
    const tooCloseToNatural = this.obstacles.some(item => Math.hypot(item.x - x, item.z - z) < item.radius + this.objectRadius(this.buildType) + 0.8);
    const valid = riverDistance > 5.2 && slope < 0.9 && !tooCloseToPlayer && !tooCloseToBridge && !tooCloseToObject && !tooCloseToNatural;
    this.preview.visible = true;
    this.preview.position.set(x, y + 0.025, z);
    this.preview.rotation.y = this.buildRotation;
    this.previewPlacement = { x, y, z, rotation: this.buildRotation, valid };
    this.onPreviewChange?.(valid);
    this.preview.traverse(node => {
      if (node.isMesh && node.material?.color) node.material.color.set(valid ? '#a5d7a0' : '#df8880');
    });
    return valid;
  }

  objectRadius(type) {
    const radii = { flower: 0.5, flowerbed: 1.1, tree: 1.3, bench: 1.2, fountain: 1.6, cottage: 3 };
    return radii[type] || 1;
  }

  getPreviewPlacement() {
    return this.previewPlacement ? { ...this.previewPlacement } : null;
  }

  inspectAtPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.placedRoot.children, true);
    if (!hits.length) return;
    let object = hits[0].object;
    while (object && !object.userData.itemId) object = object.parent;
    if (object?.userData.itemId) this.onObjectSelect?.(object.userData.itemId);
  }

  inputVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const vector = new THREE.Vector2(x, y);
    if (vector.length() > 1) vector.normalize();
    return vector;
  }

  checkCollision(x, z) {
    const distance = Math.abs(x - riverCenterX(z));
    const nearBridge = Math.abs(z) < 1.35;
    if (distance < 4.9 && !nearBridge) {
      const currentSide = this.player.position.x - riverCenterX(z);
      const nextSide = x - riverCenterX(z);
      if (Math.sign(currentSide || 1) !== Math.sign(nextSide || 1) || Math.abs(nextSide) < 4.9) return true;
    }
    for (const obstacle of this.obstacles) {
      const safeRadius = obstacle.radius + 0.5;
      if (Math.abs(obstacle.x - x) > safeRadius || Math.abs(obstacle.z - z) > safeRadius) continue;
      if (Math.hypot(obstacle.x - x, obstacle.z - z) < safeRadius) return true;
    }
    for (const item of this.state.placedItems || []) {
      const radius = (item.radius || 1) * 0.72 + 0.48;
      if (Math.hypot(item.x - x, item.z - z) < radius) return true;
    }
    return false;
  }

  movePlayer(delta) {
    if (this.inputPaused || this.buildType) {
      this.playerVelocity.multiplyScalar(Math.max(0, 1 - delta * 10));
      return;
    }
    const input = this.inputVector();
    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw));
    const direction = new THREE.Vector3().addScaledVector(forward, input.y).addScaledVector(right, input.x);
    if (direction.lengthSq() > 1) direction.normalize();
    const speed = Number(this.state.settings.movementSpeed) || 6;
    const targetVelocity = direction.multiplyScalar(speed);
    this.playerVelocity.lerp(targetVelocity, Math.min(1, delta * 10));
    if (this.playerVelocity.lengthSq() < 0.025) this.playerVelocity.set(0, 0, 0);
    let nextX = this.player.position.x + this.playerVelocity.x * delta;
    let nextZ = this.player.position.z + this.playerVelocity.z * delta;
    if (this.checkCollision(nextX, this.player.position.z)) nextX = this.player.position.x;
    if (this.checkCollision(this.player.position.x, nextZ)) nextZ = this.player.position.z;
    if (this.checkCollision(nextX, nextZ)) { nextX = this.player.position.x; nextZ = this.player.position.z; }
    this.player.position.x = nextX;
    this.player.position.z = nextZ;
    const bridgeZone = Math.abs(nextZ) < 1.25 && Math.abs(nextX - riverCenterX(nextZ)) < 5.3;
    const groundY = terrainHeight(nextX, nextZ);
    this.player.position.y = bridgeZone ? Math.max(groundY, riverSurfaceY(nextZ) + 0.38) : groundY;
    const moving = this.playerVelocity.lengthSq() > 0.2;
    if (moving) this.player.rotation.y = Math.atan2(this.playerVelocity.x, this.playerVelocity.z);
    const swing = moving ? Math.sin(performance.now() * 0.012) * 0.55 : 0;
    const limbs = this.player.userData.limbs || [];
    limbs.forEach((limb, index) => { limb.rotation.x = swing * (index % 2 ? -1 : 1) * (index < 2 ? 0.55 : 1); });
    this.ensureChunks();
  }

  updateCamera(delta) {
    const distance = this.cameraDistance;
    const horizontal = distance * Math.cos(this.cameraPitch);
    const vertical = distance * Math.sin(this.cameraPitch) + 2.4;
    const target = new THREE.Vector3(this.player.position.x, this.player.position.y + 1.0, this.player.position.z);
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.cameraYaw) * horizontal,
      target.y + vertical,
      target.z + Math.cos(this.cameraYaw) * horizontal,
    );
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 2.0);
    const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 5.5);
    this.camera.position.lerp(desired, smoothing);
    this.camera.lookAt(target.x, target.y + 0.28, target.z);
    this.cameraTarget.copy(target);
  }

  frame(now) {
    if (this.disposed) return;
    const delta = Math.min(0.05, this.lastFrame ? (now - this.lastFrame) / 1000 : 0.016);
    this.lastFrame = now;
    // Keep movement responsive while limiting expensive scene renders to the profile target.
    this.movePlayer(delta);
    this.updateCamera(delta);
    const renderInterval = 1000 / Math.max(15, this.profileSettings?.fps || 60);
    if (!this.lastRender || now - this.lastRender >= renderInterval - 1) {
      const renderDelta = this.lastRender ? now - this.lastRender : delta * 1000;
      this.lastRender = now;
      if (this.preview?.visible) this.preview.position.y = this.previewPlacement?.y + 0.03 + Math.sin(now * 0.002) * 0.025;
      for (const chunk of this.chunks.values()) chunk.water.position.y = Math.sin(now * 0.0012 + chunk.water.position.z * 0.02) * 0.012;
      this.renderer.render(this.scene, this.camera);
      this.frameSamples.push(renderDelta);
      if (this.frameSamples.length > 90) this.frameSamples.shift();
      if (now - this.lastPerformanceCheck > 3000) {
        this.lastPerformanceCheck = now;
        this.adjustPerformance();
      }
    }
    if (now - this.lastSavedAt > 5000) {
      this.lastSavedAt = now;
      this.onPositionSave?.({ x: this.player.position.x, z: this.player.position.z, yaw: this.cameraYaw });
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  adjustPerformance() {
    if (this.profile !== 'auto' || this.frameSamples.length < 25) return;
    const averageMs = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
    const targetMs = 1000 / Math.max(15, this.profileSettings?.fps || 60);
    if (averageMs > targetMs * 1.18 && this.dynamicScale > 0.72) {
      this.dynamicScale = Math.max(0.72, this.dynamicScale - 0.08);
      this.applyResolution();
    } else if (averageMs < targetMs * 0.85 && this.dynamicScale < 1) {
      this.dynamicScale = Math.min(1, this.dynamicScale + 0.04);
      this.applyResolution();
    }
  }

  getPlayerState() {
    return { x: this.player.position.x, z: this.player.position.z, yaw: this.cameraYaw, cameraDistance: this.cameraDistance };
  }

  setInputPaused(paused) {
    this.inputPaused = Boolean(paused);
    if (this.inputPaused) { this.keys.clear(); this.playerVelocity.set(0, 0, 0); }
  }

  resetCamera() {
    this.cameraYaw = 0;
    this.cameraPitch = 0.42;
    this.cameraDistance = 10;
    this.onCameraChange?.(this.cameraDistance);
  }

  setCameraDistance(value) {
    this.cameraDistance = THREE.MathUtils.clamp(value, 7, 17);
    this.onCameraChange?.(this.cameraDistance);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.cancelBuild();
    for (const chunk of this.chunks.values()) {
      chunk.group.traverse(node => {
        if (node.isMesh || node.isInstancedMesh) {
          node.geometry?.dispose?.();
          if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.());
          else node.material?.dispose?.();
        }
      });
    }
    for (const group of this.placedGroups.values()) group.traverse(node => { node.geometry?.dispose?.(); if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.()); else node.material?.dispose?.(); });
    this.renderer.dispose();
  }
}
