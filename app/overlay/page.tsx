"use client";

import { useEffect, useState, useRef } from "react";
import {RobotBuddy} from "@/components/micky/robot-buddy";
import type {RobotHeadState} from "@/RobotHeads/src";
import type { AppState } from "@/lib/types";

export default function Overlay() {
  const [state, setState] = useState<AppState | null>(null);
  const [hovered, setHovered] = useState(false);
  const faceState: RobotHeadState = state?.sessions.some(s => ["queued", "starting", "running"].includes(s.status)) ? "thinking" : "idle";
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  // Maintain 100% transparent desktop background
  useEffect(() => {
    document.body.classList.add("overlay-body");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.body.classList.remove("overlay-body");
    };
  }, []);

  // Poll task state
  useEffect(() => {
    let active = true;
    let timer:ReturnType<typeof setTimeout>;
    let version=-1;
    const poll = async () => {
      try {
        if(document.hidden)return;
        const res = await fetch('/api/state?v='+version, { cache: "no-store",signal:AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          version=data.version;
          if (active && data.state) {
            setState(data.state);
          }
        }
      } catch {} finally{if(active)timer=setTimeout(poll,document.hidden?10000:2000);}
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const restoreMain = () => {
    const electron = (window as any).mickyElectron ?? (window as any).electron;
    electron?.showMain?.() ?? electron?.restoreMain?.();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.screenX,
      startY: e.screenY,
      moved: false,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.screenX - dragRef.current.startX;
      const dy = e.screenY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        const electron = (window as any).mickyElectron ?? (window as any).electron;
        electron?.moveOverlay?.({ dx, dy });
        dragRef.current.startX = e.screenX;
        dragRef.current.startY = e.screenY;
      }
    };

    const onMouseUp = () => {
      if (!dragRef.current) return;
      const wasMoved = dragRef.current.moved;
      dragRef.current = null;
      setIsDragging(false);

      if (!wasMoved) {
        restoreMain();
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const dismissOverlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const electron = (window as any).mickyElectron ?? (window as any).electron;
    electron?.closeOverlay?.();
  };

  return (
    <div
      style={{
        background: "transparent",
        backgroundColor: "transparent",
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        overflow: "hidden",
        position: "relative",
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Drag anywhere on screen · Click to open Micky window"
    >
      {/* Pure 3D Mickey Floating Character - ZERO CONTAINER, ZERO PILL */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "drop-shadow(0 12px 24px rgba(0, 0, 0, 0.5))",
          transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: hovered ? "scale(1.05)" : "scale(1.0)",
        }}
      >
        {/* Subtle hover dismiss button (X) */}
        {hovered && (
          <button
            onMouseDown={e=>e.stopPropagation()}
            onClick={dismissOverlay}
            title="Close floating buddy"
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "rgba(24, 24, 27, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 50,
              padding: 0,
              transition: "transform 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              e.currentTarget.style.transform = "scale(1.15)";
              e.currentTarget.style.background = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1.0)";
              e.currentTarget.style.background = "rgba(24, 24, 27, 0.9)";
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}

        <RobotBuddy
          state={faceState}
          size={175}


        />
      </div>
    </div>
  );
}

