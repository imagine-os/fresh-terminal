<!-- Copied into the app in pass 4: koi2.html is served as pages/koi.html (v2) and the original koi.html as pages/koi-v1.html (v1). -->

# Koi Pond Terminal — third-party notices

Both `koi.html` (v1) and `koi2.html` (v2) are self-contained; the JS bundles were built with esbuild 0.24.0 and contain
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
