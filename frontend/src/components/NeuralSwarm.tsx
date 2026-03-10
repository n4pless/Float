/**
 * NeuralSwarm — 3D particle neural cortex animation using React Three Fiber.
 *
 * Renders a folded cerebral swarm with cortical gyri, hemispheric separation,
 * and traveling electrochemical spike pulses. Used as a decorative element
 * in prediction cards and page header.
 */
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { OrbitControls, Effects } from '@react-three/drei';
import { UnrealBloomPass } from 'three-stdlib';
import * as THREE from 'three';

extend({ UnrealBloomPass });

interface SwarmProps {
  /** Particle count — lower for small card sizes */
  count?: number;
  /** Animation speed multiplier */
  speed?: number;
  /** Brain radius */
  radius?: number;
}

const ParticleSwarm: React.FC<SwarmProps> = ({
  count = 15000,
  speed = 0.5,
  radius: baseRadius = 64,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const pColor = useMemo(() => new THREE.Color(), []);

  const positions = useMemo(() => {
    const pos: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++)
      pos.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
        ),
      );
    return pos;
  }, [count]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff }), []);
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(0.25), []);

  const PARAMS = useMemo(
    () => ({ radius: baseRadius, fold: 8, pulse: 3.2, swirl: 1.4, jitter: 0.8 }),
    [baseRadius],
  );

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime() * speed;

    for (let i = 0; i < count; i++) {
      const n = i / count;
      const ga = 2.399963229728653;
      const y = 1 - 2 * n;
      const rr = Math.sqrt(1 - y * y);
      const a = i * ga;

      const sx = Math.cos(a) * rr;
      const sz = Math.sin(a) * rr;

      const hemi = sx < 0 ? -1 : 1;
      const midGap = 1 - 0.22 * Math.exp(-sx * sx * 18);

      const phi = Math.atan2(sz, sx);
      const gyri1 = Math.sin(phi * 6 + y * 7 + time * 0.25);
      const gyri2 = Math.sin(phi * 13 - y * 11 - time * 0.18);
      const gyri3 = Math.sin((sx + sz) * 9 + time * 0.33);
      const cortical =
        1 + (0.11 * PARAMS.fold * (0.45 * gyri1 + 0.35 * gyri2 + 0.2 * gyri3)) / 8;

      const frontBack = 0.86 + 0.2 * Math.abs(sz);
      const topBottom = 0.82 + 0.3 * (1 - y * y);
      const lobeBias = 1 + 0.08 * hemi * Math.sin(phi * 2.5 + time * 0.12);

      const shell = PARAMS.radius * cortical * midGap;
      let x = sx * shell * frontBack * lobeBias;
      let yy = y * shell * topBottom;
      let z = sz * shell * 1.08;

      const inner = Math.sin(n * 80 + time * 1.7 + Math.abs(y) * 9 + phi * 3);
      const axon = Math.sin(
        (x * 0.07 + z * 0.09) * PARAMS.swirl -
          time * (1.2 + PARAMS.pulse * 0.15) +
          n * 30,
      );
      const spark = Math.max(
        0,
        Math.sin(n * 240 - time * (6 + PARAMS.pulse * 2.4) + gyri2 * 1.7 + phi * 5),
      );
      const spark2 = Math.max(
        0,
        Math.sin(n * 140 + time * (4.5 + PARAMS.pulse * 1.4) + gyri1 * 2.1 - y * 8),
      );
      const fire = Math.pow(0.65 * spark + 0.35 * spark2, 2.2);

      const drift = 1 + 0.035 * axon + 0.02 * inner;
      x +=
        sx * fire * PARAMS.pulse * 5.5 * drift +
        Math.sin(a * 1.7 + time * 3.1) * PARAMS.jitter * 0.18;
      yy +=
        y * fire * PARAMS.pulse * 4.2 * drift +
        Math.cos(a * 1.3 - time * 2.7) * PARAMS.jitter * 0.18;
      z +=
        sz * fire * PARAMS.pulse * 5.8 * drift +
        Math.sin(a * 1.1 + time * 2.9) * PARAMS.jitter * 0.18;

      const bridge = Math.exp(-Math.abs(sx) * 8) * (1 - Math.abs(y)) * 8;
      x *= 1 - bridge * 0.035;
      z += hemi * bridge * Math.sin(time * 1.4 + n * 40) * 0.4;

      target.set(x, yy, z);

      const h = 0.62 - 0.18 * fire + 0.04 * Math.sin(phi * 2 + time * 0.2);
      const s = 0.75 + 0.25 * fire;
      const l = 0.2 + 0.22 * (0.5 + 0.5 * inner) + 0.45 * fire;
      pColor.setHSL(h, s, l);

      positions[i].lerp(target, 0.1);
      dummy.position.copy(positions[i]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, pColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} />;
};

/* ─── Exported wrapper ─── */

interface NeuralSwarmProps {
  className?: string;
  /** 'small' = inside card (~80px), 'large' = page header (~120px) */
  size?: 'small' | 'large';
}

const NeuralSwarm: React.FC<NeuralSwarmProps> = ({ className = '', size = 'small' }) => {
  const isSmall = size === 'small';
  return (
    <div className={`pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, isSmall ? 120 : 100], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <fog attach="fog" args={['#000000', 0.01]} />
        <ParticleSwarm
          count={isSmall ? 6000 : 15000}
          speed={0.5}
          radius={isSmall ? 48 : 64}
        />
        <OrbitControls
          autoRotate
          autoRotateSpeed={1.5}
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
        />
        <Effects disableGamma>
          {/* @ts-ignore — extend type */}
          <unrealBloomPass threshold={0} strength={1.8} radius={0.4} />
        </Effects>
      </Canvas>
    </div>
  );
};

export default NeuralSwarm;
