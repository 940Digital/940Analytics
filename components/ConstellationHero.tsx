"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const BLUE = 0x3194e0;
const GREY = 0xb8bbc2;
const WHITE = 0xffffff;
const CHARCOAL = 0x1b1d21;

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
    core.scale.setScalar(2);

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
      icosa.geometry.dispose();
      octa.geometry.dispose();
      tetra.geometry.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
