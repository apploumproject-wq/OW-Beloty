import {
  Card,
  CompletedTrick,
  ContractType,
  SeatPosition,
  TeamId,
  TrickCard,
} from '../types/game';
import {
  getCardInternalTrickValue,
  getCardOrderStrength,
  isSuitTrump,
} from './cards';
import { getPartnerSeat, getTeamForSeat } from './players';

/**
 * Détermine la carte actuellement gagnante dans un pli en cours.
 */
export function getWinningTrickCard(
  trick: TrickCard[],
  contract: ContractType,
): TrickCard | null {
  if (trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const candidate = trick[i];
    const winnerIsTrump = isSuitTrump(winner.card.suit, contract);
    const candIsTrump = isSuitTrump(candidate.card.suit, contract);

    if (candIsTrump && !winnerIsTrump) {
      winner = candidate;
    } else if (candIsTrump && winnerIsTrump) {
      if (candidate.card.suit === winner.card.suit) {
        if (
          getCardOrderStrength(candidate.card, contract) >
          getCardOrderStrength(winner.card, contract)
        ) {
          winner = candidate;
        }
      }
      // En Tout Atout, seule la couleur demandée peut remporter le pli
    } else if (!candIsTrump && !winnerIsTrump) {
      if (candidate.card.suit === leadSuit && winner.card.suit === leadSuit) {
        if (
          getCardOrderStrength(candidate.card, contract) >
          getCardOrderStrength(winner.card, contract)
        ) {
          winner = candidate;
        }
      }
    }
  }

  return winner;
}

/**
 * Retourne les cartes légalement jouables pour le siège actif selon les règles de belote :
 * - Obligation de fournir la couleur demandée si possible.
 * - En Tout Atout ou si la couleur demandée est atout : obligation de monter si possible.
 * - Si défausse (couleur demandée absente) :
 *   - Si le partenaire n'est pas maître et qu'on possède de l'atout (contrat couleur), obligation de couper
 *     (et de surcouper si l'adversaire a déjà coupé et qu'on possède un atout supérieur).
 */
export function getPlayableCards(
  hand: Card[],
  currentTrick: TrickCard[],
  contract: ContractType,
  seat: SeatPosition,
): Card[] {
  if (hand.length === 0) return [];
  if (currentTrick.length === 0) return hand;

  const leadSuit = currentTrick[0].card.suit;
  const sameSuitCards = hand.filter((c) => c.suit === leadSuit);
  const winningEntry = getWinningTrickCard(currentTrick, contract);

  if (sameSuitCards.length > 0) {
    // Si la couleur demandée est atout (contrat couleur ou Tout Atout), obligation de monter si possible
    if (isSuitTrump(leadSuit, contract) && winningEntry && winningEntry.card.suit === leadSuit) {
      const winningStrength = getCardOrderStrength(winningEntry.card, contract);
      const higherTrumps = sameSuitCards.filter(
        (c) => getCardOrderStrength(c, contract) > winningStrength,
      );
      if (higherTrumps.length > 0) {
        return higherTrumps;
      }
    }
    return sameSuitCards;
  }

  // Le joueur n'a pas la couleur demandée
  if (contract === 'SANS_ATOUT' || contract === 'TOUT_ATOUT') {
    return hand;
  }

  // Contrat couleur : vérifier si le partenaire est actuellement maître
  const partnerSeat = getPartnerSeat(seat);
  const partnerIsWinning = winningEntry?.seat === partnerSeat;
  const trumpCards = hand.filter((c) => c.suit === contract);

  if (trumpCards.length === 0 || partnerIsWinning) {
    return hand;
  }

  // L'adversaire est maître et le joueur possède de l'atout : obligation de couper (et surcouper si possible)
  if (winningEntry && winningEntry.card.suit === contract) {
    const winningTrumpStrength = getCardOrderStrength(winningEntry.card, contract);
    const higherTrumps = trumpCards.filter(
      (c) => getCardOrderStrength(c, contract) > winningTrumpStrength,
    );
    if (higherTrumps.length > 0) {
      return higherTrumps;
    }
  }

  return trumpCards;
}

export function resolveCompletedTrick(
  trickIndex: number,
  trick: TrickCard[],
  contract: ContractType,
): CompletedTrick {
  if (trick.length !== 4) {
    throw new Error('Un pli complet doit contenir exactement 4 cartes.');
  }
  const winningEntry = getWinningTrickCard(trick, contract);
  if (!winningEntry) {
    throw new Error('Impossible de déterminer le gagnant du pli.');
  }
  return {
    index: trickIndex,
    leader: trick[0].seat,
    cards: trick,
    winnerSeat: winningEntry.seat,
    winnerTeam: getTeamForSeat(winningEntry.seat),
  };
}

/**
 * Détecte un capot : les 8 plis de la donne ont été remportés par la même équipe.
 */
export function detectCapot(completedTricks: CompletedTrick[]): TeamId | null {
  if (completedTricks.length !== 8) return null;
  const tricksA = completedTricks.filter((t) => t.winnerTeam === 'EQUIPE_A').length;
  const tricksB = completedTricks.filter((t) => t.winnerTeam === 'EQUIPE_B').length;
  if (tricksA === 8) return 'EQUIPE_A';
  if (tricksB === 8) return 'EQUIPE_B';
  return null;
}

export interface RoundCardPointsEvaluation {
  cardPointsA: number;
  cardPointsB: number;
  contractSucceeded: boolean;
  roundWinningTeam: TeamId;
}

/**
 * Compte les points des cartes remportées par chaque équipe sur les 8 plis,
 * plus les 10 points du dernier pli (10 de der) pour l'équipe qui le remporte.
 * Règle obligatoire :
 * - L'équipe déclarante réussit son contrat UNIQUEMENT si elle possède strictement
 *   plus de points internes (cartes + 10 de der) que l'équipe adverse.
 * - Si elle possède moins de points OU en cas d'égalité exacte, le contrat échoue
 *   et l'équipe adverse remporte la manche (reçoit les points du contrat OW'Beloty).
 * - Ces points internes ne sont JAMAIS ajoutés au score cumulatif (objectif 150).
 */
export function evaluateRoundCardPointsAndWinner(
  completedTricks: CompletedTrick[],
  contract: ContractType,
  declaringTeam: TeamId,
): RoundCardPointsEvaluation {
  let cardPointsA = 0;
  let cardPointsB = 0;

  for (let i = 0; i < completedTricks.length; i++) {
    const trick = completedTricks[i];
    const trickCardSum = trick.cards.reduce(
      (sum, entry) => sum + getCardInternalTrickValue(entry.card, contract),
      0,
    );
    const dixDeDer = i === completedTricks.length - 1 ? 10 : 0;
    if (trick.winnerTeam === 'EQUIPE_A') {
      cardPointsA += trickCardSum + dixDeDer;
    } else {
      cardPointsB += trickCardSum + dixDeDer;
    }
  }

  const declaringPoints = declaringTeam === 'EQUIPE_A' ? cardPointsA : cardPointsB;
  const defendingPoints = declaringTeam === 'EQUIPE_A' ? cardPointsB : cardPointsA;
  const defendingTeam: TeamId =
    declaringTeam === 'EQUIPE_A' ? 'EQUIPE_B' : 'EQUIPE_A';

  const contractSucceeded = declaringPoints > defendingPoints;
  const roundWinningTeam = contractSucceeded ? declaringTeam : defendingTeam;

  return {
    cardPointsA,
    cardPointsB,
    contractSucceeded,
    roundWinningTeam,
  };
}

export function determineNonCapotRoundWinner(
  completedTricks: CompletedTrick[],
  contract: ContractType,
  declaringTeam: TeamId,
): TeamId {
  return evaluateRoundCardPointsAndWinner(completedTricks, contract, declaringTeam)
    .roundWinningTeam;
}
