import * as THREE from 'three';

/**
 * Procedural anatomical human spine.
 *
 * Builds 24 movable vertebrae (7 cervical, 12 thoracic, 5 lumbar) plus a sacrum
 * block, arranged along the natural sagittal S-curve (cervical lordosis,
 * thoracic kyphosis, lumbar lordosis). Each vertebra is a small group: a
 * vertebral body, a posterior spinous process, and two transverse processes,
 * with a thin intervertebral disc between bodies.
 *
 * No external GLB/GLTF asset is required, so there is no asset-load failure
 * path and the whole column can be posed and highlighted from scroll.
 *
 * Returns a THREE.Group with:
 *   group.userData.regions = { cervical:[...], thoracic:[...], lumbar:[...], sacrum:[...] }
 *   group.userData.bodyMaterials = [ per-vertebra body materials for highlighting ]
 *   group.userData.height        = total column height in world units
 */

const BONE_COLOR = 0xeadbc4;
const DISC_COLOR = 0xb87a3a;
const HIGHLIGHT = new THREE.Color(0xf6ab33);

// Region definition: [count, bodyRadius, bodyHeight]. Sizes grow downward,
// matching real anatomy (cervical small → lumbar large).
const REGIONS = [
  { name: 'cervical', count: 7, r0: 0.30, r1: 0.40, h: 0.34 },
  { name: 'thoracic', count: 12, r0: 0.42, r1: 0.58, h: 0.40 },
  { name: 'lumbar', count: 5, r0: 0.60, r1: 0.74, h: 0.50 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Sagittal S-curve offset (front/back, the Z axis) as a function of normalised
 * height u (0 = sacrum/bottom, 1 = skull/top). Positive Z = anterior.
 */
function sagittalOffset(u) {
  // lumbar lordosis (forward) near bottom, thoracic kyphosis (back) middle,
  // cervical lordosis (forward) near top.
  const lumbar = Math.sin(u * Math.PI * 0.9) * 0.0;
  const lordosisLumbar = Math.exp(-Math.pow((u - 0.18) / 0.16, 2)) * 0.55;
  const kyphosisThoracic = -Math.exp(-Math.pow((u - 0.55) / 0.22, 2)) * 0.5;
  const lordosisCervical = Math.exp(-Math.pow((u - 0.92) / 0.1, 2)) * 0.42;
  return lumbar + lordosisLumbar + kyphosisThoracic + lordosisCervical;
}

function buildVertebra(r, h, boneMat, discMat) {
  const v = new THREE.Group();

  // Vertebral body — rounded cylinder.
  const bodyGeo = new THREE.CylinderGeometry(r * 0.92, r, h, 20, 1, false);
  const body = new THREE.Mesh(bodyGeo, boneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  v.add(body);

  // Vertebral arch ring behind the body (the neural arch).
  const archGeo = new THREE.TorusGeometry(r * 0.62, r * 0.16, 10, 18, Math.PI * 1.15);
  const arch = new THREE.Mesh(archGeo, boneMat);
  arch.rotation.x = Math.PI / 2;
  arch.rotation.z = Math.PI;
  arch.position.set(0, 0, -r * 0.78);
  v.add(arch);

  // Spinous process — tapered spur pointing posteriorly and slightly down.
  const spineGeo = new THREE.ConeGeometry(r * 0.22, r * 1.5, 8);
  const spinous = new THREE.Mesh(spineGeo, boneMat);
  spinous.rotation.x = Math.PI * 0.62;
  spinous.position.set(0, -h * 0.1, -r * 1.35);
  v.add(spinous);

  // Two transverse processes pointing left/right.
  for (const dir of [-1, 1]) {
    const tGeo = new THREE.ConeGeometry(r * 0.16, r * 0.9, 7);
    const t = new THREE.Mesh(tGeo, boneMat);
    t.rotation.z = dir * Math.PI * 0.5;
    t.position.set(dir * r * 0.95, 0, -r * 0.35);
    v.add(t);
  }

  // Intervertebral disc sitting just below the body.
  const discGeo = new THREE.CylinderGeometry(r * 0.98, r * 0.98, h * 0.22, 20);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = -h * 0.6;
  v.add(disc);

  return v;
}

function buildSacrum(r, boneMat) {
  const g = new THREE.Group();
  // Triangular wedge approximating the fused sacrum.
  const geo = new THREE.CylinderGeometry(r * 0.55, r * 1.05, r * 2.1, 18);
  const sac = new THREE.Mesh(geo, boneMat);
  sac.scale.z = 0.7;
  sac.castShadow = true;
  g.add(sac);
  return g;
}

export function createSpine() {
  const group = new THREE.Group();
  const regions = { cervical: [], thoracic: [], lumbar: [], sacrum: [] };
  const bodyMaterials = [];

  const discMat = new THREE.MeshStandardMaterial({
    color: DISC_COLOR,
    roughness: 0.75,
    metalness: 0.05,
  });

  // Pre-compute total vertebra count for size interpolation and curve scale.
  const total = REGIONS.reduce((n, reg) => n + reg.count, 0); // 24
  const spacing = 0.46; // vertical gap multiplier between vertebra centres
  let y = 0;
  let index = 0;

  // Sacrum at the base.
  const sacrumMat = new THREE.MeshPhysicalMaterial({
    color: BONE_COLOR,
    roughness: 0.5,
    metalness: 0.04,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    emissive: HIGHLIGHT.clone(),
    emissiveIntensity: 0,
  });
  const sacrum = buildSacrum(0.8, sacrumMat);
  sacrum.position.y = -1.1;
  group.add(sacrum);
  regions.sacrum.push({ group: sacrum, material: sacrumMat });
  bodyMaterials.push(sacrumMat);

  for (const reg of REGIONS) {
    for (let i = 0; i < reg.count; i++) {
      const t = reg.count > 1 ? i / (reg.count - 1) : 0;
      const r = lerp(reg.r1, reg.r0, t); // larger at bottom of region
      const h = reg.h;

      // Physical material with clearcoat + a touch of iridescence gives the
      // wet, refractive bone sheen seen in the reference, kept warm and subtle.
      const boneMat = new THREE.MeshPhysicalMaterial({
        color: BONE_COLOR,
        roughness: 0.42,
        metalness: 0.06,
        clearcoat: 0.7,
        clearcoatRoughness: 0.3,
        iridescence: 0.4,
        iridescenceIOR: 1.32,
        iridescenceThicknessRange: [120, 420],
        emissive: HIGHLIGHT.clone(),
        emissiveIntensity: 0,
      });
      bodyMaterials.push(boneMat);

      const vert = buildVertebra(r, h, boneMat, discMat);
      const u = index / (total - 1);
      vert.position.set(0, y, sagittalOffset(u));
      // Tilt each vertebra to follow the curve tangent (approx via finite diff).
      const u2 = Math.min(1, u + 0.03);
      const dz = sagittalOffset(u2) - sagittalOffset(u);
      vert.rotation.x = Math.atan2(dz, 0.12);
      group.add(vert);

      regions[reg.name].push({ group: vert, material: boneMat });

      y += h * 0.5 + spacing;
      index++;
    }
  }

  group.userData.regions = regions;
  group.userData.bodyMaterials = bodyMaterials;
  group.userData.height = y;

  // Centre the column vertically around the origin.
  group.position.y = -y * 0.5 + 0.6;

  return group;
}

export { HIGHLIGHT };
