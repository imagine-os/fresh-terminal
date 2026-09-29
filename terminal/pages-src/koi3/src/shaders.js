// GLSL snippets for koi pond v3. All original to this project.
// Caustics: animated two-layer Worley edge web (F2 - F1), domain-warped.
// Water: normal from a tileable slope texture sampled at two scales plus analytic ripple rings.

export const NOISE_GLSL = /* glsl */ `
vec2 kHash22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float kWorleyEdge(vec2 p, float t){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = kHash22(i + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}
float kCaustics(vec2 p, float t){
  vec2 q = p * 1.35 + 0.28 * vec2(sin(p.y * 1.7 + t * 0.6), cos(p.x * 1.3 - t * 0.5));
  float a = kWorleyEdge(q, t * 0.9);
  float b = kWorleyEdge(q * 1.61 + vec2(3.1, 1.7), t * 1.15 + 2.0);
  float c = smoothstep(0.20, 0.0, a) * 0.75 + smoothstep(0.17, 0.0, b) * 0.55;
  return c * c * 1.4;
}
`;

// Injected into any material that can sit under the water surface.
export const UW_PARS_FRAG = /* glsl */ `
uniform float uTime;
uniform float uWaterY;
uniform vec3 uAbsorb;
uniform vec3 uDeep;
uniform float uCaus;
uniform vec3 uSunDir;
varying vec3 vUwPos;
${NOISE_GLSL}
`;

export const UW_CAUSTICS = /* glsl */ `
#include <lights_fragment_end>
{
  float uwD = uWaterY - vUwPos.y;
  if (uwD > 0.0 && uCaus > 0.0) {
    // project along the sun direction to the surface so caustics slide with light
    vec2 sp = vUwPos.xz + uSunDir.xz / max(0.25, uSunDir.y) * uwD;
    float c = kCaustics(sp * 1.1, uTime * 0.8);
    float fade = smoothstep(0.0, 0.06, uwD) * exp(-uwD * 0.9);
    reflectedLight.directDiffuse *= 1.0 + (c * 2.6 - 0.35) * fade * uCaus;
  }
}
`;

export const UW_ABSORB = /* glsl */ `
#include <opaque_fragment>
{
  float uwD = uWaterY - vUwPos.y;
  if (uwD > 0.0) {
    vec3 vd = normalize(vUwPos - cameraPosition);
    float L = uwD * (1.0 + 1.0 / max(0.18, abs(vd.y)));
    vec3 T = exp(-uAbsorb * L);
    gl_FragColor.rgb = gl_FragColor.rgb * T + uDeep * (1.0 - T);
  }
}
`;

export const UW_VERT_PARS = /* glsl */ `
varying vec3 vUwPos;
`;

export const UW_VERT = /* glsl */ `
#include <project_vertex>
{
  vec4 uwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  uwp = instanceMatrix * uwp;
  #endif
  vUwPos = (modelMatrix * uwp).xyz;
}
`;

// Koi swimming bend. Local fish space: +X forward, nose at x = uLen * 0.5.
export const KOI_BEND_PARS = /* glsl */ `
uniform float uLen;
uniform float uPhase;
uniform float uAmp;
uniform float uCurv;
`;
export const KOI_BEND = /* glsl */ `
#include <begin_vertex>
{
  float sx = clamp((uLen * 0.5 - transformed.x) / uLen, 0.0, 1.4);
  float lat = uAmp * uLen * (0.02 + 0.16 * sx * sx) * sin(uPhase - 5.2 * sx);
  float bend = uCurv * (sx * uLen) * (sx * uLen);
  transformed.z += lat + bend;
}
`;

// Water surface normal (world), replaces the normal map chunk of a physical material.
export const WATER_PARS = /* glsl */ `
uniform float uTime;
uniform sampler2D uSlope;
uniform vec4 uRip[12];
uniform float uChop;
uniform sampler2D uRefl;
uniform mat4 uReflMat;
uniform float uReflOn;
varying vec3 vWPos;
vec2 kSl;
`;
export const WATER_NORMAL = /* glsl */ `
{
  vec2 p = vWPos.xz;
  vec2 s1 = texture2D(uSlope, p * 0.23 + uTime * vec2(0.011, 0.007)).xy * 2.0 - 1.0;
  vec2 s2 = texture2D(uSlope, p * 0.61 + uTime * vec2(-0.013, 0.017)).xy * 2.0 - 1.0;
  vec2 s3 = texture2D(uSlope, p * 1.9 + uTime * vec2(0.03, -0.021)).xy * 2.0 - 1.0;
  vec2 sl = (s1 * 0.55 + s2 * 0.35 + s3 * 0.12) * uChop;
  for (int i = 0; i < 12; i++) {
    vec4 r = uRip[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 d = p - r.xy;
    float dist = length(d) + 1e-4;
    float R = age * 0.55;
    float x = dist - R;
    float env = exp(-x * x * 18.0) * exp(-age * 0.75) * r.w;
    sl += (d / dist) * env * sin(x * 34.0) * 0.55;
  }
  kSl = sl;
  vec3 nW = normalize(vec3(-sl.x, 1.0, -sl.y));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}
`;
// Planar reflection of the bridge, banks and rocks (mirrored render), mixed over the environment reflection.
export const WATER_REFL = /* glsl */ `
#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
if (uReflOn > 0.5) {
  vec4 rc = uReflMat * vec4(vWPos, 1.0);
  vec2 ruv = rc.xy / rc.w + kSl * 0.35;
  vec4 pr = texture2D(uRefl, ruv);
  radiance = mix(radiance, pr.rgb, pr.a);
}
#endif
`;
export const WATER_VERT_PARS = /* glsl */ `
varying vec3 vWPos;
`;
export const WATER_VERT = /* glsl */ `
#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

// Painterly post: 4-sector Kuwahara + paper grain + soft edge ink. Used by ?look=painted.
export const POST_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const PAINT_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uRadius;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  const int R = 3;
  for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
    vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px * uRadius).rgb;
    vec3 c2 = c * c;
    if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
    if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
    if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
    if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
  }
  float n = float((R + 1) * (R + 1));
  vec3 best = vec3(0.0); float bestV = 1e9;
  for (int k = 0; k < 4; k++) {
    vec3 mu = m[k] / n; vec3 v = abs(s[k] / n - mu * mu);
    float vv = v.r + v.g + v.b;
    if (vv < bestV) { bestV = vv; best = mu; }
  }
  // paper grain and gentle pigment pooling
  float g = vn(gl_FragCoord.xy * 0.35) * 0.5 + vn(gl_FragCoord.xy * 0.09) * 0.5;
  vec3 col = best * (0.93 + 0.1 * g);
  col = mix(col, col * col * 1.25, 0.18);
  vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
