import {
  BidEntry,
  Card,
  CompletedTrick,
  ContractType,
  ContreLevel,
  MatchState,
  SeatPosition,
  Suit,
  TeamId,
  TrickCard,
  TurnDirection,
} from '../types/game';
import {
  createDeck32,
  getCardInternalTrickValue,
  getCardOrderStrength,
  isSuitTrump,
  SUITS,
} from './cards';
import {
  canSeatContre,
  canSeatSurcontre,
  CONFIRMED_CONTRACT_HIERARCHY,
  isContractAllowedOver,
} from './contracts';
import { getPartnerSeat, getTeamForSeat } from './players';
import { getPlayableCards, getWinningTrickCard } from './tricks';

/**
 * Contexte strictement cloisonné fourni à l'intelligence artificielle.
 * L'IA ne reçoit JAMAIS les mains des autres joueurs ni les cartes restantes à distribuer.
 */
export interface AiDecisionContext {
  seat: SeatPosition;
  hand: Card[];
  activeContract: ContractType | null;
  declaringSeat: SeatPosition | null;
  declaringTeam: TeamId | null;
  contreLevel: ContreLevel;
  firstAnnouncerSeat: SeatPosition;
  consecutivePasses: number;
  bidHistory: BidEntry[];
  currentTrick: TrickCard[];
  completedTricks: CompletedTrick[];
  turnDirection: TurnDirection;
}

export type AiBidDecision =
  | { action: 'PASSE' }
  | { action: 'CONTRAT'; contract: ContractType }
  | { action: 'CONTRE' }
  | { action: 'SURCONTRE' };

/**
 * Extrait uniquement les informations publiques de la table et la main privée du siège `seat`.
 */
export function extractAiContext(
  state: MatchState,
  seat: SeatPosition,
): AiDecisionContext {
  return {
    seat,
    hand: [...state.players[seat].hand],
    activeContract: state.activeContract,
    declaringSeat: state.declaringSeat,
    declaringTeam: state.declaringTeam,
    contreLevel: state.contreLevel,
    firstAnnouncerSeat: state.firstAnnouncerSeat,
    consecutivePasses: state.consecutivePasses,
    bidHistory: [...state.bidHistory],
    currentTrick: [...state.currentTrick],
    completedTricks: [...state.completedTricks],
    turnDirection: state.turnDirection,
  };
}

function getSeenCardIds(ctx: AiDecisionContext): Set<string> {
  const seen = new Set<string>();
  for (const c of ctx.hand) seen.add(c.id);
  for (const tc of ctx.currentTrick) seen.add(tc.card.id);
  for (const trick of ctx.completedTricks) {
    for (const tc of trick.cards) seen.add(tc.card.id);
  }
  return seen;
}

function getUnseenCards(ctx: AiDecisionContext): Card[] {
  const seen = getSeenCardIds(ctx);
  return createDeck32().filter((c) => !seen.has(c.id));
}

function isCardMasterAmongUnseen(
  card: Card,
  contract: ContractType,
  unseenCards: Card[],
): boolean {
  const myStrength = getCardOrderStrength(card, contract);
  const higherUnseen = unseenCards.some(
    (other) =>
      other.suit === card.suit &&
      getCardOrderStrength(other, contract) > myStrength,
  );
  return !higherUnseen;
}

function countRemainingTrumpsUnseen(
  contract: ContractType,
  unseenCards: Card[],
): number {
  if (contract === 'SANS_ATOUT') return 0;
  return unseenCards.filter((c) => isSuitTrump(c.suit, contract)).length;
}

/**
 * Évalue la force d'une main de 5 cartes pour chacun des 6 contrats OW'Beloty.
 */
export function evaluateHandForContract(
  hand: Card[],
  contract: ContractType,
): number {
  if (contract === 'SANS_ATOUT') {
    let score = 0;
    let aceCount = 0;
    let coveredTenCount = 0;
    for (const suit of SUITS) {
      const cards = hand.filter((c) => c.suit === suit);
      const hasAce = cards.some((c) => c.rank === 'A');
      const hasTen = cards.some((c) => c.rank === '10');
      const hasKing = cards.some((c) => c.rank === 'R');
      const hasQueen = cards.some((c) => c.rank === 'D');
      if (hasAce) {
        aceCount += 1;
        score += 18;
      }
      if (hasTen) {
        if (hasAce || cards.length >= 2) {
          coveredTenCount += 1;
          score += hasAce ? 10 : 7;
        } else {
          score += 2;
        }
      }
      if (hasKing && (hasAce || hasTen)) score += 5;
      if (hasQueen && hasAce && hasKing) score += 3;
      if (cards.length >= 3 && hasAce) score += 4;
    }
    if (aceCount >= 2 && coveredTenCount >= 1) score += 6;
    if (aceCount === 0) score -= 12;
    return score;
  }

  if (contract === 'TOUT_ATOUT') {
    let score = 0;
    let valetCount = 0;
    let nineCount = 0;
    for (const suit of SUITS) {
      const cards = hand.filter((c) => c.suit === suit);
      const hasV = cards.some((c) => c.rank === 'V');
      const has9 = cards.some((c) => c.rank === '9');
      const hasA = cards.some((c) => c.rank === 'A');
      const has10 = cards.some((c) => c.rank === '10');
      if (hasV) {
        valetCount += 1;
        score += 17;
      }
      if (has9) {
        nineCount += 1;
        score += hasV ? 13 : 9;
      }
      if (hasA) score += hasV || has9 ? 6 : 4;
      if (has10 && (hasV || has9 || hasA)) score += 4;
      if (cards.length >= 3 && (hasV || has9)) score += 4;
    }
    if (valetCount >= 2) score += 8;
    if (valetCount >= 1 && nineCount >= 2) score += 6;
    return score;
  }

  // Contrat couleur (TREFLE, CARREAU, COEUR, PIQUE)
  const trumpCards = hand.filter((c) => c.suit === contract);
  if (trumpCards.length === 0) return 0;

  let score = 0;
  const hasV = trumpCards.some((c) => c.rank === 'V');
  const has9 = trumpCards.some((c) => c.rank === '9');
  const hasA = trumpCards.some((c) => c.rank === 'A');
  const has10 = trumpCards.some((c) => c.rank === '10');
  const hasK = trumpCards.some((c) => c.rank === 'R');
  const hasQ = trumpCards.some((c) => c.rank === 'D');

  if (hasV) score += 26;
  if (has9) score += hasV ? 19 : 14;
  if (hasA) score += 9;
  if (has10) score += 7;
  if (hasK) score += 4;
  if (hasQ) score += 3;

  // Longueur à l'atout
  if (trumpCards.length >= 2) score += 5;
  if (trumpCards.length >= 3) score += 8;
  if (trumpCards.length >= 4) score += 10;

  // Cartes maîtresses annexes (As / 10 gardés hors atout)
  for (const suit of SUITS) {
    if (suit === contract) continue;
    const side = hand.filter((c) => c.suit === suit);
    const sideAce = side.some((c) => c.rank === 'A');
    const sideTen = side.some((c) => c.rank === '10');
    if (sideAce) score += 10;
    if (sideTen && (sideAce || side.length >= 2)) score += 4;
  }

  return score;
}

function evaluateDefensiveContreStrength(
  hand: Card[],
  activeContract: ContractType,
): number {
  if (activeContract === 'SANS_ATOUT') {
    const aces = hand.filter((c) => c.rank === 'A').length;
    const guardedTens = SUITS.filter((s) => {
      const cards = hand.filter((c) => c.suit === s);
      return cards.some((c) => c.rank === '10') && cards.length >= 2;
    }).length;
    return aces * 18 + guardedTens * 8;
  }

  if (activeContract === 'TOUT_ATOUT') {
    const valets = hand.filter((c) => c.rank === 'V').length;
    const nines = hand.filter((c) => c.rank === '9').length;
    const aces = hand.filter((c) => c.rank === 'A').length;
    return valets * 17 + nines * 11 + aces * 4;
  }

  const trumps = hand.filter((c) => c.suit === activeContract);
  const hasV = trumps.some((c) => c.rank === 'V');
  const has9 = trumps.some((c) => c.rank === '9');
  const sideAces = hand.filter(
    (c) => c.suit !== activeContract && c.rank === 'A',
  ).length;

  let score = sideAces * 12;
  if (hasV) score += 20;
  if (has9) score += 15;
  if (trumps.length >= 3) score += 10;
  if (hasV && has9) score += 10;
  return score;
}

/**
 * Décision d'enchère tactique pour un joueur IA.
 * Respecte strictement :
 * - contrat obligatoire pour le 1er annonceur
 * - hiérarchie officielle des 6 contrats
 * - contre (équipe adverse uniquement) et surcontre (équipe déclarante)
 */
export function decideAiBid(ctx: AiDecisionContext): AiBidDecision {
  const myTeam = getTeamForSeat(ctx.seat);
  const mustDeclare = !ctx.activeContract && ctx.seat === ctx.firstAnnouncerSeat;

  // Évaluer les 6 contrats possibles
  const rankedContracts = CONFIRMED_CONTRACT_HIERARCHY.map((contract) => ({
    contract,
    score: evaluateHandForContract(ctx.hand, contract),
  })).sort((a, b) => b.score - a.score);

  // 1er annonceur : obligation stricte de choisir un contrat
  if (mustDeclare) {
    return { action: 'CONTRAT', contract: rankedContracts[0].contract };
  }

  // Opportunité de SURCONTRER si le contrat de notre équipe est contré
  if (
    canSeatSurcontre(
      ctx.seat,
      ctx.activeContract,
      ctx.declaringSeat,
      ctx.contreLevel,
    ) &&
    ctx.activeContract
  ) {
    const myContractScore = evaluateHandForContract(ctx.hand, ctx.activeContract);
    if (myContractScore >= 58) {
      return { action: 'SURCONTRE' };
    }
    return { action: 'PASSE' };
  }

  // Opportunité de CONTRER un contrat adverse très fragile au vu de notre jeu
  if (
    canSeatContre(
      ctx.seat,
      ctx.activeContract,
      ctx.declaringSeat,
      ctx.contreLevel,
    ) &&
    ctx.activeContract
  ) {
    const defenseScore = evaluateDefensiveContreStrength(
      ctx.hand,
      ctx.activeContract,
    );
    if (defenseScore >= 49) {
      return { action: 'CONTRE' };
    }
  }

  // Enchérir par-dessus un contrat existant (uniquement si permis par la hiérarchie)
  if (ctx.declaringSeat !== ctx.seat) {
    const partnerDeclared = ctx.declaringTeam === myTeam;
    const allowedCandidates = rankedContracts.filter((item) =>
      isContractAllowedOver(item.contract, ctx.activeContract, ctx.contreLevel),
    );

    if (allowedCandidates.length > 0) {
      const best = allowedCandidates[0];
      const baseThreshold =
        best.contract === 'SANS_ATOUT' || best.contract === 'TOUT_ATOUT'
          ? 45
          : 40;
      // Si notre partenaire a déjà annoncé, n'enchérir par-dessus que si notre main est vraiment exceptionnelle
      const threshold = partnerDeclared ? baseThreshold + 16 : baseThreshold;
      if (best.score >= threshold) {
        return { action: 'CONTRAT', contract: best.contract };
      }
    }
  }

  return { action: 'PASSE' };
}

function isPartnerCurrentlySecure(
  ctx: AiDecisionContext,
  winningEntry: TrickCard,
  contract: ContractType,
  unseenCards: Card[],
): boolean {
  // Dernier à parler du pli : le partenaire ne peut plus être battu si on ne le dépasse pas
  if (ctx.currentTrick.length === 3) return true;

  const leadSuit = ctx.currentTrick[0].card.suit;
  const winCard = winningEntry.card;

  if (contract === 'SANS_ATOUT') {
    return isCardMasterAmongUnseen(winCard, contract, unseenCards);
  }

  if (contract === 'TOUT_ATOUT') {
    return isCardMasterAmongUnseen(winCard, contract, unseenCards);
  }

  // Contrat couleur
  if (winCard.suit === contract) {
    return isCardMasterAmongUnseen(winCard, contract, unseenCards);
  }

  // Partenaire gagne à une couleur non-atout : maître seulement s'il a l'As maître et qu'il ne reste plus d'atout adverse évident
  if (winCard.suit === leadSuit) {
    const isSuitMaster = isCardMasterAmongUnseen(winCard, contract, unseenCards);
    if (!isSuitMaster) return false;
    // Vérifier s'il reste peu ou pas d'atouts hors main
    const remainingTrumps = countRemainingTrumpsUnseen(contract, unseenCards);
    return remainingTrumps <= 1;
  }

  return false;
}

function getCardSpendCost(
  card: Card,
  contract: ContractType,
  unseenCards: Card[],
): number {
  const internal = getCardInternalTrickValue(card, contract);
  const strength = getCardOrderStrength(card, contract);
  const masterBonus = isCardMasterAmongUnseen(card, contract, unseenCards) ? 25 : 0;
  const trumpBonus = isSuitTrump(card.suit, contract) ? 14 : 0;
  return internal * 3 + strength + masterBonus + trumpBonus;
}

function chooseLeadCard(
  ctx: AiDecisionContext,
  legalCards: Card[],
  contract: ContractType,
  unseenCards: Card[],
): Card {
  const myTeam = getTeamForSeat(ctx.seat);
  const isDeclaringTeam = ctx.declaringTeam === myTeam;
  const isSuitContract =
    contract !== 'SANS_ATOUT' && contract !== 'TOUT_ATOUT';

  // 1. Si notre équipe a pris un contrat couleur et qu'on a l'atout maître avec encore des atouts dehors : faire tomber les atouts
  if (isDeclaringTeam && isSuitContract) {
    const myTrumps = legalCards
      .filter((c) => c.suit === contract)
      .sort(
        (a, b) =>
          getCardOrderStrength(b, contract) - getCardOrderStrength(a, contract),
      );
    const unseenTrumps = countRemainingTrumpsUnseen(contract, unseenCards);

    if (myTrumps.length > 0 && unseenTrumps > 0) {
      const topTrump = myTrumps[0];
      if (isCardMasterAmongUnseen(topTrump, contract, unseenCards)) {
        return topTrump;
      }
    }
  }

  // 2. Jouer une carte maîtresse (hors atout couleur si défenseur, ou dans n'importe quelle couleur en SA/TA)
  const masterNonTrumps = legalCards
    .filter((c) => {
      if (isSuitContract && c.suit === contract && !isDeclaringTeam) {
        return false;
      }
      return isCardMasterAmongUnseen(c, contract, unseenCards);
    })
    .sort(
      (a, b) =>
        getCardInternalTrickValue(b, contract) -
        getCardInternalTrickValue(a, contract),
    );

  if (masterNonTrumps.length > 0) {
    return masterNonTrumps[0];
  }

  // 3. Sinon, éviter de gaspiller une forte carte (10 sec ou 9 d'atout derrière Valet dehors) : partir d'une petite carte d'une couleur longue ou sûre
  const candidates = [...legalCards].sort((a, b) => {
    const suitCountA = ctx.hand.filter((c) => c.suit === a.suit).length;
    const suitCountB = ctx.hand.filter((c) => c.suit === b.suit).length;
    const costA = getCardSpendCost(a, contract, unseenCards) - suitCountA * 2;
    const costB = getCardSpendCost(b, contract, unseenCards) - suitCountB * 2;
    return costA - costB;
  });

  return candidates[0];
}

/**
 * Choisit la meilleure carte légalement jouable sans aucune triche.
 */
export function decideAiCard(ctx: AiDecisionContext): Card {
  if (!ctx.activeContract) {
    throw new Error('Aucun contrat actif pour la décision IA.');
  }
  const contract = ctx.activeContract;
  const legalCards = getPlayableCards(
    ctx.hand,
    ctx.currentTrick,
    contract,
    ctx.seat,
  );
  if (legalCards.length === 0) {
    throw new Error(`Aucune carte jouable pour le siège ${ctx.seat}.`);
  }
  if (legalCards.length === 1) {
    return legalCards[0];
  }

  const unseenCards = getUnseenCards(ctx);

  // Entame du pli
  if (ctx.currentTrick.length === 0) {
    return chooseLeadCard(ctx, legalCards, contract, unseenCards);
  }

  const winningEntry = getWinningTrickCard(ctx.currentTrick, contract);
  if (!winningEntry) {
    return legalCards[0];
  }

  const partnerSeat = getPartnerSeat(ctx.seat);
  const partnerWinning = winningEntry.seat === partnerSeat;

  // Cas 1 : Le partenaire est actuellement maître du pli
  if (partnerWinning) {
    const partnerSecure = isPartnerCurrentlySecure(
      ctx,
      winningEntry,
      contract,
      unseenCards,
    );

    if (partnerSecure) {
      // Nourrir en points (ex: 10 déjà dépassé ou non maître) sans sacrifier une carte maîtresse (As / Valet d'atout)
      const nonMasterHighPoints = legalCards
        .filter((c) => !isCardMasterAmongUnseen(c, contract, unseenCards))
        .sort(
          (a, b) =>
            getCardInternalTrickValue(b, contract) -
            getCardInternalTrickValue(a, contract),
        );
      if (
        nonMasterHighPoints.length > 0 &&
        getCardInternalTrickValue(nonMasterHighPoints[0], contract) >= 10
      ) {
        return nonMasterHighPoints[0];
      }
    }

    // Sinon défausser la carte la moins coûteuse sans dépasser ni gaspiller
    const cheapest = [...legalCards].sort(
      (a, b) =>
        getCardSpendCost(a, contract, unseenCards) -
        getCardSpendCost(b, contract, unseenCards),
    );
    return cheapest[0];
  }

  // Cas 2 : L'adversaire est maître — évaluer quelles cartes légales prennent la main
  const winningOptions = legalCards.filter((cand) => {
    const simTrick = [...ctx.currentTrick, { seat: ctx.seat, card: cand }];
    const newWinner = getWinningTrickCard(simTrick, contract);
    return newWinner?.seat === ctx.seat;
  });

  const pointsAlreadyInTrick = ctx.currentTrick.reduce(
    (sum, tc) => sum + getCardInternalTrickValue(tc.card, contract),
    0,
  );

  if (winningOptions.length > 0) {
    // Dernier joueur du pli : prendre avec la carte gagnante la moins coûteuse
    if (ctx.currentTrick.length === 3) {
      return [...winningOptions].sort(
        (a, b) =>
          getCardSpendCost(a, contract, unseenCards) -
          getCardSpendCost(b, contract, unseenCards),
      )[0];
    }

    // 2e ou 3e joueur : privilégier une carte maîtresse si le pli vaut des points, sinon la plus économique qui gagne
    const masterWinners = winningOptions.filter((c) =>
      isCardMasterAmongUnseen(c, contract, unseenCards),
    );
    if (masterWinners.length > 0 && pointsAlreadyInTrick >= 8) {
      return [...masterWinners].sort(
        (a, b) =>
          getCardSpendCost(a, contract, unseenCards) -
          getCardSpendCost(b, contract, unseenCards),
      )[0];
    }

    return [...winningOptions].sort(
      (a, b) =>
        getCardSpendCost(a, contract, unseenCards) -
        getCardSpendCost(b, contract, unseenCards),
    )[0];
  }

  // Impossible de remporter le pli : défausser la carte la moins précieuse
  return [...legalCards].sort(
    (a, b) =>
      getCardSpendCost(a, contract, unseenCards) -
      getCardSpendCost(b, contract, unseenCards),
  )[0];
}
