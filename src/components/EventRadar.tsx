"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

type Node = {
  x: number;
  y: number;
  r: number;
  phase: number;
};

const NODE_COUNT = 34;

function buildNodes(width: number, height: number): Node[] {
  const cx = width * 0.58;
  const cy = height * 0.5;
  const nodes: Node[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const ring = i % 5;
    const angle = (i / NODE_COUNT) * Math.PI * 2 + (ring * 0.42);
    const radius = Math.min(width, height) * (0.11 + ring * 0.065) + Math.sin(i * 1.7) * 20;
    nodes.push({
      x: cx + Math.cos(angle) * radius + Math.sin(i * 2.1) * 34,
      y: cy + Math.sin(angle) * radius * 0.72 + Math.cos(i * 1.4) * 26,
      r: 1.6 + (i % 4) * 0.42,
      phase: i * 0.19,
    });
  }

  nodes.push(
    { x: width * 0.2, y: height * 0.34, r: 2.2, phase: 0.1 },
    { x: width * 0.3, y: height * 0.68, r: 1.8, phase: 0.6 },
    { x: width * 0.78, y: height * 0.28, r: 2.4, phase: 1.2 },
  );

  return nodes;
}

export default function EventRadar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = buildNodes(width, height);
    };

    const draw = (now: number) => {
      const t = reduceMotion ? 0.35 : (now - start) / 1000;
      const isLight = resolved === "light";
      const fg = isLight ? "12, 12, 14" : "255, 255, 255";
      const accent = "102, 0, 255";
      const bgAlpha = isLight ? 0.05 : 0.12;

      ctx.clearRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.72, height * 0.36, 0, width * 0.72, height * 0.36, width * 0.62);
      glow.addColorStop(0, `rgba(${accent}, ${isLight ? 0.18 : 0.3})`);
      glow.addColorStop(0.45, `rgba(${accent}, ${isLight ? 0.08 : 0.14})`);
      glow.addColorStop(1, "rgba(102, 0, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width * 0.58, height * 0.5);
      ctx.rotate(-0.08);
      ctx.strokeStyle = `rgba(${accent}, ${isLight ? 0.14 : 0.2})`;
      ctx.lineWidth = 1;
      for (let r = 90; r < Math.max(width, height) * 0.75; r += 84) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const sweep = ((t * 0.18) % 1) * Math.PI * 2;
      const sweepGradient = ctx.createLinearGradient(0, 0, Math.cos(sweep) * width * 0.44, Math.sin(sweep) * width * 0.44);
      sweepGradient.addColorStop(0, `rgba(${accent}, 0)`);
      sweepGradient.addColorStop(1, `rgba(${accent}, ${isLight ? 0.22 : 0.32})`);
      ctx.strokeStyle = sweepGradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * width * 0.46, Math.sin(sweep) * height * 0.34);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = `rgba(${fg}, ${bgAlpha})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < 146) {
            ctx.globalAlpha = Math.max(0.06, 1 - d / 150) * (isLight ? 0.46 : 0.55);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = 0.5 + Math.sin(t * 2.2 + n.phase * 8) * 0.5;
        ctx.fillStyle = `rgba(${fg}, ${isLight ? 0.82 : 0.9})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + pulse * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let p = 0; p < 5; p++) {
        const from = nodes[(p * 7 + Math.floor(t * 0.5)) % nodes.length];
        const to = nodes[(p * 7 + 9 + Math.floor(t * 0.5)) % nodes.length];
        const progress = reduceMotion ? 0.62 : (t * 0.38 + p * 0.19) % 1;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        ctx.fillStyle = `rgba(${accent}, ${isLight ? 0.9 : 1})`;
        ctx.shadowColor = `rgba(${accent}, 0.65)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    resize();
    draw(start);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [resolved]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
