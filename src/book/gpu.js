// WebGL drawn on the CPU (no usable GPU, e.g. in many virtual machines) gets a lighter book.
let software;

export function softwareWebGL() {
  if (software !== undefined) return software;
  software = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    if (debug) software = /swiftshader|llvmpipe|softpipe|basic render|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {}
  return software;
}
