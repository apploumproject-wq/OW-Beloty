import { Card, ContractType, Rank, Suit } from '../types/game';

export const SUITS: Suit[] = ['TREFLE', 'CARREAU', 'COEUR', 'PIQUE'];
export const RANKS: Rank[] = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'];

export const SUIT_META: Record<
  Suit,
  { label: string; symbol: string; colorClass: string; isRed: boolean }
> = {
  TREFLE: { label: 'Trèfle', symbol: '♣', colorClass: 'text-slate-900', isRed: false },
  CARREAU: { label: 'Carreau', symbol: '♦', colorClass: 'text-red-600', isRed: true },
  COEUR: { label: 'Cœur', symbol: '♥', colorClass: 'text-red-600', isRed: true },
  PIQUE: { label: 'Pique', symbol: '♠', colorClass: 'text-slate-900', isRed: false },
};

export const RANK_LABEL: Record<Rank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  V: 'Valet',
  D: 'Dame',
  R: 'Roi',
  A: 'As',
};

const TRUMP_ORDER: Record<Rank, number> = {
  '7': 0,
  '8': 1,
  D: 2,
  R: 3,
  '10': 4,
  A: 5,
  '9': 6,
  V: 7,
};

const NON_TRUMP_ORDER: Record<Rank, number> = {
  '7': 0,
  '8': 1,
  '9': 2,
  V: 3,
  D: 4,
  R: 5,
  '10': 6,
  A: 7,
};

// Valeurs internes utilisées uniquement pour départager le vainqueur d'une donne hors capot.
// Elles ne sont JAMAIS ajoutées au score OW'Beloty (objectif 150 points).
const TRUMP_INTERNAL_VALUE: Record<Rank, number> = {
  '7': 0,
  '8': 0,
  D: 3,
  R: 4,
  '10': 10,
  A: 11,
  '9': 14,
  V: 20,
};

const NON_TRUMP_INTERNAL_VALUE: Record<Rank, number> = {
  '7': 0,
  '8': 0,
  '9': 0,
  V: 2,
  D: 3,
  R: 4,
  '10': 10,
  A: 11,
};

export function createDeck32(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
      });
    }
  }
  return deck;
}

export function shuffleDeck(cards: Card[]): Card[] {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealFourHands(deck: Card[]): [Card[], Card[], Card[], Card[]] {
  if (deck.length !== 32) {
    throw new Error(`Le paquet doit contenir exactement 32 cartes (reçu ${deck.length}).`);
  }
  return [
    deck.slice(0, 8),
    deck.slice(8, 16),
    deck.slice(16, 24),
    deck.slice(24, 32),
  ];
}

export interface TwoStageDealResult {
  firstFiveBySeat: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', Card[]>;
  remainingThreeBySeat: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', Card[]>;
  stageOneCounts: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', number>;
  stageTwoCounts: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', number>;
}

/**
 * Distribution officielle en deux temps avant les annonces (3 cartes puis 2 cartes = 5 cartes/joueur),
 * suivie des 3 cartes restantes par joueur à distribuer après validation du contrat.
 */
export function dealBeloteThreeTwoThree(
  deck: Card[],
  seatOrder: Array<'SUD' | 'EST' | 'NORD' | 'OUEST'>,
): TwoStageDealResult {
  if (deck.length !== 32) {
    throw new Error(`Le paquet doit contenir exactement 32 cartes (reçu ${deck.length}).`);
  }
  if (seatOrder.length !== 4) {
    throw new Error('La distribution nécessite exactement 4 sièges.');
  }

  const firstFiveBySeat: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', Card[]> = {
    SUD: [],
    EST: [],
    NORD: [],
    OUEST: [],
  };
  const remainingThreeBySeat: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', Card[]> = {
    SUD: [],
    EST: [],
    NORD: [],
    OUEST: [],
  };
  const stageOneCounts: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', number> = {
    SUD: 0,
    EST: 0,
    NORD: 0,
    OUEST: 0,
  };
  const stageTwoCounts: Record<'SUD' | 'EST' | 'NORD' | 'OUEST', number> = {
    SUD: 0,
    EST: 0,
    NORD: 0,
    OUEST: 0,
  };

  let cursor = 0;

  // Étape 1 : 3 cartes par joueur
  for (const seat of seatOrder) {
    const batch = deck.slice(cursor, cursor + 3);
    firstFiveBySeat[seat].push(...batch);
    stageOneCounts[seat] = batch.length;
    cursor += 3;
  }

  // Étape 2 : 2 cartes par joueur (total = 5 cartes avant les annonces)
  for (const seat of seatOrder) {
    const batch = deck.slice(cursor, cursor + 2);
    firstFiveBySeat[seat].push(...batch);
    stageTwoCounts[seat] = batch.length;
    cursor += 2;
  }

  // Étape 3 : 3 cartes restantes par joueur à distribuer après validation du contrat
  for (const seat of seatOrder) {
    remainingThreeBySeat[seat] = deck.slice(cursor, cursor + 3);
    cursor += 3;
  }

  return {
    firstFiveBySeat,
    remainingThreeBySeat,
    stageOneCounts,
    stageTwoCounts,
  };
}

export function isSuitTrump(suit: Suit, contract: ContractType | null): boolean {
  if (!contract || contract === 'SANS_ATOUT') return false;
  if (contract === 'TOUT_ATOUT') return true;
  return contract === suit;
}

export function getCardOrderStrength(
  card: Card,
  contract: ContractType | null,
): number {
  const trump = isSuitTrump(card.suit, contract);
  return trump ? TRUMP_ORDER[card.rank] : NON_TRUMP_ORDER[card.rank];
}

export function getCardInternalTrickValue(
  card: Card,
  contract: ContractType,
): number {
  const trump = isSuitTrump(card.suit, contract);
  return trump
    ? TRUMP_INTERNAL_VALUE[card.rank]
    : NON_TRUMP_INTERNAL_VALUE[card.rank];
}

export function sortHand(hand: Card[], contract: ContractType | null): Card[] {
  const suitPriority: Record<Suit, number> = {
    PIQUE: 0,
    COEUR: 1,
    TREFLE: 2,
    CARREAU: 3,
  };
  return [...hand].sort((a, b) => {
    const suitDiff = suitPriority[a.suit] - suitPriority[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return getCardOrderStrength(b, contract) - getCardOrderStrength(a, contract);
  });
}
