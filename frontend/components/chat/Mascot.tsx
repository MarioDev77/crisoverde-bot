/** Ícone/mascote da CRISO.AI: robô simples com um broto de planta. SVG puro, sem imagem externa. */
export function Mascot({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="CRISO.AI"
      className={className}
    >
      <defs>
        <linearGradient id="criso-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35e0a6" />
          <stop offset="1" stopColor="#10976f" />
        </linearGradient>
      </defs>
      {/* broto */}
      <path d="M60 36 C60 28 58 22 55 17" stroke="#22d36b" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M56 24 C47 11 31 12 28 15 C30 29 45 33 56 24Z" fill="#22d36b" />
      <path d="M60 25 C65 9 83 6 90 10 C88 26 74 33 60 25Z" fill="#15a950" />
      {/* orelhas */}
      <rect x="12" y="58" width="9" height="20" rx="4.5" fill="#10976f" />
      <rect x="99" y="58" width="9" height="20" rx="4.5" fill="#10976f" />
      {/* cabeça */}
      <rect x="20" y="36" width="80" height="64" rx="28" fill="url(#criso-head)" />
      <rect x="29" y="46" width="62" height="44" rx="20" fill="#04130c" />
      {/* olhos */}
      <circle cx="47" cy="68" r="7" fill="#3dffa0" />
      <circle cx="73" cy="68" r="7" fill="#3dffa0" />
    </svg>
  );
}
