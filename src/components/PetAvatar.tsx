import type { CSSProperties } from "react";

type PetAvatarProps = {
  primary?: string;
  secondary?: string;
  size?: number;
  state?: "idle" | "walk" | "fall" | "land" | "drag" | "sleep" | "excited";
  facing?: "left" | "right";
  className?: string;
};

export function PetAvatar({
  primary = "#2f7df6",
  secondary = "#f59f38",
  size = 112,
  state = "idle",
  facing = "right",
  className = ""
}: PetAvatarProps) {
  const style = {
    "--pet-primary": primary,
    "--pet-secondary": secondary,
    width: size,
    height: size * 1.28
  } as CSSProperties;

  return (
    <div
      className={`pet-avatar pet-avatar--${state} pet-avatar--${facing} ${className}`}
      style={style}
      aria-label="桌宠形象预览"
    >
      <svg viewBox="0 0 120 154" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="bodyGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--pet-primary)" />
            <stop offset="100%" stopColor="#173b72" />
          </linearGradient>
        </defs>
        <ellipse className="pet-shadow" cx="60" cy="145" rx="36" ry="7" />
        <g className="pet-body">
          <path
            className="pet-leg pet-leg--left"
            d="M42 104 L38 136 L51 136 L55 105 Z"
            fill="#1f2c43"
          />
          <path
            className="pet-leg pet-leg--right"
            d="M66 104 L70 136 L83 136 L78 105 Z"
            fill="#1f2c43"
          />
          <path
            className="pet-arm pet-arm--left"
            d="M31 70 C16 75 16 94 26 99 L37 92 L41 76 Z"
            fill="var(--pet-secondary)"
          />
          <path
            className="pet-arm pet-arm--right"
            d="M89 70 C104 75 104 94 94 99 L83 92 L79 76 Z"
            fill="var(--pet-secondary)"
          />
          <rect
            x="31"
            y="55"
            width="58"
            height="59"
            rx="20"
            fill="url(#bodyGlow)"
            stroke="#0e223f"
            strokeWidth="4"
          />
          <path
            d="M44 57 L58 68 L75 57 L70 88 L48 88 Z"
            fill="#f5f8ff"
            opacity="0.22"
          />
          <circle cx="48" cy="83" r="4" fill="var(--pet-secondary)" />
          <circle cx="72" cy="83" r="4" fill="var(--pet-secondary)" />
          <path
            className="pet-head"
            d="M30 27 C30 10 90 10 90 27 L90 48 C90 67 70 75 60 75 C50 75 30 67 30 48 Z"
            fill="#f8f6ef"
            stroke="#15253d"
            strokeWidth="4"
          />
          <path
            d="M34 24 L40 6 L52 20 M86 24 L80 6 L68 20"
            fill="none"
            stroke="#15253d"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M38 20 C42 12 51 11 56 18 L60 48 L42 48 Z"
            fill="var(--pet-primary)"
            opacity="0.88"
          />
          <path
            d="M82 20 C78 12 69 11 64 18 L60 48 L78 48 Z"
            fill="var(--pet-secondary)"
            opacity="0.88"
          />
          <ellipse cx="48" cy="46" rx="5" ry="7" fill="#13253e" />
          <ellipse cx="72" cy="46" rx="5" ry="7" fill="#13253e" />
          <circle cx="50" cy="43" r="1.8" fill="#fff" />
          <circle cx="74" cy="43" r="1.8" fill="#fff" />
          <path
            className="pet-mouth"
            d="M54 60 Q60 65 66 60"
            fill="none"
            stroke="#13253e"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
