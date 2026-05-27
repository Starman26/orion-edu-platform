import { useEffect, useRef } from "react";

interface SphereGraphProps {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string }[];
  color?: string;
  onNodeClick?: (id: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

const FOV   = 900;
const TILT  = 0.35; // X-axis tilt in radians

export default function SphereGraph({
  nodes,
  edges,
  color = "#101113",
  onNodeClick,
  style,
  className,
}: SphereGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Projected positions for hit-testing — updated every frame
  const projRef = useRef<{ px: number; py: number; r: number; id: string }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    // Degree of each node
    const degree = new Map<string, number>(nodes.map(n => [n.id, 0]));
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const maxDeg = Math.max(1, ...degree.values());

    // Fibonacci sphere unit positions
    const n = nodes.length;
    const unitPos = nodes.map((_, i) => {
      if (n === 0) return { x: 0, y: 0, z: 0 };
      const phi   = Math.acos(1 - 2 * (i + 0.5) / n);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
      };
    });

    const nodeIndex = new Map(nodes.map((nd, i) => [nd.id, i]));
    const cosTilt = Math.cos(TILT);
    const sinTilt = Math.sin(TILT);
    // A fixed rotation offset so the sphere starts at a natural angle
    const rotY = 0.4;

    function project(pos: { x: number; y: number; z: number }, cx: number, cy: number, R: number) {
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const rx  = pos.x * cosY - pos.z * sinY;
      const rz  = pos.x * sinY + pos.z * cosY;
      const ry  = pos.y * cosTilt - rz * sinTilt;
      const rz2 = pos.y * sinTilt + rz * cosTilt;
      const scale = FOV / (FOV + rz2 * R);
      return {
        px:    cx + rx * R * scale,
        py:    cy + ry * R * scale,
        depth: (rz2 + 1) / 2,
        scale,
      };
    }

    function resize() {
      canvas!.width  = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
      drawOnce();
    }

    function drawOnce() {
      const W  = canvas!.width;
      const H  = canvas!.height;
      const cx = W / 2;
      const cy = H / 2;
      const R  = Math.min(W, H) * 0.38;

      ctx!.clearRect(0, 0, W, H);

      const proj = unitPos.map((pos, i) => {
        const { px, py, depth, scale } = project(pos, cx, cy, R);
        const deg  = degree.get(nodes[i].id) ?? 0;
        const size = (2.5 + (deg / maxDeg) * 8) * scale;
        return { px, py, depth, size, id: nodes[i].id };
      });

      // Update hit-test ref
      projRef.current = proj.map(p => ({ px: p.px, py: p.py, r: Math.max(6, p.size), id: p.id }));

      // Edges
      for (const e of edges) {
        const si = nodeIndex.get(e.source);
        const ti = nodeIndex.get(e.target);
        if (si === undefined || ti === undefined) continue;
        const s = proj[si];
        const t = proj[ti];
        const avgDepth = (s.depth + t.depth) / 2;
        ctx!.globalAlpha  = 0.06 + avgDepth * 0.38;
        ctx!.strokeStyle  = color;
        ctx!.lineWidth    = 0.35 + avgDepth * 1.3;
        ctx!.beginPath();
        ctx!.moveTo(s.px, s.py);
        ctx!.lineTo(t.px, t.py);
        ctx!.stroke();
      }

      // Nodes back-to-front
      const order = proj.map((_, i) => i).sort((a, b) => proj[a].depth - proj[b].depth);
      ctx!.fillStyle = color;
      for (const i of order) {
        const p = proj[i];
        ctx!.globalAlpha = 0.18 + p.depth * 0.82;
        ctx!.beginPath();
        ctx!.arc(p.px, p.py, Math.max(1.8, p.size), 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.globalAlpha = 1;
    }

    // Click — find closest node within its hit radius
    const onClick = (e: MouseEvent) => {
      if (!onNodeClick) return;
      const rect = canvas!.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const p of projRef.current) {
        const d = Math.hypot(mx - p.px, my - p.py);
        if (d < p.r && d < bestDist) { bestDist = d; best = p.id; }
      }
      if (best) onNodeClick(best);
    };

    // Cursor feedback
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const over = projRef.current.some(p => Math.hypot(mx - p.px, my - p.py) < p.r);
      canvas!.style.cursor = over ? "pointer" : "default";
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMouseMove);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    resize();
    // Single draw via rAF so layout is fully settled
    rafId = requestAnimationFrame(() => drawOnce());

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMouseMove);
    };
  }, [nodes, edges, color, onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", background: "transparent", ...style }}
    />
  );
}
