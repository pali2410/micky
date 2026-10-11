"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MickyFace } from "./face";

export type BuddyState = "idle" | "listening" | "thinking" | "speaking" | "happy" | "working";

interface Micky3DHeadProps {
  state?: BuddyState;
  size?: number;
  interactive?: boolean;
  pulseColor?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function Micky3DHead({
  state = "idle",
  size = 140,
  interactive = true,
  pulseColor = "#E9FF3B",
  className = "",
  onClick,
}: Micky3DHeadProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasWebGlError, setHasWebGlError] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animId: number;
    let destroyed = false;

    // Safety timeout: never let loading spinner spin indefinitely
    const safetyTimer = setTimeout(() => {
      setLoaded(true);
    }, 2500);

    // Scene & Camera setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    // Renderer with full alpha transparency and graceful fallback
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "default",
      });
      renderer.setSize(size, size);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn("WebGL not supported or disabled:", e);
      setHasWebGlError(true);
      setLoaded(true);
      clearTimeout(safetyTimer);
      return;
    }

    // Clean Studio Lighting setup - pure white & warm ambient for authentic Mickey colors
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(1, 3, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xfff6ec, 1.0);
    fillLight.position.set(-3, 1, 4);
    scene.add(fillLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.8);
    topLight.position.set(0, 5, 2);
    scene.add(topLight);

    // Hierarchy: root -> pivot -> model
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    root.add(pivot);
    scene.add(root);

    // Mouse tracking
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      targetMouseX = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.4)));
      targetMouseY = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.4)));
    };

    window.addEventListener("mousemove", onMouseMove);

    // Global desktop cursor tracking across entire monitor
    const electron = (window as any).mickyElectron ?? (window as any).electron;
    if (interactive && electron?.onGlobalCursor) {
      electron.onGlobalCursor((pos: { x: number; y: number }) => {
        targetMouseX = Math.max(-1.2, Math.min(1.2, pos.x));
        targetMouseY = Math.max(-1.2, Math.min(1.2, pos.y));
      });
    }

    // Load texture with correct UV wrapping & standard upright coordinate system
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load("/models/mickey/textures/Mickey.png");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true; // Upright orientation: black ears at top, peach face & mouth in center, black nose/chin at bottom
    texture.wrapS = THREE.RepeatWrapping; // Essential: allows UVs > 1.0 to wrap into valid coordinates
    texture.wrapT = THREE.RepeatWrapping;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.55,
      metalness: 0.05,
    });

    // Load OBJ
    const objLoader = new OBJLoader();
    objLoader.load(
      "/models/mickey/source/art3.obj",
      (obj) => {
        if (destroyed) return;

        // Apply texture material to all child meshes
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = material;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        // Compute bounding box and center precisely
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const dimensions = box.getSize(new THREE.Vector3());

        // Offset geometry so center is at (0, 0, 0)
        obj.position.set(-center.x, -center.y, -center.z);

        // Normalize scale to fit viewport nicely
        const maxDim = Math.max(dimensions.x, dimensions.y, dimensions.z);
        const targetSize = 2.4;
        const scale = targetSize / (maxDim || 1);
        pivot.scale.setScalar(scale);

        // Face forward towards camera (rotate 180 deg around Y)
        pivot.rotation.y = Math.PI;

        pivot.add(obj);
        setLoaded(true);
      },
      undefined,
      (err) => {
        console.warn("Failed to load 3D Mickey head:", err);
        setHasWebGlError(true);
        setLoaded(true);
      }
    );

    // Animation loop
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const st = stateRef.current;

      // Fast responsive smoothing (zero lag)
      currentMouseX += (targetMouseX - currentMouseX) * 0.22;
      currentMouseY += (targetMouseY - currentMouseY) * 0.22;

      if (pivot) {
        // Base idle bobbing & natural neck tilt
        let bobY = Math.sin(elapsed * 2.2) * 0.06;
        let tiltZ = Math.sin(elapsed * 1.4) * 0.03 + (currentMouseX * 0.08);
        // Correct non-inverted arrow/cursor tracking:
        // Moving cursor right -> turnY turns right
        // Moving cursor down -> nodX tilts down
        let nodX = currentMouseY * 0.35;
        let turnY = Math.PI - currentMouseX * 0.45;
        let scalePulse = 1.0;

        // Emotion-specific state animations
        if (st === "speaking") {
          // Dynamic speaking nod + mouth bounce
          bobY += Math.sin(elapsed * 9) * 0.08;
          nodX += Math.sin(elapsed * 12) * 0.07;
          scalePulse = 1.0 + Math.abs(Math.sin(elapsed * 10)) * 0.05;
        } else if (st === "listening") {
          // Attentive forward lean + tilt
          tiltZ += 0.12;
          nodX -= 0.1;
          bobY += Math.sin(elapsed * 3) * 0.04;
        } else if (st === "thinking") {
          // Look up and to the side
          turnY += 0.25;
          nodX -= 0.18;
          tiltZ -= 0.08;
        } else if (st === "happy") {
          // Joyful bounce
          bobY = Math.abs(Math.sin(elapsed * 4)) * 0.12;
          tiltZ = Math.sin(elapsed * 4) * 0.08;
        }

        pivot.position.y = bobY;
        pivot.rotation.x = nodX;
        pivot.rotation.y = turnY;
        pivot.rotation.z = tiltZ;

        // Subtle speaking scale pulse
        const baseScale = pivot.scale.x;
        if (baseScale > 0) {
          pivot.scale.y = baseScale * scalePulse;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [size, interactive]);

  if (hasWebGlError) {
    return (
      <div
        onClick={onClick}
        className={`relative select-none flex items-center justify-center ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <MickyFace state={state} size={size * 0.8} />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative select-none flex items-center justify-center ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* 3D Canvas Mount */}
      <div ref={mountRef} style={{ width: `${size}px`, height: `${size}px` }} />

      {/* Subtle audio reactivity ring ONLY when speaking */}
      {state === "speaking" && (
        <div
          className="absolute inset-0 pointer-events-none rounded-full animate-ping opacity-25"
          style={{
            border: `2px solid ${pulseColor}`,
            filter: "blur(2px)",
          }}
        />
      )}

      {/* Loading state indicator */}
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: 0.6 }}
        >
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: pulseColor, borderTopColor: "transparent" }}
          />
        </div>
      )}
    </div>
  );
}
