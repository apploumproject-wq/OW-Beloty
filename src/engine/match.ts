import {
  Card,
  ContractType,
  MatchState,
  PlayerProfile,
  RoundLedgerEntry,
  SeatPosition,
  TurnDirection,
} from '../types/game';
import {
  createDeck32,
  dealBeloteThreeTwoThree,
  shuffleDeck,
  sortHand,
} from './cards';
import {
  canSeatContre,
  canSeatSurcontre,
  isContractAllowedOver,
} from './contracts';
import {
  buildLocalTablePlayers,
  getNextSeat,
  getPreviousSeat,
  getTeamForSeat,
  getTurnOrderStartingFrom,
  pickRandomSeat,
} from './players';
import { calculateRoundScore, evaluateMatchVictory } from './scoring';
import {
  detectCapot,
  evaluateRoundCardPointsAndWinner,
  getPlayableCards,
  resolveCompletedTrick,
} from './tricks';

function dealInitialFiveCards(
  players: MatchState['players'],
  firstAnnouncerSeat: SeatPosition,
  sortBySuit: boolean,
): {
  players: MatchState['players'];
  remainingCardsBySeat: Record<SeatPosition, Card[]>;
} {
  const deck = shuffleDeck(createDeck32());
  // Distribution en sens antihoraire à partir du premier annonceur : 3 puis 2 = 5 cartes
  const seatOrder = getTurnOrderStartingFrom(firstAnnouncerSeat, 'ANTI_HORAIRE');
  const deal = dealBeloteThreeTwoThree(deck, seatOrder);

  const sortIfEnabled = (cards: Card[]) => (sortBySuit ? sortHand(cards, null) : cards);

  return {
    players: {
      SUD: { ...players.SUD, hand: sortIfEnabled(deal.firstFiveBySeat.SUD) },
      EST: { ...players.EST, hand: sortIfEnabled(deal.firstFiveBySeat.EST) },
      NORD: { ...players.NORD, hand: sortIfEnabled(deal.firstFiveBySeat.NORD) },
      OUEST: { ...players.OUEST, hand: sortIfEnabled(deal.firstFiveBySeat.OUEST) },
    },
    remainingCardsBySeat: deal.remainingThreeBySeat,
  };
}

export function distributeRemainingThreeCards(
  state: MatchState,
  sortBySuit = true,
): MatchState {
  const combine = (seat: SeatPosition): Card[] => {
    const fullHand = [
      ...state.players[seat].hand,
      ...state.remainingCardsBySeat[seat],
    ];
    return sortBySuit ? sortHand(fullHand, state.activeContract) : fullHand;
  };

  return {
    ...state,
    players: {
      SUD: { ...state.players.SUD, hand: combine('SUD') },
      EST: { ...state.players.EST, hand: combine('EST') },
      NORD: { ...state.players.NORD, hand: combine('NORD') },
      OUEST: { ...state.players.OUEST, hand: combine('OUEST') },
    },
    remainingCardsBySeat: {
      SUD: [],
      EST: [],
      NORD: [],
      OUEST: [],
    },
  };
}

export function createNewMatch(
  localProfile: PlayerProfile,
  turnDirection: TurnDirection = 'ANTI_HORAIRE',
  sortBySuit = true,
  seatOverrides?: Partial<Record<SeatPosition, PlayerProfile>>,
  initialFirstAnnouncer?: SeatPosition,
): MatchState {
  const basePlayers = buildLocalTablePlayers(localProfile, seatOverrides);
  const firstAnnouncerSeat = initialFirstAnnouncer ?? pickRandomSeat();
  const dealerSeat = getPreviousSeat(firstAnnouncerSeat, 'ANTI_HORAIRE');
  const dealt = dealInitialFiveCards(basePlayers, firstAnnouncerSeat, sortBySuit);

  return {
    matchId: `match-${Date.now()}`,
    roundNumber: 1,
    phase: 'ENCHERES',
    turnDirection,
    dealerSeat,
    firstAnnouncerSeat,
    currentTurnSeat: firstAnnouncerSeat,
    players: dealt.players,
    remainingCardsBySeat: dealt.remainingCardsBySeat,
    scores: {
      EQUIPE_A: 0,
      EQUIPE_B: 0,
    },
    activeContract: null,
    declaringSeat: null,
    declaringTeam: null,
    contreBySeat: null,
    contreLevel: 'AUCUN',
    consecutivePasses: 0,
    bidHistory: [],
    currentTrick: [],
    currentTrickLeader: firstAnnouncerSeat,
    completedTricks: [],
    ledger: [],
    winnerTeam: null,
    victoryReason: null,
  };
}

export function startNextRound(state: MatchState, sortBySuit = true): MatchState {
  if (state.phase === 'FIN_PARTIE') return state;

  // Pour les manches suivantes, le premier annonceur tourne d'un siège dans le sens inverse des aiguilles d'une montre
  const nextFirstAnnouncer = getNextSeat(state.firstAnnouncerSeat, 'ANTI_HORAIRE');
  const nextDealer = getPreviousSeat(nextFirstAnnouncer, 'ANTI_HORAIRE');
  const dealt = dealInitialFiveCards(state.players, nextFirstAnnouncer, sortBySuit);

  return {
    ...state,
    roundNumber: state.roundNumber + 1,
    phase: 'ENCHERES',
    dealerSeat: nextDealer,
    firstAnnouncerSeat: nextFirstAnnouncer,
    currentTurnSeat: nextFirstAnnouncer,
    players: dealt.players,
    remainingCardsBySeat: dealt.remainingCardsBySeat,
    activeContract: null,
    declaringSeat: null,
    declaringTeam: null,
    contreBySeat: null,
    contreLevel: 'AUCUN',
    consecutivePasses: 0,
    bidHistory: [],
    currentTrick: [],
    currentTrickLeader: nextFirstAnnouncer,
    completedTricks: [],
  };
}

export function applyBidPass(
  state: MatchState,
  seat: SeatPosition,
  sortBySuit = true,
): MatchState {
  if (state.phase !== 'ENCHERES' || state.currentTurnSeat !== seat) return state;

  // Le premier annonceur est obligé de choisir un contrat et ne peut pas passer
  if (!state.activeContract && seat === state.firstAnnouncerSeat) {
    return state;
  }

  const nextPasses = state.consecutivePasses + 1;
  const bidHistory = [...state.bidHistory, { seat, action: 'PASSE' as const }];

  // Un contrat existe et les 3 joueurs suivants passent : on distribue les 3 dernières cartes et le jeu commence
  if (state.activeContract && nextPasses >= 3) {
    const withAllEightCards = distributeRemainingThreeCards(
      {
        ...state,
        phase: 'JEU',
        currentTurnSeat: state.firstAnnouncerSeat,
        currentTrickLeader: state.firstAnnouncerSeat,
        consecutivePasses: nextPasses,
        bidHistory,
      },
      sortBySuit,
    );
    return withAllEightCards;
  }

  return {
    ...state,
    currentTurnSeat: getNextSeat(seat, 'ANTI_HORAIRE'),
    consecutivePasses: nextPasses,
    bidHistory,
  };
}

export function applyBidContract(
  state: MatchState,
  seat: SeatPosition,
  contract: ContractType,
): MatchState {
  if (state.phase !== 'ENCHERES' || state.currentTurnSeat !== seat) return state;
  if (state.declaringSeat === seat) return state;
  if (!isContractAllowedOver(contract, state.activeContract, state.contreLevel)) {
    return state;
  }

  return {
    ...state,
    activeContract: contract,
    declaringSeat: seat,
    declaringTeam: getTeamForSeat(seat),
    contreBySeat: null,
    contreLevel: 'AUCUN',
    consecutivePasses: 0,
    bidHistory: [...state.bidHistory, { seat, action: 'CONTRAT', contract }],
    currentTurnSeat: getNextSeat(seat, 'ANTI_HORAIRE'),
  };
}

export function applyBidContre(state: MatchState, seat: SeatPosition): MatchState {
  if (state.phase !== 'ENCHERES' || state.currentTurnSeat !== seat) return state;
  if (!canSeatContre(seat, state.activeContract, state.declaringSeat, state.contreLevel)) {
    return state;
  }

  return {
    ...state,
    contreBySeat: seat,
    contreLevel: 'CONTRE',
    consecutivePasses: 0,
    bidHistory: [...state.bidHistory, { seat, action: 'CONTRE' }],
    currentTurnSeat: getNextSeat(seat, 'ANTI_HORAIRE'),
  };
}

export function applyBidSurcontre(state: MatchState, seat: SeatPosition): MatchState {
  if (state.phase !== 'ENCHERES' || state.currentTurnSeat !== seat) return state;
  if (!canSeatSurcontre(seat, state.activeContract, state.declaringSeat, state.contreLevel)) {
    return state;
  }

  return {
    ...state,
    contreLevel: 'SURCONTRE',
    consecutivePasses: 0,
    bidHistory: [...state.bidHistory, { seat, action: 'SURCONTRE' }],
    currentTurnSeat: getNextSeat(seat, 'ANTI_HORAIRE'),
  };
}

export function applyPlayCard(
  state: MatchState,
  seat: SeatPosition,
  cardId: string,
): MatchState {
  if (state.phase !== 'JEU' || state.currentTurnSeat !== seat || !state.activeContract) {
    return state;
  }

  const player = state.players[seat];
  const playable = getPlayableCards(
    player.hand,
    state.currentTrick,
    state.activeContract,
    seat,
  );
  const chosenCard = playable.find((c) => c.id === cardId);
  if (!chosenCard) {
    return state;
  }

  const remainingHand = player.hand.filter((c) => c.id !== cardId);
  const updatedPlayers: MatchState['players'] = {
    ...state.players,
    [seat]: {
      ...player,
      hand: remainingHand,
    },
  };

  const nextTrick = [...state.currentTrick, { seat, card: chosenCard }];

  // Si le pli n'est pas encore complet (< 4 cartes)
  if (nextTrick.length < 4) {
    return {
      ...state,
      players: updatedPlayers,
      currentTrick: nextTrick,
      currentTurnSeat: getNextSeat(seat, state.turnDirection),
    };
  }

  // Pli complet (4 cartes)
  const resolvedTrick = resolveCompletedTrick(
    state.completedTricks.length + 1,
    nextTrick,
    state.activeContract,
  );
  const updatedCompletedTricks = [...state.completedTricks, resolvedTrick];

  // Si les 8 plis de la donne ne sont pas encore terminés
  if (updatedCompletedTricks.length < 8) {
    return {
      ...state,
      players: updatedPlayers,
      currentTrick: [],
      currentTrickLeader: resolvedTrick.winnerSeat,
      currentTurnSeat: resolvedTrick.winnerSeat,
      completedTricks: updatedCompletedTricks,
    };
  }

  // Fin des 8 plis :
  // 1. Priorité absolue : détection du capot
  const declaringTeam = state.declaringTeam!;
  const declaringSeat = state.declaringSeat!;
  const capotByTeam = detectCapot(updatedCompletedTricks);

  // 2. Décompte des points des cartes remportées (sans jamais les ajouter au cumulatif)
  const cardEval = evaluateRoundCardPointsAndWinner(
    updatedCompletedTricks,
    state.activeContract,
    declaringTeam,
  );

  const roundWinningTeam = capotByTeam ?? cardEval.roundWinningTeam;
  const contractSucceeded = capotByTeam
    ? capotByTeam === declaringTeam
    : cardEval.contractSucceeded;

  // 3. Calcul du score OW'Beloty uniquement via le moteur pur
  const scoreResult = calculateRoundScore({
    contract: state.activeContract,
    declaringTeam,
    roundWinningTeam,
    capotByTeam,
    contreLevel: state.contreLevel,
  });

  const newScoreA = state.scores.EQUIPE_A + scoreResult.pointsAwardedA;
  const newScoreB = state.scores.EQUIPE_B + scoreResult.pointsAwardedB;
  const victory = evaluateMatchVictory(newScoreA, newScoreB, scoreResult);

  const tricksWonA = updatedCompletedTricks.filter(
    (t) => t.winnerTeam === 'EQUIPE_A',
  ).length;
  const tricksWonB = 8 - tricksWonA;

  const ledgerEntry: RoundLedgerEntry = {
    roundNumber: state.roundNumber,
    dealerSeat: state.dealerSeat,
    firstAnnouncerSeat: state.firstAnnouncerSeat,
    contract: state.activeContract,
    declaringSeat,
    declaringTeam,
    contreLevel: state.contreLevel,
    tricksWonA,
    tricksWonB,
    cardPointsA: cardEval.cardPointsA,
    cardPointsB: cardEval.cardPointsB,
    contractSucceeded,
    capotByTeam,
    pointsAwardedA: scoreResult.pointsAwardedA,
    pointsAwardedB: scoreResult.pointsAwardedB,
    totalAfterA: newScoreA,
    totalAfterB: newScoreB,
    ruleAppliedLabel: scoreResult.ruleAppliedLabel,
  };

  return {
    ...state,
    phase: victory.winnerTeam ? 'FIN_PARTIE' : 'FIN_DONNE',
    players: updatedPlayers,
    currentTrick: [],
    completedTricks: updatedCompletedTricks,
    scores: {
      EQUIPE_A: newScoreA,
      EQUIPE_B: newScoreB,
    },
    ledger: [...state.ledger, ledgerEntry],
    winnerTeam: victory.winnerTeam,
    victoryReason: victory.reason,
  };
}
