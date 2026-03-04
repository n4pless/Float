import React from 'react';

/**
 * Asset icon using CoinGecko CDN images.
 * Maps base asset symbols to their CoinGecko image URLs.
 */

const ASSET_ICONS: Record<string, string> = {
  SOL: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png?1718769756',
  BTC: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400',
  ETH: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png?1696501628',
  USDC: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png?1696506694',
};

// Fallback brand colors per asset
const ASSET_COLORS: Record<string, string> = {
  SOL: '#9945FF',
  BTC: '#F7931A',
  ETH: '#627EEA',
  USDC: '#2775CA',
};

interface AssetIconProps {
  asset: string;         // e.g. 'SOL', 'BTC', 'ETH'
  size?: number;
  className?: string;
}

export const AssetIcon: React.FC<AssetIconProps> = ({ asset, size = 20, className }) => {
  const url = ASSET_ICONS[asset.toUpperCase()];

  if (!url) {
    // Fallback: colored circle with first letter
    const color = ASSET_COLORS[asset.toUpperCase()] ?? '#969faf';
    return (
      <div
        className={`rounded-full flex items-center justify-center shrink-0 ${className ?? ''}`}
        style={{ width: size, height: size, backgroundColor: color }}
      >
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }} className="text-white font-bold">
          {asset.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={asset}
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className ?? ''}`}
      draggable={false}
    />
  );
};

export default AssetIcon;
