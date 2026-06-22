import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * Loads a real, detailed spine model and prepares it for the scene.
 *
 * The implementation EXPECTS a model file at one of these locations (checked in
 * order), served from the `public/` directory:
 *
 *     /models/spine.glb     (preferred — single file, embeds materials/textures)
 *     /models/spine.gltf    (+ its .bin and textures alongside)
 *     /models/spine.fbx
 *     /models/spine.obj
 *
 * No procedural/placeholder geometry is generated. If none of those files exist,
 * this rejects and the caller drops to the static fallback with a clear message.
 *
 * The loaded model's own geometry, materials, textures, proportions, curvature
 * and anatomical detail are preserved. It is only re-centred and scaled to fit
 * the camera framing, and its meshes are banded by height into anatomical
 * regions (cervical / thoracic / lumbar / sacral / coccygeal) so the scroll
 * system can highlight one region at a time.
 */

export const HIGHLIGHT = new THREE.Color(0xf6ab33);

export const SPINE_CANDIDATES = [
  '/models/spine.glb',
  '/models/spine.gltf',
  '/models/spine.fbx',
  '/models/spine.obj',
];

const TARGET_HEIGHT = 13; // world units the column should span

function makeGLTFLoader() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/'); // local decoder copied into public/draco
  loader.setDRACOLoader(draco);
  return loader;
}

async function headExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    // Dev servers (and some SPA hosts) answer missing paths with index.html.
    // A real model is not text/html, so reject that to avoid a bogus "found".
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function loadByExtension(url) {
  const ext = url.split('.').pop().toLowerCase();
  return new Promise((resolve, reject) => {
    if (ext === 'glb' || ext === 'gltf') {
      makeGLTFLoader().load(url, (gltf) => resolve(gltf.scene || gltf.scenes[0]), undefined, reject);
    } else if (ext === 'fbx') {
      new FBXLoader().load(url, resolve, undefined, reject);
    } else if (ext === 'obj') {
      new OBJLoader().load(url, resolve, undefined, reject);
    } else {
      reject(new Error(`Unsupported model extension: .${ext}`));
    }
  });
}

/** Re-centre on the origin and scale so the column spans TARGET_HEIGHT. */
function normalize(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const height = Math.max(size.y, 0.0001);
  const scale = TARGET_HEIGHT / height;

  const wrapper = new THREE.Group();
  root.position.sub(center); // centre the model within the wrapper
  wrapper.add(root);
  wrapper.scale.setScalar(scale);
  return wrapper;
}

/**
 * Band meshes by their vertical centre into anatomical regions. Real spine
 * models are usually a single mesh or a handful; we split by the world-Y of
 * each mesh so the highlight can move down the column. Proportions follow a
 * typical human spine (cervical ~13%, thoracic ~38%, lumbar ~22%, sacral ~17%,
 * coccygeal ~10% from the top).
 */
function bandRegions(wrapper) {
  const meshes = [];
  wrapper.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      meshes.push(o);
    }
  });

  const box = new THREE.Box3().setFromObject(wrapper);
  const top = box.max.y;
  const span = Math.max(box.max.y - box.min.y, 0.0001);
  // Fractions of height from the TOP where each region ends.
  const edges = { cervical: 0.13, thoracic: 0.51, lumbar: 0.73, sacrum: 0.9, coccyx: 1.0 };

  const regions = { cervical: [], thoracic: [], lumbar: [], sacrum: [], coccyx: [] };
  const order = ['cervical', 'thoracic', 'lumbar', 'sacrum', 'coccyx'];

  const center = new THREE.Vector3();
  for (const mesh of meshes) {
    // Clone material(s) so we can drive emissive without touching shared assets.
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if ('emissive' in m) {
        m.emissive = HIGHLIGHT.clone();
        m.emissiveIntensity = 0;
      }
    });

    new THREE.Box3().setFromObject(mesh).getCenter(center);
    const fromTop = (top - center.y) / span; // 0 at top → 1 at bottom
    let region = 'coccyx';
    for (const name of order) {
      if (fromTop <= edges[name]) { region = name; break; }
    }
    regions[region].push({ group: mesh, material: mesh.material });
  }

  // If the model is a single mesh, every region points at the same part so the
  // whole column lights up together (graceful, never blank).
  return regions;
}

export async function loadSpine() {
  let url = null;
  for (const candidate of SPINE_CANDIDATES) {
    if (await headExists(candidate)) { url = candidate; break; }
  }
  if (!url) {
    const err = new Error(
      `No spine model found. Expected a GLB/GLTF/FBX/OBJ at one of: ${SPINE_CANDIDATES.join(', ')}`
    );
    err.code = 'NO_SPINE_MODEL';
    throw err;
  }

  const root = await loadByExtension(url);
  const wrapper = normalize(root);
  const regions = bandRegions(wrapper);

  const bodyMaterials = [];
  for (const list of Object.values(regions)) {
    for (const part of list) {
      const mats = Array.isArray(part.material) ? part.material : [part.material];
      mats.forEach((m) => bodyMaterials.push(m));
    }
  }

  wrapper.userData.regions = regions;
  wrapper.userData.bodyMaterials = bodyMaterials;
  wrapper.userData.sourceUrl = url;
  return wrapper;
}
