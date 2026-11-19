import React from 'react';
import { SUIT_META } from '../engine/cards';
import { Card } from '../types/game';

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  playable?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-8 h-12 rounded-md',
  sm: 'w-12 h-[68px] rounded-lg',
  md: 'w-14 h-20 sm:w-16 sm:h-[92px] rounded-xl',
  lg: 'w-[62px] h-[90px] sm:w-[74px] sm:h-[106px] rounded-xl',
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  playable = false,
  dimmed = false,
  selected = false,
  size = 'md',
  onClick,
}) => {
  const sizeClass = SIZE_MAP[size];

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClass} relative overflow-hidden border border-white/25 bg-[#0A3D24] shadow-md select-none shrink-0`}
        aria-hidden="true"
      >
        <img
          src="/src/assets/images/owbeloty_card_back_1794998085966.jpg"
          alt="Dos de carte OW'Beloty"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const meta = SUIT_META[card.suit];
  const displayRank: Record<string, string> = { V: 'J', D: 'Q', R: 'K' };
  const rankLabel = displayRank[card.rank] ?? card.rank;
  const colorClass = meta.isRed ? 'text-[#C81E1E]' : 'text-[#111827]';
  const isCourt = card.rank === 'V' || card.rank === 'D' || card.rank === 'R' || card.rank === 'A';

  const interactiveClasses = onClick
    ? playable
      ? 'cursor-pointer hover:-translate-y-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 shadow-lg'
      : 'cursor-not-allowed'
    : '';

  const stateClasses = dimmed
    ? 'opacity-45 saturate-50'
    : selected
      ? '-translate-y-3 ring-2 ring-amber-400 shadow-xl'
      : '';

  return (
    <button
      type="button"
      onClick={playable ? onClick : undefined}
      disabled={!onClick || !playable}
      aria-label={`${rankLabel} de ${meta.label}`}
      className={`${sizeClass} ${interactiveClasses} ${stateClasses} relative bg-[#FCFBF7] border border-stone-300/90 flex flex-col justify-between p-1.5 select-none transition-transform duration-150 shrink-0 text-left`}
    >
      <div className={`flex flex-col items-center leading-none w-fit ${colorClass}`}>
        <span className="text-xs sm:text-sm font-bold tracking-tight font-mono">
          {rankLabel}
        </span>
        <span className="text-[11px] sm:text-xs leading-none">{meta.symbol}</span>
      </div>

      <div className={`flex items-center justify-center flex-1 ${colorClass}`}>
        <span
          className={`${
            size === 'sm'
              ? 'text-lg'
              : size === 'lg'
                ? isCourt
                  ? 'text-2xl sm:text-3xl font-bold'
                  : 'text-2xl sm:text-3xl'
                : 'text-xl sm:text-2xl'
          } leading-none`}
        >
          {meta.symbol}
        </span>
      </div>

      <div
        className={`flex flex-col items-center leading-none w-fit self-end rotate-180 ${colorClass}`}
      >
        <span className="text-xs sm:text-sm font-bold tracking-tight font-mono">
          {rankLabel}
        </span>
        <span className="text-[11px] sm:text-xs leading-none">{meta.symbol}</span>
      </div>
    </button>
  );
};
