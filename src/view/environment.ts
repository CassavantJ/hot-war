import * as THREE from 'three';

/**
 * What polished metal and glass reflect: a hazy sky, a warm low sun, a pair of studio
 * softboxes for crisp highlights along edges, and dark earth below the horizon. Rendered once
 * into a prefiltered environment map.
 */
export function battlefieldEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize( position );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        varying vec3 vDirection;
        void main() {
          float y = vDirection.y;
          vec3 zenith = vec3( 0.30, 0.46, 0.72 );
          vec3 horizon = vec3( 0.92, 0.90, 0.84 );
          vec3 ground = vec3( 0.20, 0.17, 0.12 );
          vec3 deep = vec3( 0.07, 0.06, 0.05 );
          vec3 color = y > 0.0
            ? mix( horizon, zenith, pow( y, 0.55 ) )
            : mix( ground, deep, pow( -y, 0.6 ) );
          // A bright band right at the horizon, as on chrome.
          color += vec3( 0.35, 0.33, 0.28 ) * exp( -abs( y ) * 28.0 );
          gl_FragColor = vec4( color, 1.0 );
        }`,
    }),
  );
  scene.add(sky);
  const glow = (color: THREE.ColorRepresentation, strength: number) => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(strength);
    return material;
  };
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), glow('#fff2d8', 40));
  sun.position.set(-26, 30, 14);
  scene.add(sun);
  for (const [x, y, z, w, h] of [
    [30, 14, -10, 26, 6],
    [-8, 18, 32, 20, 5],
  ] as const) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow('#ffffff', 3.2));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const texture = generator.fromScene(scene, 0.02).texture;
  generator.dispose();
  sky.geometry.dispose();
  (sky.material as THREE.Material).dispose();
  return texture;
}
