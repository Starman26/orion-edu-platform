import { useState, useEffect, useRef } from "react";

export interface OrionSelectOption {
  value: string;
  label: string;
}

interface OrionSelectProps {
  value: string;
  options: OrionSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** chip = small pill (like LLM selector, opens up); field = form field (opens down) */
  variant?: "chip" | "field";
  className?: string;
}

export function OrionSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  variant = "field",
  className,
}: OrionSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? placeholder ?? value;

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div
      className={`orionSel_wrap orionSel_wrap--${variant}${className ? ` ${className}` : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`orionSel_trigger${open ? " orionSel_trigger--open" : ""}`}
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
      >
        <span className="orionSel_value">{selectedLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="orionSel_chevron"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="orionSel_menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`orionSel_option${opt.value === value ? " orionSel_option--active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
