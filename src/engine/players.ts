import {
  PlayerProfile,
  SeatPosition,
  TablePlayer,
  TeamId,
  TurnDirection,
} from '../types/game';

export const SEATS_ANTI_HORAIRE: SeatPosition[] = ['SUD', 'EST', 'NORD', 'OUEST'];
export const SEATS_HORAIRE: SeatPosition[] = ['SUD', 'OUEST', 'NORD', 'EST'];

export const SEAT_LABELS: Record<SeatPosition, string> = {
  SUD: 'Sud (Vous)',
  EST: 'Est',
  NORD: 'Nord (Partenaire)',
  OUEST: 'Ouest',
};

export const TEAM_LABELS: Record<TeamId, string> = {
  EQUIPE_A: 'Équipe Sud / Nord',
  EQUIPE_B: 'Équipe Est / Ouest',
};

export function getTeamForSeat(seat: SeatPosition): TeamId {
  return seat === 'SUD' || seat === 'NORD' ? 'EQUIPE_A' : 'EQUIPE_B';
}

export function getPartnerSeat(seat: SeatPosition): SeatPosition {
  switch (seat) {
    case 'SUD':
      return 'NORD';
    case 'NORD':
      return 'SUD';
    case 'EST':
      return 'OUEST';
    case 'OUEST':
      return 'EST';
  }
}

export function getNextSeat(
  current: SeatPosition,
  direction: TurnDirection,
): SeatPosition {
  const order = direction === 'ANTI_HORAIRE' ? SEATS_ANTI_HORAIRE : SEATS_HORAIRE;
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export function getPreviousSeat(
  current: SeatPosition,
  direction: TurnDirection,
): SeatPosition {
  const order = direction === 'ANTI_HORAIRE' ? SEATS_ANTI_HORAIRE : SEATS_HORAIRE;
  const idx = order.indexOf(current);
  return order[(idx + 3) % order.length];
}

export function pickRandomSeat(randomFn: () => number = Math.random): SeatPosition {
  const idx = Math.floor(randomFn() * SEATS_ANTI_HORAIRE.length) % SEATS_ANTI_HORAIRE.length;
  return SEATS_ANTI_HORAIRE[idx];
}

export function getTurnOrderStartingFrom(
  startSeat: SeatPosition,
  direction: TurnDirection,
): SeatPosition[] {
  const order = direction === 'ANTI_HORAIRE' ? SEATS_ANTI_HORAIRE : SEATS_HORAIRE;
  const startIdx = order.indexOf(startSeat);
  return [
    order[startIdx],
    order[(startIdx + 1) % 4],
    order[(startIdx + 2) % 4],
    order[(startIdx + 3) % 4],
  ];
}

export function buildLocalTablePlayers(
  localProfile: PlayerProfile,
  seatOverrides?: Partial<Record<SeatPosition, PlayerProfile>>,
): Record<SeatPosition, TablePlayer> {
  const defaultBotProfiles: Record<Exclude<SeatPosition, 'SUD'>, PlayerProfile> = {
    EST: {
      id: 'local-seat-est',
      pseudo: 'Joueur Est',
      avatarDataUrl: null,
      updatedAt: Date.now(),
      deviceTag: 'Siege local Est',
    },
    NORD: {
      id: 'local-seat-nord',
      pseudo: 'Partenaire Nord',
      avatarDataUrl: null,
      updatedAt: Date.now(),
      deviceTag: 'Siege local Nord',
    },
    OUEST: {
      id: 'local-seat-ouest',
      pseudo: 'Joueur Ouest',
      avatarDataUrl: null,
      updatedAt: Date.now(),
      deviceTag: 'Siege local Ouest',
    },
  };

  return {
    SUD: {
      seat: 'SUD',
      team: 'EQUIPE_A',
      profile: seatOverrides?.SUD ?? localProfile,
      isLocalUser: true,
      hand: [],
    },
    EST: {
      seat: 'EST',
      team: 'EQUIPE_B',
      profile: seatOverrides?.EST ?? defaultBotProfiles.EST,
      isLocalUser: false,
      hand: [],
    },
    NORD: {
      seat: 'NORD',
      team: 'EQUIPE_A',
      profile: seatOverrides?.NORD ?? defaultBotProfiles.NORD,
      isLocalUser: false,
      hand: [],
    },
    OUEST: {
      seat: 'OUEST',
      team: 'EQUIPE_B',
      profile: seatOverrides?.OUEST ?? defaultBotProfiles.OUEST,
      isLocalUser: false,
      hand: [],
    },
  };
}
