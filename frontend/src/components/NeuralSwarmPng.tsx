/**
 * NeuralSwarmPng — Renders the neural cortex particle brain as a static square PNG.
 *
 * Uses an offscreen Three.js renderer to generate the image once on mount,
 * then displays it as a plain &lt;img&gt; tag. Zero ongoing GPU cost after the
 * initial capture. Module-level cache ensures each size is rendered only once.
 */
import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer, RenderPass, UnrealBloomPass } from 'three-stdlib';

/* ── Module-level PNG cache (persists across mounts) ── */
const pngCache: Record<string, string> = {};

function generateBrainPng(size: 'small' | 'large'): string {
  if (pngCache[size]) return pngCache[size];

  const isSmall = size === 'small';
  const dim = isSmall ? 256 : 512;
  const count = isSmall ? 4000 : 10000;
  const baseRadius = isSmall ? 48 : 64;
  const cameraZ = isSmall ? 120 : 100;
  const pr = 2; // pixel-ratio for retina sharpness

  /* ── Offscreen renderer ── */
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(dim, dim);
  renderer.setPixelRatio(pr);

  /* ── Scene + camera ── */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 0.01, 1000);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, cameraZ);
  camera.lookAt(0, 0, 0);

  /* ── Build instanced brain particles ── */
  const geometry = new THREE.TetrahedronGeometry(0.25);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const pColor = new THREE.Color();
  const P = { radius: baseRadius, fold: 8, pulse: 3.2, swirl: 1.4, jitter: 0.8 };

  /* Frozen at t = 0.75 (speed 0.5 × 1.5 s) for a nicely-formed brain shape */
  const t = 0.75;

  for (let i = 0; i < count; i++) {
    const n = i / count;
    const ga = 2.399963229728653; // golden angle
    const y = 1 - 2 * n;
    const rr = Math.sqrt(1 - y * y);
    const a = i * ga;

    const sx = Math.cos(a) * rr;
    const sz = Math.sin(a) * rr;
    const hemi = sx < 0 ? -1 : 1;
    const midGap = 1 - 0.22 * Math.exp(-sx * sx * 18);

    const phi = Math.atan2(sz, sx);
    const gyri1 = Math.sin(phi * 6 + y * 7 + t * 0.25);
    const gyri2 = Math.sin(phi * 13 - y * 11 - t * 0.18);
    const gyri3 = Math.sin((sx + sz) * 9 + t * 0.33);
    const cortical =
      1 + (0.11 * P.fold * (0.45 * gyri1 + 0.35 * gyri2 + 0.2 * gyri3)) / 8;

    const frontBack = 0.86 + 0.2 * Math.abs(sz);
    const topBottom = 0.82 + 0.3 * (1 - y * y);
    const lobeBias = 1 + 0.08 * hemi * Math.sin(phi * 2.5 + t * 0.12);

    const shell = P.radius * cortical * midGap;
    let x = sx * shell * frontBack * lobeBias;
    let yy = y * shell * topBottom;
    let z = sz * shell * 1.08;

    const inner = Math.sin(n * 80 + t * 1.7 + Math.abs(y) * 9 + phi * 3);
    const axon = Math.sin(
      (x * 0.07 + z * 0.09) * P.swirl - t * (1.2 + P.pulse * 0.15) + n * 30,
    );
    const spark = Math.max(
      0,
      Math.sin(n * 240 - t * (6 + P.pulse * 2.4) + gyri2 * 1.7 + phi * 5),
    );
    const spark2 = Math.max(
      0,
      Math.sin(n * 140 + t * (4.5 + P.pulse * 1.4) + gyri1 * 2.1 - y * 8),
    );
    const fire = Math.pow(0.65 * spark + 0.35 * spark2, 2.2);

    const drift = 1 + 0.035 * axon + 0.02 * inner;
    x +=
      sx * fire * P.pulse * 5.5 * drift +
      Math.sin(a * 1.7 + t * 3.1) * P.jitter * 0.18;
    yy +=
      y * fire * P.pulse * 4.2 * drift +
      Math.cos(a * 1.3 - t * 2.7) * P.jitter * 0.18;
    z +=
      sz * fire * P.pulse * 5.8 * drift +
      Math.sin(a * 1.1 + t * 2.9) * P.jitter * 0.18;

    const bridge = Math.exp(-Math.abs(sx) * 8) * (1 - Math.abs(y)) * 8;
    x *= 1 - bridge * 0.035;
    z += hemi * bridge * Math.sin(t * 1.4 + n * 40) * 0.4;

    /* HSL color */
    const h = 0.62 - 0.18 * fire + 0.04 * Math.sin(phi * 2 + t * 0.2);
    const s = 0.75 + 0.25 * fire;
    const l = 0.2 + 0.22 * (0.5 + 0.5 * inner) + 0.45 * fire;
    pColor.setHSL(h, s, l);

    dummy.position.set(x, yy, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, pColor);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  /* ── Post-processing: Unreal Bloom ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(dim * pr, dim * pr), 1.8, 0.4, 0),
  );
  composer.render();

  /* ── Capture PNG data URL ── */
  const dataUrl = renderer.domElement.toDataURL('image/png');

  /* ── Cleanup GPU resources ── */
  geometry.dispose();
  material.dispose();
  mesh.dispose();
  renderer.dispose();

  pngCache[size] = dataUrl;
  return dataUrl;
}

/* ═══ Exported component ═══ */

interface NeuralSwarmPngProps {
  className?: string;
  /** 'small' = card decoration, 'large' = timer box */
  size?: 'small' | 'large';
}

const NeuralSwarmPng: React.FC<NeuralSwarmPngProps> = ({
  className = '',
  size = 'small',
}) => {
  const [src, setSrc] = useState<string | null>(pngCache[size] || null);

  useEffect(() => {
    if (pngCache[size]) {
      setSrc(pngCache[size]);
      return;
    }
    /* Defer to next frame so first paint isn't blocked */
    const id = requestAnimationFrame(() => {
      try {
        setSrc(generateBrainPng(size));
      } catch (e) {
        console.warn('NeuralSwarmPng: render failed', e);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [size]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      className={`aspect-square object-contain ${className}`}
      draggable={false}
    />
  );
};

export default NeuralSwarmPng;
