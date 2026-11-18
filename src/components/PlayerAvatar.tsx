import React from 'react';
import { getPlayerInitials } from '../engine/profiles';
import { PlayerProfile } from '../types/game';

interface PlayerAvatarProps {
  profile: PlayerProfile;
  size?: 'sm' | 'md' | 'lg';
  isActiveTurn?: boolean;
  isDealer?: boolean;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-20 h-20 text-xl',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  profile,
  size = 'md',
  isActiveTurn = false,
  isDealer = false,
}) => {
  const initials = getPlayerInitials(profile.pseudo);

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <div
        className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden flex items-center justify-center font-semibold tracking-tight select-none transition-transform duration-150 ${
          isActiveTurn
            ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#072617] scale-[1.04]'
            : 'ring-1 ring-white/25'
        } bg-[#10472C] text-amber-100`}
      >
        {profile.avatarDataUrl ? (
          <img
            src={profile.avatarDataUrl}
            alt={`Photo de ${profile.pseudo}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {isDealer && (
        <span
          title="Donneur"
          aria-label="Donneur"
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-[#062114] text-[10px] font-bold flex items-center justify-center border border-[#062114] shadow-sm"
        >
          D
        </span>
      )}
    </div>
  );
};
