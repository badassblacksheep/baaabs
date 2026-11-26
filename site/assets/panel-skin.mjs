// Compact viewers sample the same repeat tile embedded in the full glTF material.
export async function loadPanelSkin(gl, program, unit, current = () => true) {
  const configURL = new URL('panel-skin.json', import.meta.url);
  const response = await fetch(configURL);
  if (!response.ok) throw Error('Could not load the panel material configuration');
  const spec = await response.json();
  const image = new Image();
  image.src = new URL(spec.texture, configURL);
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
}

export const panelFragment = `
uniform sampler2D panelMap;
uniform float panelCutoff;
vec3 steelColor(vec2 uv, vec3 light) {
  vec4 sheet = texture2D(panelMap, uv);
  if (sheet.a < panelCutoff) discard;
  return sheet.rgb * light;
}`;
