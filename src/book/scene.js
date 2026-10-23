import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  VSMShadowMap,
  WebGLRenderer,
} from 'three';
import { DIM } from './layout.js';

const TAN = Math.tan((12 * Math.PI) / 180); // half of the 24° fov
const TILT = (9 * Math.PI) / 180;

// The original's studio: a dim gradient dome and three soft boxes, which give
// the steel and PVC their crisp highlights. It is modelled z-up like the original.
function studio() {
  const rig = new Group();
  const dome = new SphereGeometry(10, 48, 24);
  const { position } = dome.attributes;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = position.getZ(i) / 10;
    const v = t > 0 ? 0.16 + 0.1 * t : 0.16 * (1 + t) + 0.03;
    colors.set([v, v * 1.01, v * 1.04], i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  rig.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  for (const [w, h, dir, v] of [
    [5.2, 3.6, [-0.5, 0.45, 0.74], 7],
    [1.2, 6, [0.85, -0.15, 0.5], 2.2],
    [7, 1.2, [0.1, -0.9, 0.42], 0.9],
  ]) {
    const box = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(v, v, v * 0.98), side: DoubleSide }));
    box.position.set(...dir).normalize().multiplyScalar(8);
    box.lookAt(0, 0, 0);
    rig.add(box);
  }
  rig.rotation.x = -Math.PI / 2; // z-up to y-up, applied after lookAt
  return new Scene().add(rig);
}

// Ground shadow that fades out within 16 mm of the open book's footprint, like the original.
function groundMaterial(halfWidth) {
  const material = new ShadowMaterial({ opacity: 0.16 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec2 vGround;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvGround = position.xz;',
    )}`;
    shader.fragmentShader = `varying vec2 vGround;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `vec2 outside = max(abs(vGround) - vec2(${halfWidth.toFixed(2)}, ${(DIM.H / 2).toFixed(2)}), 0.0);
      gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( 0.0, 16.0, length( outside ) ) ) );`,
    )}`;
  };
  return material;
}

export function createStage(container, halfWidth, insets) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    throw new Error('webgl');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.domElement.className = 'ab-gl';
  container.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#f7f9fb');
  const pmrem = new PMREMGenerator(renderer);
  const env = studio();
  const envMap = pmrem.fromScene(env, 0.02);
  env.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.6;

  const small = Math.min(screen.width, screen.height) < 600;
  const sun = new DirectionalLight(0xffffff, 1.35);
  sun.position.set(-290, 420, -75);
  sun.castShadow = true;
  const { shadow } = sun;
  shadow.mapSize.setScalar(small ? 1024 : 2048);
  shadow.radius = small ? 8 : 14;
  shadow.blurSamples = small ? 10 : 16;
  shadow.intensity = 0.7;
  shadow.bias = -8e-4;
  shadow.normalBias = 1.5;
  Object.assign(shadow.camera, { left: -(halfWidth + 50), right: halfWidth + 50, top: 220, bottom: -220, near: 100, far: 1000 });
  shadow.camera.up.set(0, 0, -1); // keep the shadow frustum's width along x
  scene.add(sun, sun.target, new HemisphereLight(0xffffff, 0xd9dee2, 0.18));

  const ground = new Mesh(new PlaneGeometry(1600, 1000).rotateX(-Math.PI / 2), groundMaterial(halfWidth));
  ground.position.y = -(DIM.CT + DIM.drop + 0.02);
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new PerspectiveCamera(24, 1, 50, 4000);
  let width = 1;
  let height = 1;

  return {
    scene,
    camera,
    renderer,
    resize() {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
    },
    // Centre the view on x between the top and bottom bars (spec §11).
    frame(x, zoom) {
      const band = Math.max(0.3, (height - insets.top - insets.bottom) / height);
      const s = Math.max((halfWidth + 12) / (TAN * (width / height)), (DIM.H + 30) / 2 / (TAN * band)) * zoom;
      camera.position.set(x, 4 + s * Math.cos(TILT), s * Math.sin(TILT));
      camera.lookAt(x, 4, 0);
      camera.setViewOffset(width, height, 0, (insets.bottom - insets.top) / 2, width, height);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      envMap.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      // Free the GL context now; browsers cap how many can stay alive.
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
