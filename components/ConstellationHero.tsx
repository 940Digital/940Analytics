"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const BLUE = 0x3194e0;
const GREY = 0xb8bbc2;
const WHITE = 0xffffff;
const CHARCOAL = 0x1b1d21;

/** A soft circular sprite (canvas-drawn radial gradient) so points render as
 *  round glints instead of the default square GL points. */
function makeDiscTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.7)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function ConstellationHero() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let w = mount.clientWidth;
    let h = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 13);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(CHARCOAL, 1);
    mount.appendChild(renderer.domElement);

    // ---- Core: nested symmetrical wireframe solids, sharing one center ----
    const core = new THREE.Group();
    scene.add(core);

    function wireSolid(geometry: THREE.BufferGeometry, color: number, opacity: number) {
      const edges = new THREE.WireframeGeometry(geometry);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
      });
      return new THREE.LineSegments(edges, material);
    }

    const icosa = wireSolid(new THREE.IcosahedronGeometry(3.1, 0), BLUE, 0.55);
    const octa = wireSolid(new THREE.OctahedronGeometry(2.1, 0), GREY, 0.4);
    const tetra = wireSolid(new THREE.TetrahedronGeometry(1.3, 0), WHITE, 0.6);
    core.add(icosa, octa, tetra);

    // ---- Constellation nodes: a denser inner ring, connected by lines
    //      exactly like the 2D hero on 940digital.com, just projected in 3D ----
    const NODE_COUNT = 70;
    const nodePositions: THREE.Vector3[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const r = 3.6 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      nodePositions.push(
        new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        )
      );
    }

    const discTex = makeDiscTexture();

    const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodePositions);
    const nodeMat = new THREE.PointsMaterial({
      color: GREY,
      size: 0.1,
      map: discTex,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const nodePoints = new THREE.Points(nodeGeo, nodeMat);
    core.add(nodePoints);

    const linePositions: number[] = [];
    const lineAlphas: number[] = [];
    const maxDist = 2.6;
    for (let i = 0; i < nodePositions.length; i++) {
      for (let j = i + 1; j < nodePositions.length; j++) {
        const d = nodePositions[i].distanceTo(nodePositions[j]);
        if (d < maxDist) {
          linePositions.push(
            nodePositions[i].x, nodePositions[i].y, nodePositions[i].z,
            nodePositions[j].x, nodePositions[j].y, nodePositions[j].z
          );
          const a = 1 - d / maxDist;
          lineAlphas.push(a, a);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: BLUE,
      transparent: true,
      opacity: 0.28,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    core.add(lines);

    // ---- Animation state ----
    let rafId: number | null = null;
    let running = false;
    let startTime = performance.now();
    const pointer = { x: 0, y: 0 };
    const pointerEased = { x: 0, y: 0 };

    function render(elapsed: number) {
      const t = elapsed / 1000;

      if (!prefersReducedMotion) {
        core.rotation.y = t * 0.06;
        icosa.rotation.x = t * 0.05;
        icosa.rotation.y = t * 0.09;
        octa.rotation.x = -t * 0.08;
        octa.rotation.y = t * 0.04;
        tetra.rotation.x = t * 0.14;
        tetra.rotation.y = -t * 0.11;

        pointerEased.x += (pointer.x - pointerEased.x) * 0.03;
        pointerEased.y += (pointer.y - pointerEased.y) * 0.03;
        camera.position.x = pointerEased.x * 1.1;
        camera.position.y = pointerEased.y * 0.8;
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
      if (running) rafId = requestAnimationFrame((now) => render(now - startTime));
    }

    function start() {
      if (running) return;
      running = true;
      startTime = performance.now();
      rafId = requestAnimationFrame((now) => render(now - startTime));
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    renderer.render(scene, camera);
    if (!prefersReducedMotion) start();

    function onResize() {
      w = mount!.clientWidth;
      h = mount!.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    }
    window.addEventListener("resize", onResize);

    function onPointerMove(e: PointerEvent) {
      const rect = mount!.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    }
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", onPointerMove);
    }

    let io: IntersectionObserver | null = null;
    function onVisibility() {
      if (document.hidden) stop();
      else if (mount!.getBoundingClientRect().bottom > 0 && !prefersReducedMotion) start();
    }
    if (!prefersReducedMotion) {
      io = new IntersectionObserver(
        (entries) => entries.forEach((entry) => (entry.isIntersecting ? start() : stop())),
        { threshold: 0 }
      );
      io.observe(mount);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      mount.removeChild(renderer.domElement);
      discTex.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      icosa.geometry.dispose();
      octa.geometry.dispose();
      tetra.geometry.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
