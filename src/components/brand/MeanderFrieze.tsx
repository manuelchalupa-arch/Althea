interface MeanderFriezeProps {
  className?: string;
  height?: number;
  color?: string;
}

export function MeanderFrieze({ className = '', height = 14, color = '#C5A059' }: MeanderFriezeProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 60"
      fill="none"
      className={`w-full ${className}`}
      style={{ height: `${height * 4.3}px` }}
      aria-hidden="true"
    >
      <defs>
        <pattern id="greekMeander" width="40" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M 0 10 L 15 10 L 15 5 L 5 5 L 5 15 L 25 15 L 25 0 L 0 0 M 20 10 L 35 10 L 35 5 L 25 5 L 25 15 L 40 15"
            fill="none"
            stroke={color}
            strokeWidth="1.75"
            strokeLinecap="square"
            opacity="0.85"
          />
        </pattern>
      </defs>
      <line x1="0" y1="2" x2="800" y2="2" stroke={color} strokeWidth="1.5" opacity="0.6" />
      <rect x="0" y="5" width="800" height="20" fill="url(#greekMeander)" />
      <line x1="0" y1="27" x2="800" y2="27" stroke={color} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}
