# Spine model goes here

The 3D experience loads a **real, detailed spine model** from this folder. No
procedural/placeholder geometry is used — until a model is present the site runs
in its graceful static fallback (brand backdrop, all content and booking links
intact).

## Expected file (checked in this order)

| Priority | Path                      | Format |
|----------|---------------------------|--------|
| 1 (best) | `public/models/spine.glb`  | GLB — single file, embeds materials + textures |
| 2        | `public/models/spine.gltf` | glTF — keep its `.bin` and texture files alongside |
| 3        | `public/models/spine.fbx`  | FBX |
| 4        | `public/models/spine.obj`  | OBJ (+ `.mtl`) |

**GLB is strongly preferred.** Draco-compressed GLB is supported (the decoder is
bundled in `public/draco/`).

## What the model should contain

- Individually defined vertebrae
- Cervical, thoracic, lumbar, sacral and coccygeal regions
- Natural spinal curvature (the model's own curve is preserved)
- Visible processes and anatomical landmarks
- Realistic bone materials / surface texture (PBR materials come through as-is)

## How it is treated

The loader preserves the model's geometry, proportions, curvature, materials and
textures. It only:

1. Re-centres the model on the origin and scales it so the column spans the
   camera framing (≈13 world units tall).
2. Bands the meshes by height into anatomical regions so the scroll system can
   highlight one region at a time.
3. Enables shadows and a warm amber emissive used for the per-section highlight.

If your model needs a different orientation or scale, tell me and I'll adjust the
normalisation constants in `src/loadSpine.js`.
