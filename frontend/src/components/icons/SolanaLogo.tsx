import React from 'react';

interface Props {
  className?: string;
  size?: number;
}

/**
 * Official Solana logo mark as an inline SVG component.
 * Renders the three gradient bars (the "S" mark) at the given size.
 */
export const SolanaLogo: React.FC<Props> = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 128 128"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="sol-grad" x1="10" y1="128" x2="118" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9945FF" />
        <stop offset="0.5" stopColor="#14F195" />
        <stop offset="1" stopColor="#00C2FF" />
      </linearGradient>
    </defs>
    {/* Top bar — points right */}
    <path
      d="M20.5 26h72.2a4.5 4.5 0 0 1 3.2 1.3l11.6 11.6a1.5 1.5 0 0 1-1.1 2.6H34.3a4.5 4.5 0 0 1-3.2-1.3L19.5 28.6a1.5 1.5 0 0 1 1.1-2.6Z"
      fill="url(#sol-grad)"
    />
    {/* Middle bar — points left */}
    <path
      d="M20.5 55.5h72.2a4.5 4.5 0 0 0 3.2-1.3l11.6-11.6a1.5 1.5 0 0 0-1.1-2.6H34.3a4.5 4.5 0 0 0-3.2 1.3L19.5 52.9a1.5 1.5 0 0 0 1.1 2.6Z"
      fill="url(#sol-grad)"
      transform="translate(0, 32)"
    />
    {/* Bottom bar — points right */}
    <path
      d="M20.5 26h72.2a4.5 4.5 0 0 1 3.2 1.3l11.6 11.6a1.5 1.5 0 0 1-1.1 2.6H34.3a4.5 4.5 0 0 1-3.2-1.3L19.5 28.6a1.5 1.5 0 0 1 1.1-2.6Z"
      fill="url(#sol-grad)"
      transform="translate(0, 60)"
    />
  </svg>
);

export default SolanaLogo;
