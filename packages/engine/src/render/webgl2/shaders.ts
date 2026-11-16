export function vertexShaderSource(maxJoints: number): string { return `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_model0;
layout(location = 2) in vec4 a_model1;
layout(location = 3) in vec4 a_model2;
layout(location = 4) in vec4 a_model3;
layout(location = 5) in vec3 a_normal;
layout(location = 6) in vec2 a_uv;
layout(location = 7) in uvec4 a_joints;
layout(location = 8) in vec4 a_weights;
layout(location = 9) in vec3 a_morph0;
layout(location = 10) in vec3 a_morph1;
layout(location = 11) in vec3 a_morph2;
layout(location = 12) in vec3 a_morph3;
layout(location = 13) in vec4 a_instanceColor;
layout(location = 14) in vec4 a_instanceUv;
layout(location = 15) in vec3 a_edgeCoordinates;
uniform bool u_instanceAppearanceEnabled;

uniform mat4 u_viewProjection;
uniform mat4 u_shadowViewProjection;
uniform bool u_skinningEnabled;
uniform mat4 u_jointPalette[${maxJoints}];
uniform vec4 u_morphWeights;
uniform bool u_outlinePass;
uniform float u_outlineWidth;
out vec3 v_normal;
out vec3 v_edgeCoordinates;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec4 v_instanceColor;
out vec4 v_shadowPosition;

void main() {
  mat4 model = mat4(a_model0, a_model1, a_model2, a_model3);
  vec3 morphedPosition = a_position + a_morph0 * u_morphWeights.x + a_morph1 * u_morphWeights.y + a_morph2 * u_morphWeights.z + a_morph3 * u_morphWeights.w;
  vec4 localPosition = vec4(morphedPosition, 1.0);
  vec3 localNormal = a_normal;
  if (u_skinningEnabled) {
    mat4 skin = a_weights.x * u_jointPalette[int(a_joints.x)]
      + a_weights.y * u_jointPalette[int(a_joints.y)]
      + a_weights.z * u_jointPalette[int(a_joints.z)]
      + a_weights.w * u_jointPalette[int(a_joints.w)];
    localPosition = skin * localPosition;
    localNormal = mat3(skin) * localNormal;
  }
  vec4 worldPosition = model * localPosition;
  vec3 worldNormal = transpose(inverse(mat3(model))) * localNormal;
  v_normal = worldNormal;
  v_edgeCoordinates = a_edgeCoordinates;
  v_worldPosition = worldPosition.xyz;
  v_uv = u_instanceAppearanceEnabled ? a_uv * a_instanceUv.zw + a_instanceUv.xy : a_uv;
  v_instanceColor = u_instanceAppearanceEnabled ? a_instanceColor : vec4(1.0);
  v_shadowPosition = u_shadowViewProjection * worldPosition;
  vec4 clipPosition = u_viewProjection * worldPosition;
  if (u_outlinePass) {
    vec2 clipNormal = (u_viewProjection * vec4(normalize(worldNormal), 0.0)).xy;
    float clipNormalLength = length(clipNormal);
    if (clipNormalLength > 0.00001) clipPosition.xy += clipNormal / clipNormalLength * u_outlineWidth * clipPosition.w;
  }
  gl_Position = clipPosition;
}`; }

export function shadowVertexShaderSource(maxJoints: number): string { return `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 a_position;
layout(location=1) in vec4 a_model0; layout(location=2) in vec4 a_model1; layout(location=3) in vec4 a_model2; layout(location=4) in vec4 a_model3;
layout(location=7) in uvec4 a_joints; layout(location=8) in vec4 a_weights;
layout(location=9) in vec3 a_morph0; layout(location=10) in vec3 a_morph1; layout(location=11) in vec3 a_morph2; layout(location=12) in vec3 a_morph3;
uniform mat4 u_shadowViewProjection; uniform bool u_skinningEnabled; uniform mat4 u_jointPalette[${maxJoints}]; uniform vec4 u_morphWeights;
void main(){
  mat4 model=mat4(a_model0,a_model1,a_model2,a_model3);
  vec4 local=vec4(a_position+a_morph0*u_morphWeights.x+a_morph1*u_morphWeights.y+a_morph2*u_morphWeights.z+a_morph3*u_morphWeights.w,1.0);
  if(u_skinningEnabled){mat4 skin=a_weights.x*u_jointPalette[int(a_joints.x)]+a_weights.y*u_jointPalette[int(a_joints.y)]+a_weights.z*u_jointPalette[int(a_joints.z)]+a_weights.w*u_jointPalette[int(a_joints.w)];local=skin*local;}
  gl_Position=u_shadowViewProjection*model*local;
}`; }
export const SHADOW_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
uniform float u_shadowOpacity;
void main(){
  // Ordered coverage fades depth along with the visible material, without a new shadow map.
  const int coverage[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
  int index = int(mod(gl_FragCoord.x,4.0)) + int(mod(gl_FragCoord.y,4.0)) * 4;
  float threshold = (float(coverage[index]) + 0.5) / 16.0;
  if (u_shadowOpacity <= threshold) discard;
}
`;

export const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

uniform vec4 u_baseColor;
uniform vec3 u_emissive;
uniform float u_metallic;
uniform float u_roughness;
uniform vec4 u_uvTransform;
uniform float u_uvRotation;
uniform int u_shaderStyle;
uniform bool u_cutaway;
uniform float u_toonBands;
uniform vec3 u_toonShadowColor;
uniform vec3 u_toonRimColor;
uniform float u_toonRimStrength;
uniform bool u_outlinePass;
uniform vec4 u_outlineColor;
uniform float u_alphaCutoff;
uniform bool u_useTexture;
uniform bool u_lit;
uniform sampler2D u_baseColorTexture;
uniform sampler2D u_metallicRoughnessTexture;
uniform sampler2D u_normalTexture;
uniform sampler2D u_occlusionTexture;
uniform sampler2D u_emissiveTexture;
uniform vec4 u_textureMapFlags;
uniform vec3 u_ambientColor;
uniform vec3 u_directionalDirection0;
uniform vec3 u_directionalColor0;
uniform vec3 u_directionalDirection1;
uniform vec3 u_directionalColor1;
uniform int u_directionalCount;
uniform int u_pointCount;
uniform vec4 u_pointPositions[8];
uniform vec3 u_pointColors[8];
uniform vec3 u_cameraPosition;
uniform bool u_shadowEnabled;
uniform mat4 u_shadowViewProjection;
uniform sampler2DShadow u_shadowMap;
uniform float u_shadowBias;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec3 v_edgeCoordinates;
in vec2 v_uv;
in vec4 v_instanceColor;
in vec4 v_shadowPosition;
out vec4 outColor;

vec3 directionalContribution(vec3 normal, vec3 viewDirection, vec3 surfaceColor, float metallic, float roughness, vec3 sourceDirection, vec3 sourceColor, float visibility) {
  const float PI = 3.14159265359;
  vec3 lightDirection = length(sourceDirection) > 0.00001 ? normalize(-sourceDirection) : vec3(0.0, 1.0, 0.0);
  vec3 halfwayDelta = viewDirection + lightDirection;
  vec3 halfway = length(halfwayDelta) > 0.00001 ? normalize(halfwayDelta) : normal;
  float nDotL = max(dot(normal, lightDirection), 0.0);
  float nDotV = max(dot(normal, viewDirection), 0.0001);
  float nDotH = max(dot(normal, halfway), 0.0);
  float vDotH = max(dot(viewDirection, halfway), 0.0);
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  float distribution = alpha2 / max(PI * denominator * denominator, 0.0001);
  float geometryK = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float geometryV = nDotV / (nDotV * (1.0 - geometryK) + geometryK);
  float geometryL = nDotL / (nDotL * (1.0 - geometryK) + geometryK);
  vec3 f0 = mix(vec3(0.04), surfaceColor, metallic);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
  vec3 specular = distribution * geometryV * geometryL * fresnel / max(4.0 * nDotV * max(nDotL, 0.0001), 0.0001);
  vec3 diffuse = (1.0 - fresnel) * (1.0 - metallic) * surfaceColor / PI;
  if (u_shaderStyle == 1) {
    float bandCount = max(2.0, u_toonBands);
    float level = floor(min(0.99999, nDotL * visibility) * bandCount) / (bandCount - 1.0);
    vec3 celDiffuse = mix(surfaceColor * u_toonShadowColor, surfaceColor, level);
    float rim = pow(1.0 - nDotV, 3.0) * u_toonRimStrength;
    return (celDiffuse * (0.32 + level * 0.68) + u_toonRimColor * rim) * sourceColor / PI;
  }
  return (diffuse + specular) * sourceColor * nDotL * visibility;
}

void main() {
  vec2 centeredUv = v_uv * u_uvTransform.zw;
  float cosine = cos(u_uvRotation), sine = sin(u_uvRotation);
  vec2 uv = mat2(cosine, -sine, sine, cosine) * centeredUv + u_uvTransform.xy;
  vec4 surface = u_baseColor * v_instanceColor;
  if (u_useTexture) surface *= texture(u_baseColorTexture, uv);
  if (u_alphaCutoff >= 0.0 && surface.a < u_alphaCutoff) discard;
  if (u_outlinePass) { outColor = vec4(u_outlineColor.rgb, u_outlineColor.a * surface.a); return; }
  if (u_cutaway) {
    vec3 pixels = v_edgeCoordinates / max(fwidth(v_edgeCoordinates), vec3(0.000001));
    float edge = 1.0 - smoothstep(0.65, 1.65, min(pixels.x, min(pixels.y, pixels.z)));
    // Thin, subdued edges replace the faded fill. No depth mask or extra draw pass.
    float fill = smoothstep(0.42, 0.95, surface.a);
    float alpha = max(fill, edge * 0.32);
    if (alpha < 0.001) discard;
    if (fill < 0.001) { outColor = vec4(mix(surface.rgb, vec3(0.6), 0.5), alpha); return; }
    surface.a = alpha;
  }
  vec3 color = surface.rgb;
  if (u_lit) {
    vec3 normal = length(v_normal) > 0.00001 ? normalize(v_normal) : vec3(0.0, 1.0, 0.0);
    if (u_textureMapFlags.y > 0.5) {
      vec3 mapped = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
      vec3 positionX = dFdx(v_worldPosition), positionY = dFdy(v_worldPosition);
      vec2 uvX = dFdx(uv), uvY = dFdy(uv);
      vec3 tangent = normalize(positionX * uvY.y - positionY * uvX.y);
      vec3 bitangent = normalize(-positionX * uvY.x + positionY * uvX.x);
      normal = normalize(mat3(tangent, bitangent, normal) * mapped);
    }
    vec3 viewDelta = u_cameraPosition - v_worldPosition;
    vec3 viewDirection = length(viewDelta) > 0.00001 ? normalize(viewDelta) : vec3(0.0, 0.0, 1.0);
    vec4 metallicRoughnessSample = u_textureMapFlags.x > 0.5 ? texture(u_metallicRoughnessTexture, uv) : vec4(1.0);
    float metallic = clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0);
    float roughness = clamp(u_roughness * metallicRoughnessSample.g, 0.045, 1.0);
    float visibility = 1.0;
    if (u_shadowEnabled) {
      vec3 projected = v_shadowPosition.xyz / max(v_shadowPosition.w, 0.00001) * 0.5 + 0.5;
      if (projected.x >= 0.0 && projected.x <= 1.0 && projected.y >= 0.0 && projected.y <= 1.0 && projected.z >= 0.0 && projected.z <= 1.0) {
        // Four hardware-filtered comparisons soften texel steps without detaching contact shadows.
        vec2 texel = 0.65 / vec2(textureSize(u_shadowMap, 0));
        float depth = projected.z - u_shadowBias;
        visibility = 0.25 * (
          texture(u_shadowMap, vec3(projected.xy + vec2(-texel.x, -texel.y), depth)) +
          texture(u_shadowMap, vec3(projected.xy + vec2(texel.x, -texel.y), depth)) +
          texture(u_shadowMap, vec3(projected.xy + vec2(-texel.x, texel.y), depth)) +
          texture(u_shadowMap, vec3(projected.xy + vec2(texel.x, texel.y), depth)));
      }
    }
    float occlusion = u_textureMapFlags.z > 0.5 ? texture(u_occlusionTexture, uv).r : 1.0;
    color = surface.rgb * u_ambientColor * occlusion;
    if (u_directionalCount > 0) color += directionalContribution(normal, viewDirection, surface.rgb, metallic, roughness, u_directionalDirection0, u_directionalColor0, visibility);
    if (u_directionalCount > 1) color += directionalContribution(normal, viewDirection, surface.rgb, metallic, roughness, u_directionalDirection1, u_directionalColor1, 1.0);
    for (int light = 0; light < 8; light++) {
      if (light >= u_pointCount) break;
      vec3 delta = v_worldPosition - u_pointPositions[light].xyz;
      float range = max(u_pointPositions[light].w, 0.0001);
      float attenuation = pow(max(0.0, 1.0 - length(delta) / range), 2.0);
      if (attenuation > 0.0) color += directionalContribution(normal, viewDirection, surface.rgb, metallic, roughness, delta, u_pointColors[light] * attenuation, 1.0);
    }
  }
  vec3 emissive = u_emissive * (u_textureMapFlags.w > 0.5 ? texture(u_emissiveTexture, uv).rgb : vec3(1.0));
  if (u_shaderStyle == 2) color = floor(color * 16.0 + mod(gl_FragCoord.x + gl_FragCoord.y, 2.0) * 0.35) / 16.0;
  if (u_shaderStyle == 3) { float scan = 0.72 + 0.28 * sin(gl_FragCoord.y * 0.45); color = mix(color, emissive + surface.rgb, 0.68) * scan; }
  outColor = vec4(color + emissive, surface.a);
}`;
