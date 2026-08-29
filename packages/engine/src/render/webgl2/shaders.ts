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

uniform mat4 u_viewProjection;
uniform mat4 u_shadowViewProjection;
uniform bool u_skinningEnabled;
uniform mat4 u_jointPalette[${maxJoints}];
uniform vec4 u_morphWeights;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec2 v_uv;
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
  v_normal = transpose(inverse(mat3(model))) * localNormal;
  v_worldPosition = worldPosition.xyz;
  v_uv = a_uv;
  v_shadowPosition = u_shadowViewProjection * worldPosition;
  gl_Position = u_viewProjection * worldPosition;
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
void main(){}
`;

export const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

uniform vec4 u_baseColor;
uniform vec3 u_emissive;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_alphaCutoff;
uniform bool u_useTexture;
uniform bool u_lit;
uniform sampler2D u_baseColorTexture;
uniform vec3 u_ambientColor;
uniform vec3 u_directionalDirection;
uniform vec3 u_directionalColor;
uniform vec3 u_cameraPosition;
uniform bool u_shadowEnabled;
uniform mat4 u_shadowViewProjection;
uniform sampler2DShadow u_shadowMap;
uniform float u_shadowBias;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_shadowPosition;
out vec4 outColor;

void main() {
  vec4 surface = u_baseColor;
  if (u_useTexture) surface *= texture(u_baseColorTexture, v_uv);
  if (u_alphaCutoff >= 0.0 && surface.a < u_alphaCutoff) discard;
  vec3 color = surface.rgb;
  if (u_lit) {
    const float PI = 3.14159265359;
    vec3 normal = length(v_normal) > 0.00001 ? normalize(v_normal) : vec3(0.0, 1.0, 0.0);
    vec3 viewDelta = u_cameraPosition - v_worldPosition;
    vec3 viewDirection = length(viewDelta) > 0.00001 ? normalize(viewDelta) : vec3(0.0, 0.0, 1.0);
    vec3 lightDirection = length(u_directionalDirection) > 0.00001 ? normalize(-u_directionalDirection) : vec3(0.0, 1.0, 0.0);
    vec3 halfwayDelta = viewDirection + lightDirection;
    vec3 halfway = length(halfwayDelta) > 0.00001 ? normalize(halfwayDelta) : normal;
    float nDotL = max(dot(normal, lightDirection), 0.0);
    float nDotV = max(dot(normal, viewDirection), 0.0001);
    float nDotH = max(dot(normal, halfway), 0.0);
    float vDotH = max(dot(viewDirection, halfway), 0.0);
    float roughness = clamp(u_roughness, 0.045, 1.0);
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
    float distribution = alpha2 / max(PI * denominator * denominator, 0.0001);
    float geometryK = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float geometryV = nDotV / (nDotV * (1.0 - geometryK) + geometryK);
    float geometryL = nDotL / (nDotL * (1.0 - geometryK) + geometryK);
    vec3 f0 = mix(vec3(0.04), surface.rgb, u_metallic);
    vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
    vec3 specular = distribution * geometryV * geometryL * fresnel / max(4.0 * nDotV * max(nDotL, 0.0001), 0.0001);
    vec3 diffuse = (1.0 - fresnel) * (1.0 - u_metallic) * surface.rgb / PI;
    float visibility = 1.0;
    if (u_shadowEnabled) {
      vec3 projected = v_shadowPosition.xyz / max(v_shadowPosition.w, 0.00001) * 0.5 + 0.5;
      if (projected.x >= 0.0 && projected.x <= 1.0 && projected.y >= 0.0 && projected.y <= 1.0 && projected.z >= 0.0 && projected.z <= 1.0) visibility = texture(u_shadowMap, vec3(projected.xy, projected.z - u_shadowBias));
    }
    color = surface.rgb * u_ambientColor + (diffuse + specular) * u_directionalColor * nDotL * visibility;
  }
  outColor = vec4(color + u_emissive, surface.a);
}`;
