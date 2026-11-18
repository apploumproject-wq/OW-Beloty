import { ContractType, ContreLevel, SeatPosition } from '../types/game';
import { getPartnerSeat, getTeamForSeat } from './players';

export interface ContractOption {
  type: ContractType;
  label: string;
  shortLabel: string;
  symbol: string;
  basePoints: number;
  surcontreAppliesExtraMultiplier: boolean;
  isSuitContract: boolean;
}

export const CONTRACT_OPTIONS: ContractOption[] = [
  {
    type: 'TREFLE',
    label: 'Trèfle',
    shortLabel: 'Trèfle',
    symbol: '♣',
    basePoints: 32,
    surcontreAppliesExtraMultiplier: false,
    isSuitContract: true,
  },
  {
    type: 'CARREAU',
    label: 'Carreau',
    shortLabel: 'Carreau',
    symbol: '♦',
    basePoints: 16,
    surcontreAppliesExtraMultiplier: true,
    isSuitContract: true,
  },
  {
    type: 'COEUR',
    label: 'Cœur',
    shortLabel: 'Cœur',
    symbol: '♥',
    basePoints: 16,
    surcontreAppliesExtraMultiplier: true,
    isSuitContract: true,
  },
  {
    type: 'PIQUE',
    label: 'Pique',
    shortLabel: 'Pique',
    symbol: '♠',
    basePoints: 16,
    surcontreAppliesExtraMultiplier: true,
    isSuitContract: true,
  },
  {
    type: 'SANS_ATOUT',
    label: 'Sans Atout',
    shortLabel: 'SA',
    symbol: 'SA',
    basePoints: 52,
    surcontreAppliesExtraMultiplier: false,
    isSuitContract: false,
  },
  {
    type: 'TOUT_ATOUT',
    label: 'Tout Atout',
    shortLabel: 'TA',
    symbol: 'TA',
    basePoints: 26,
    surcontreAppliesExtraMultiplier: true,
    isSuitContract: false,
  },
];

export const CONTRACT_META: Record<ContractType, ContractOption> = CONTRACT_OPTIONS.reduce(
  (acc, item) => {
    acc[item.type] = item;
    return acc;
  },
  {} as Record<ContractType, ContractOption>,
);

export const CONTRE_LABELS: Record<ContreLevel, string> = {
  AUCUN: 'Simple',
  CONTRE: 'Contré',
  SURCONTRE: 'Surcontré',
};

/**
 * Hiérarchie officielle des contrats OW'Beloty (du plus faible au plus fort) :
 * 1. Trèfle  2. Carreau  3. Cœur  4. Pique  5. Sans Atout  6. Tout Atout
 */
export const CONFIRMED_CONTRACT_HIERARCHY: ContractType[] = [
  'TREFLE',
  'CARREAU',
  'COEUR',
  'PIQUE',
  'SANS_ATOUT',
  'TOUT_ATOUT',
];

export function isContractAllowedOver(
  candidate: ContractType,
  currentActive: ContractType | null,
  contreLevel: ContreLevel,
  hierarchy: ContractType[] = CONFIRMED_CONTRACT_HIERARCHY,
): boolean {
  // Après un contre ou un surcontre, aucune nouvelle annonce de contrat n'est permise
  if (contreLevel !== 'AUCUN') return false;
  if (!currentActive) return true;
  if (candidate === currentActive) return false;

  const candidateIdx = hierarchy.indexOf(candidate);
  const currentIdx = hierarchy.indexOf(currentActive);
  return candidateIdx > currentIdx;
}

/**
 * Un joueur peut contrer uniquement si :
 * - un contrat actif existe et n'est pas encore contré
 * - il n'est ni le déclarant ni le partenaire du déclarant (équipe adverse uniquement)
 * Note : le premier annonceur conserve ce droit si un adversaire a surenchéri ensuite.
 */
export function canSeatContre(
  seat: SeatPosition,
  activeContract: ContractType | null,
  declaringSeat: SeatPosition | null,
  contreLevel: ContreLevel,
): boolean {
  if (!activeContract || !declaringSeat || contreLevel !== 'AUCUN') return false;
  if (seat === declaringSeat || seat === getPartnerSeat(declaringSeat)) return false;
  return getTeamForSeat(seat) !== getTeamForSeat(declaringSeat);
}

/**
 * Un joueur peut surcontrer uniquement si :
 * - le contrat est actuellement contré
 * - il appartient à l'équipe déclarante (le déclarant OU son partenaire ont le droit de surcontrer)
 * - l'équipe adverse (qui a contré) ne peut pas surcontrer
 */
export function canSeatSurcontre(
  seat: SeatPosition,
  activeContract: ContractType | null,
  declaringSeat: SeatPosition | null,
  contreLevel: ContreLevel,
): boolean {
  if (!activeContract || !declaringSeat || contreLevel !== 'CONTRE') return false;
  return getTeamForSeat(seat) === getTeamForSeat(declaringSeat);
}
