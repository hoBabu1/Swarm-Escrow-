export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <line x1="16" y1="8" x2="7" y2="24" stroke="rgba(200,255,230,0.4)" strokeWidth="1" />
      <line x1="16" y1="8" x2="25" y2="24" stroke="rgba(200,255,230,0.4)" strokeWidth="1" />
      <line x1="7" y1="24" x2="25" y2="24" stroke="rgba(200,255,230,0.4)" strokeWidth="1" />
      <circle cx="16" cy="8" r="3.5" fill="#4dffb8" />
      <circle cx="7" cy="24" r="3.5" fill="#4d9fff" />
      <circle cx="25" cy="24" r="3.5" fill="#4dffb8" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-heading text-lg font-bold text-foreground">Swarm Escrow</span>
    </span>
  );
}
