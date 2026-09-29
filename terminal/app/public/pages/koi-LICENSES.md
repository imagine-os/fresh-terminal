# Koi Pond Terminal — third-party notices

Three versions live here: `koi.html` (v3, current), `koi-v2.html` (v2, archived) and `koi-v1.html` (v1, archived).
Everything not listed below is original to this project. Checked 2026-09-29: only CC0, CC-BY and MIT material is used.

## v3 (`koi.html`, `koi.js`, `koi3/`) — added 2026-09-29

Source: `terminal/pages-src/koi3/` (build with `npm i && npm run build` there). Bundle built with esbuild 0.24.0.

### three.js 0.170.0 — MIT
https://github.com/mrdoob/three.js — Copyright © 2010-2026 three.js authors.
Used: renderer, PBR materials (MeshStandard/MeshPhysical with transmission), PMREM, GLTFLoader, BufferGeometryUtils (bundled, tree-shaken).
The planar water reflection (`renderReflection` in `src/main.js`) follows the mirrored-camera and oblique-clip-plane method of
three.js `examples/jsm/objects/Reflector.js` (MIT), rewritten inline.

### Poly Haven — CC0 1.0 (public domain), https://polyhaven.com/license
No attribution is required; credited anyway. Downloaded 2026-09-29 from https://api.polyhaven.com, resized and re-encoded (WebP, 512–4096 px; glTF simplified and quantized with glTF-Transform 4).
| File in `koi3/` | Asset | Author | Source |
| --- | --- | --- | --- |
| `env.webp`, `env_low.webp` | HDRI "Chinese Garden" (tonemapped JPG; lower 42% blurred because our own ground covers it) | Andreas Mischok | https://polyhaven.com/a/chinese_garden |
| `bed_diff.webp`, `bed_nor.webp` | Texture "Ganges River Pebbles" | Amal Kumar | https://polyhaven.com/a/ganges_river_pebbles |
| `grass_diff.webp`, `grass_nor.webp` | Texture "Leafy Grass" | Charlotte Baglioni | https://polyhaven.com/a/leafy_grass |
| `stone_diff.webp`, `stone_nor.webp` | Texture "Mossy Rock" | Rob Tuytel | https://polyhaven.com/a/mossy_rock |
| `wood_diff.webp`, `wood_nor.webp` | Texture "Hinoki Planks" | Charlotte Baglioni | https://polyhaven.com/a/hinoki_planks |
| `rocks.glb` | Model "Rock Moss Set 01" | Kless Gyzen | https://polyhaven.com/a/rock_moss_set_01 |
| `shrub.glb` | Model "Shrub 02" | Rico Cilliers | https://polyhaven.com/a/shrub_02 |
| `fern.glb` | Model "Fern 02" | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/fern_02 |

### koi-pond-garden — MIT
https://github.com/souranyp-stack/koi-pond-garden — Copyright (c) 2026 Sourany Phomhome.
v3 reuses the koi body outline tables `KOI_TOP/KOI_BOT/KOI_W` (the fins, patterns, swimming and everything else are new).

### Original to v3
Caustics (two-layer animated Worley edge web), water slope texture and ripple rings, underwater absorption, the koi skin and fin painters,
lily pad and Victoria pad painters, the taiko bridge, terrain, camera tilt rig and the painterly post filter (`?look=painted`, a rejected candidate).

---

## v2 and v1 (archived)


`koi-v1.html` (v1) and `koi-v2.html` (v2, built as `koi2.html`) are self-contained; the JS bundles were built with esbuild 0.24.0 and contain
the following permissively licensed work. Everything not listed here is original to this project.

## three.js 0.170.0 — MIT
https://github.com/mrdoob/three.js — Copyright © 2010-2026 three.js authors.
Used: core renderer, cameras, geometries, ShaderMaterial, render targets, `BufferGeometryUtils.mergeGeometries` (bundled, tree-shaken).

## koi-pond-garden — MIT
https://github.com/souranyp-stack/koi-pond-garden — Copyright (c) 2026 Sourany Phomhome.
Adapted into `koi2.js` (see `src/shaders2.js`, `src/koi2-src.js`):
- Preetham analytic sky + FBM cloud deck (`SKY_FN`), which that project adapted from three.js `examples/jsm/objects/Sky.js` (MIT).
- Koi body outline tables `KOI_TOP/KOI_BOT/KOI_W`, `crInterp`, `koiSection`, the fin layout grids (dorsal, caudal, anal, pectoral, pelvic) and variety palettes (`KOI_STYLES`).
- The lateral swimming-wave functions `koiA/koiLat/koiLatD`.
- Bridge layout proportions (arched stringers, planks, posts with caps, rails, balusters, piers) and the noise-displaced icosphere rock idea (`rockGeo`), simplified.

## Techniques reimplemented (no code copied)
- Area-ratio caustics (refract light rays through the rippled surface, project onto the bed, intensity = old area / new area
  via `dFdx/dFdy`): the classic approach popularised by Evan Wallace's WebGL Water demo (https://github.com/evanw/webgl-water).
  That repository ships no license file, so its code was **not** used; `CAUS_VS/CAUS_FS` are an original implementation.
- Height-field ripple simulation (neighbour average minus previous height, damping): textbook technique (Hugo Elias),
  original implementation.

## Considered and not used
- PavelDoGreat/WebGL-Fluid-Simulation (MIT): full Navier–Stokes fluid; more than a pond surface needs.
- Shadertoy caustic/water shaders: default license CC BY-NC-SA 3.0 — excluded.
- Godot Shaders "Water with Caustics" (CC0): Godot shading language; not ported.
