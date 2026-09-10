"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const BLUE = 0x3194e0;
const BLUE_DEEP = 0x2570ae;
const GREY = 0xb8bbc2;
const SAND = 0xf7f1e7;
const WHITE = 0xffffff;
const CHARCOAL = 0x1b1d21;
const CHARCOAL_MID = 0x1e2125;

/** One flat-shaded, outlined low-poly shape — the toy-block look Monument
 *  Valley builds its whole world from: solid matte faces plus a crisp dark
 *  edge line, no smoothing, no texture. */
function block(geometry: THREE.BufferGeometry, color: number) {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.75,
      metalness: 0.05,
    })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: CHARCOAL, transparent: true, opacity: 0.35 })
  );
  group.add(fill, edges);
  return group;
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

    // Orthographic, angled-down camera: the flat, no-perspective-distortion
    // "diorama" look Monument Valley's impossible geometry relies on.
    const frustum = 11;
    const camera = new THREE.OrthographicCamera(
      (-frustum * (w / h)) / 2,
      (frustum * (w / h)) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      100
    );
    camera.position.set(9, 7, 9);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(CHARCOAL, 1);
    mount.appendChild(renderer.domElement);

    // ---- Soft toy-diorama lighting ----
    scene.add(new THREE.HemisphereLight(0x3a4048, CHARCOAL_MID, 0.9));
    const key = new THREE.DirectionalLight(SAND, 0.9);
    key.position.set(6, 10, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(BLUE, 0.5);
    rim.position.set(-8, 3, -6);
    scene.add(rim);

    // ---- World group: everything that idles/auto-rotates together ----
    const world = new THREE.Group();
    scene.add(world);

    // Core: a large low-poly "planet" the rest of the composition orbits.
    const core = block(new THREE.IcosahedronGeometry(2.1, 0), BLUE);
    world.add(core);

    // A thin tilted ring around the core — an orbit made visible, and a
    // nod to the data-around-a-center idea from the first pass.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.03, 8, 64),
      new THREE.MeshBasicMaterial({ color: BLUE_DEEP, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2.6;
    world.add(ring);

    // Satellites: small toy-blocks, each on its own tilted circular orbit,
    // each spinning on its own axis — this is the "constantly shifting,
    // structured" motion Monument Valley builds every scene from.
    type Satellite = {
      group: THREE.Group;
      radius: number;
      speed: number;
      phase: number;
      tiltX: number;
      tiltZ: number;
      spinX: number;
      spinY: number;
    };

    const satellites: Satellite[] = [
      {
        group: block(new THREE.OctahedronGeometry(0.62, 0), SAND),
        radius: 4.4, speed: 0.18, phase: 0, tiltX: 0.35, tiltZ: 0.08, spinX: 0.6, spinY: 0.4,
      },
      {
        group: block(new THREE.TetrahedronGeometry(0.55, 0), WHITE),
        radius: 5.6, speed: -0.13, phase: 2.1, tiltX: -0.2, tiltZ: 0.25, spinX: -0.5, spinY: 0.7,
      },
      {
        group: block(new THREE.BoxGeometry(0.75, 0.75, 0.75), GREY),
        radius: 3.3, speed: 0.24, phase: 4.2, tiltX: 0.12, tiltZ: -0.3, spinX: 0.4, spinY: -0.55,
      },
    ];
    satellites.forEach((s) => world.add(s.group));

    // ---- Animation ----
    let rafId: number | null = null;
    let running = false;
    let startTime = performance.now();
    const pointer = { x: 0, y: 0 };
    const pointerEased = { x: 0, y: 0 };

    function layout(t: number) {
      core.rotation.y = t * 0.12;
      core.rotation.x = Math.sin(t * 0.15) * 0.08;

      satellites.forEach((s) => {
        const angle = t * s.speed + s.phase;
        const x = Math.cos(angle) * s.radius;
        const z = Math.sin(angle) * s.radius;
        const y = Math.sin(angle * 1.7 + s.phase) * s.radius * 0.18;
        s.group.position.set(x, y, z);
        // tilt the orbital plane itself so paths aren't all flat/parallel
        s.group.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), s.tiltX);
        s.group.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), s.tiltZ);
        s.group.rotation.x = t * s.spinX;
        s.group.rotation.y = t * s.spinY;
      });

      ring.rotation.z = t * 0.05;
      world.rotation.y = t * 0.02;
    }

    function render(elapsed: number) {
      const t = elapsed / 1000;
      if (!prefersReducedMotion) {
        layout(t);
        pointerEased.x += (pointer.x - pointerEased.x) * 0.04;
        pointerEased.y += (pointer.y - pointerEased.y) * 0.04;
        camera.position.set(9 + pointerEased.x * 1.4, 7 - pointerEased.y * 0.9, 9 + pointerEased.x * -1.2);
        camera.lookAt(0, 0.4, 0);
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

    if (prefersReducedMotion) layout(0);
    renderer.render(scene, camera);
    if (!prefersReducedMotion) start();

    function onResize() {
      w = mount!.clientWidth;
      h = mount!.clientHeight;
      const aspect = w / h;
      camera.left = (-frustum * aspect) / 2;
      camera.right = (frustum * aspect) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
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
    if (!prefersReducedMotion) window.addEventListener("pointermove", onPointerMove);

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
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      [core, ...satellites.map((s) => s.group)].forEach((g) => {
        g.children.forEach((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
      });
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
