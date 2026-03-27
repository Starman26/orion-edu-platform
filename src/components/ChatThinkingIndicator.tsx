import React from "react";
import { motion } from "framer-motion";
import { Orbit } from "lucide-react";

import "../styles/ask.css";

type ChatThinkingIndicatorProps = {
  label?: string;
  className?: string;

  /** Permite setear CSS variables desde props si un día lo necesitas */
  style?: React.CSSProperties;
};

export default function ChatThinkingIndicator({
  label = "Thinking...",
  className = "",
  style,
}: ChatThinkingIndicatorProps) {
  return (
    <div className={`chatThinkingIndicator ${className}`} style={style}>
      <motion.div
        className="chatThinkingIndicator__spinner"
        animate={{ rotate: 360 }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
        aria-hidden="true"
      >
        <Orbit className="chatThinkingIndicator__icon" />
      </motion.div>

      <div className="chatThinkingIndicator__labelWrap" aria-live="polite">
        <span className="chatThinkingIndicator__label">{label}</span>

        {/* Shimmer overlay */}
        <motion.div
          className="chatThinkingIndicator__shimmer"
          animate={{ x: ["-120%", "220%"] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
