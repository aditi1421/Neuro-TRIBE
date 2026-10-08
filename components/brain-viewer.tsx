"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BrainAsset } from "@/lib/neurosim";

type Props = {
  asset: BrainAsset;
  values: number[];
  selected: number | null;
  threshold: number;
  view: "lateral" | "dorsal" | "anterior";
  scale: number;
  resetView: number;
};
export default function BrainViewer({
  asset,
  values,
  selected,
  threshold,
  view,
  scale,
  resetView,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    meshes: THREE.Mesh[];
    render: () => void;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "3D requires WebGL. Region charts and exports remain available.",
      );
      return;
    }
    const node = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive fsaverage5 cortical surface. Drag to rotate and scroll to zoom.",
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(-330, -250, 165);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 180;
    controls.maxDistance = 650;
    controls.target.set(0, -20, 10);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-200, -200, 300);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa9bbff, 1.4);
    rim.position.set(200, 100, 0);
    scene.add(rim);
    const meshes = [asset.left, asset.right].map((s, i) => {
      const geometry = new THREE.BufferGeometry();
      const verts = new Float32Array(s.vertices);
      for (let j = 0; j < verts.length; j += 3) verts[j] += i === 0 ? -8 : 8;
      geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      geometry.setIndex(s.faces);
      geometry.computeVertexNormals();
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(verts.length).fill(0.45), 3),
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.73,
          metalness: 0.08,
          side: THREE.DoubleSide,
        }),
      );
      scene.add(mesh);
      return mesh;
    });
    const render = () => renderer.render(scene, camera);
    state.current = { meshes, render, camera, controls };
    const resize = () => {
      const { width, height } = node.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    controls.addEventListener("change", render);
    controls.update();
    resize();
    return () => {
      observer.disconnect();
      controls.dispose();
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, [asset]);
  useEffect(() => {
    const st = state.current;
    if (!st) return;
    const gray = new THREE.Color("#787a91"),
      positive = new THREE.Color("#f4a277"),
      negative = new THREE.Color("#5ec8cf"),
      highlight = new THREE.Color("#faf3de");
    st.meshes.forEach((m, h) => {
      const s = h === 0 ? asset.left : asset.right;
      const attr = m.geometry.getAttribute("color");
      for (let i = 0; i < s.labels.length; i++) {
        const v = values[i + h * 10242] ?? 0;
        const active = Math.abs(v) >= threshold;
        const intensity = active
          ? Math.min(Math.abs(v) / Math.max(scale, 0.001), 1)
          : 0;
        const color = gray
          .clone()
          .lerp(v >= 0 ? positive : negative, intensity * 0.94);
        const shade = THREE.MathUtils.clamp(0.87 - s.sulc[i] * 0.1, 0.6, 1.1);
        color.multiplyScalar(shade);
        if (s.labels[i] === 42 || s.labels[i] === 0) color.set("#353945");
        if (selected !== null) {
          if (s.labels[i] === selected) color.lerp(highlight, 0.22);
          else color.multiplyScalar(0.42);
        }
        attr.setXYZ(i, color.r, color.g, color.b);
      }
      attr.needsUpdate = true;
    });
    st.render();
  }, [asset, values, selected, threshold, scale]);
  useEffect(() => {
    const st = state.current;
    if (!st) return;
    const poses = {
      lateral: [-330, -250, 165],
      dorsal: [0, -20, 440],
      anterior: [0, 410, 70],
    } as const;
    const p = poses[view];
    st.camera.position.set(p[0], p[1], p[2]);
    st.controls.update();
    st.render();
  }, [view, resetView]);
  return (
    <div className="brain-canvas" ref={host}>
      {error && (
        <div className="brain-error" role="status">
          {error}
        </div>
      )}
    </div>
  );
}
