// Generates a throwaway GLB (a stacked column of boxes) purely to validate the
// model-loading pipeline end-to-end. This is NOT the real spine — it is deleted
// after the test and never committed. The real model must be supplied by the user.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs';

const parts = [];
const N = 20;
let y = 0;
for (let i = 0; i < N; i++) {
  const t = i / (N - 1);
  const r = 0.4 + t * 0.5;
  const g = new THREE.BoxGeometry(r, 0.45, r * 0.9, 1, 1, 1);
  g.translate(0, y, Math.sin(t * Math.PI) * 0.6);
  parts.push(g);
  y += 0.6;
}
const geo = mergeGeometries(parts, false);
geo.computeVertexNormals();

const pos = geo.getAttribute('position').array;
const nor = geo.getAttribute('normal').array;
let idx = geo.getIndex().array;
const indices = Uint32Array.from(idx);
const positions = Float32Array.from(pos);
const normals = Float32Array.from(nor);

function align4(n) { return (n + 3) & ~3; }

// Concatenate binary: indices, positions, normals (each 4-byte aligned).
const idxBytes = indices.byteLength;
const posOff = align4(idxBytes);
const norOff = align4(posOff + positions.byteLength);
const binLen = align4(norOff + normals.byteLength);
const bin = Buffer.alloc(binLen);
Buffer.from(indices.buffer).copy(bin, 0);
Buffer.from(positions.buffer).copy(bin, posOff);
Buffer.from(normals.buffer).copy(bin, norOff);

// min/max for POSITION.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
}

const gltf = {
  asset: { version: '2.0', generator: 'make-test-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'TestSpine' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 1, NORMAL: 2 }, indices: 0, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.91, 0.85, 0.75, 1], metallicFactor: 0.05, roughnessFactor: 0.6 } }],
  buffers: [{ byteLength: binLen }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: idxBytes, target: 34963 },
    { buffer: 0, byteOffset: posOff, byteLength: positions.byteLength, target: 34962 },
    { buffer: 0, byteOffset: norOff, byteLength: normals.byteLength, target: 34962 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
    { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
    { bufferView: 2, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
  ],
};

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = align4(json.length) - json.length;
if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
const total = 12 + 8 + json.length + 8 + bin.length;
header.writeUInt32LE(total, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(json.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(bin.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

const glb = Buffer.concat([header, jsonChunkHeader, json, binChunkHeader, bin]);
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/spine.glb', glb);
console.log(`Wrote test GLB: public/models/spine.glb (${(glb.length / 1024).toFixed(1)} KB, ${indices.length / 3} tris)`);
