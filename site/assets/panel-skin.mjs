// Compact viewers sample the same repeat tile embedded in the full glTF material.
export async function loadPanelSkin(gl, program, unit, current = () => true) {
  const configURL = new URL('panel-skin.json', import.meta.url);
  configURL.search = new URL(import.meta.url).search;
  const response = await fetch(configURL);
  if (!response.ok) throw Error('Could not load the panel material configuration');
  const spec = await response.json();
  const image = new Image();
  const tileURL = new URL(spec.texture, configURL);
  tileURL.search = configURL.search;
  image.src = tileURL;
  await image.decode();
  if (!current() || gl.isContextLost()) return;
  const active = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.activeTexture(active);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'panelMap'), unit);
  gl.uniform1f(gl.getUniformLocation(program, 'panelCutoff'), spec.alphaCutoff);
  gl.uniform2f(gl.getUniformLocation(program, 'panelViewRange'),
               spec.viewHeightMeters.fullPerforations, spec.viewHeightMeters.opaquePanels);
  gl.uniform3fv(gl.getUniformLocation(program, 'panelBaseColor'), spec.baseColorFactor.slice(0, 3));
}

export const panelFragment = `
uniform sampler2D panelMap;
uniform float panelCutoff;
uniform vec3 panelBaseColor;
uniform vec2 panelViewRange;
varying float panelViewHeight;
vec3 steelColor(vec2 uv, vec3 light) {
  float detail = 1. - smoothstep(panelViewRange.x, panelViewRange.y, panelViewHeight);
  vec4 sheet = texture2D(panelMap, uv);
  if (sheet.a < detail * panelCutoff) discard;
  vec3 distant = texture2D(panelMap, uv, 12.).rgb;
  return mix(distant, sheet.rgb, detail) * pow(panelBaseColor * light, vec3(1./2.2));
}`;
