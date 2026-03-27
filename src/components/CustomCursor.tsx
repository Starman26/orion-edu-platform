// src/components/CustomCursor.tsx
import { useState, useEffect } from "react";

interface CustomCursorProps {
  color?: string;
  variant?: "light" | "dark";
}

export function CustomCursor({ color, variant = "light" }: CustomCursorProps) {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [smoothPosition, setSmoothPosition] = useState({ x: -100, y: -100 });
  const [isOverInteractive, setIsOverInteractive] = useState(false);

  const cursorColor = color || (variant === "light" ? "rgba(255, 255, 255, 0.85)" : "rgba(16, 17, 19, 0.85)");

  useEffect(() => {
    const checkInteractiveElement = (target: HTMLElement) => {
      const interactiveSelectors = [
        'button', 
        'input', 
        'textarea', 
        'a', 
        'select', 
        '[role="button"]', 
        '.toggle-link', 
        '.social-button', 
        '.forgot-password',
        '.sidebar__item',
        '.sidebar__footerItem',
        '.sidebar__workspaceBtn',
        '.sidebar__dropdownItem',
        '.sidebar__iconBtn',
      ];
      return interactiveSelectors.some(selector => 
        target.matches(selector) || target.closest(selector)
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      const isInteractive = checkInteractiveElement(e.target as HTMLElement);
      setIsOverInteractive(isInteractive);
      document.body.style.cursor = isInteractive ? 'auto' : 'none';
    };

    const handleMouseLeave = () => {
      setPosition({ x: -100, y: -100 });
      document.body.style.cursor = 'auto';
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      document.body.style.cursor = 'auto';
    };
  }, []);

  // Smooth animation
  useEffect(() => {
    const ease = 0.15;
    let animationId: number;

    const animate = () => {
      setSmoothPosition(prev => ({
        x: prev.x + (position.x - prev.x) * ease,
        y: prev.y + (position.y - prev.y) * ease,
      }));
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [position]);

  if (isOverInteractive || position.x < 0) return null;

  const size = 16;
  const innerGap = 4;
  const cornerLength = 6;
  const svgSize = size * 2 + 4;
  const center = svgSize / 2;

  return (
    <svg
      style={{
        position: "fixed",
        left: smoothPosition.x - center,
        top: smoothPosition.y - center,
        width: svgSize,
        height: svgSize,
        pointerEvents: "none",
        zIndex: 9999,
      }}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Esquina superior izquierda */}
      <path
        d={`M${center - size} ${center - size + cornerLength} L${center - size} ${center - size} L${center - size + cornerLength} ${center - size}`}
        stroke={cursorColor}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      
      {/* Esquina superior derecha */}
      <path
        d={`M${center + size - cornerLength} ${center - size} L${center + size} ${center - size} L${center + size} ${center - size + cornerLength}`}
        stroke={cursorColor}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      
      {/* Esquina inferior izquierda */}
      <path
        d={`M${center - size} ${center + size - cornerLength} L${center - size} ${center + size} L${center - size + cornerLength} ${center + size}`}
        stroke={cursorColor}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      
      {/* Esquina inferior derecha */}
      <path
        d={`M${center + size - cornerLength} ${center + size} L${center + size} ${center + size} L${center + size} ${center + size - cornerLength}`}
        stroke={cursorColor}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      
      {/* Cruz central */}
      <path
        d={`
          M${center} ${center - size + 5} L${center} ${center - innerGap}
          M${center} ${center + innerGap} L${center} ${center + size - 5}
          M${center - size + 5} ${center} L${center - innerGap} ${center}
          M${center + innerGap} ${center} L${center + size - 5} ${center}
        `}
        stroke={cursorColor}
        strokeWidth="1"
        strokeLinecap="square"
      />
      
      {/* Punto central */}
      <circle cx={center} cy={center} r="1.5" fill={cursorColor} />
    </svg>
  );
}

export default CustomCursor;