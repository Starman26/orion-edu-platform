import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 2000;
const FRICTION = 0.92;
const ATTRACTION = 0.01;
const RETURN_FORCE = 0.0012;
const EFFECT_RADIUS = 200;
const RANDOM_FORCE = 0.12;

interface Particle {
  x: number; y: number;
  ox: number; oy: number;
  vx: number; vy: number;
}

interface ParticleRingProps {
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ParticleRing({
  color = "rgba(16,17,19,0.28)",
  className,
  style,
}: ParticleRingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    const mouse = { x: null as number | null, y: null as number | null };
    let rafId: number;

    function initParticles() {
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      const R_outer = Math.min(cx, cy) * 0.65;
      const R_inner = R_outer * 0.6;
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = R_inner + Math.random() * (R_outer - R_inner);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        particles.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
      }
    }

    function resize() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
      initParticles();
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = color;
      for (const p of particles) {
        p.vx += (Math.random() - 0.5) * RANDOM_FORCE;
        p.vy += (Math.random() - 0.5) * RANDOM_FORCE;
        p.vx += (p.ox - p.x) * RETURN_FORCE;
        p.vy += (p.oy - p.y) * RETURN_FORCE;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < EFFECT_RADIUS * EFFECT_RADIUS) {
            const force = (1 - Math.sqrt(dist2) / EFFECT_RADIUS) * ATTRACTION;
            p.vx += dx * force;
            p.vy += dy * force;
          }
        }

        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.x += p.vx;
        p.y += p.vy;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx!.fill();
      }
      rafId = requestAnimationFrame(animate);
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onMouseLeave = () => { mouse.x = null; mouse.y = null; };

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    resize();
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [color]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", background: "transparent", ...style }}
    />
  );
}
