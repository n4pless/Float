import React from 'react';

const SOL_LOGO_URL =
  'https://assets.coingecko.com/coins/images/4128/standard/solana.png?1718769756';

interface Props {
  className?: string;
  size?: number;
}

/**
 * Solana logo via CoinGecko CDN.
 */
export const SolanaLogo: React.FC<Props> = ({ className, size = 20 }) => (
  <img
    src={SOL_LOGO_URL}
    alt="SOL"
    width={size}
    height={size}
    className={`rounded-full ${className ?? ''}`}
    draggable={false}
  />
);

export default SolanaLogo;
