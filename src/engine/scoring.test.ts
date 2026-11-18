import {
  Card,
  CompletedTrick,
  ContractType,
  ContreLevel,
  PlayerProfile,
  SeatPosition,
  TeamId,
} from '../types/game';
import {
  createDeck32,
  dealBeloteThreeTwoThree,
  dealFourHands,
  shuffleDeck,
} from './cards';
import {
  canSeatContre,
  canSeatSurcontre,
  CONFIRMED_CONTRACT_HIERARCHY,
  isContractAllowedOver,
} from './contracts';
import {
  applyBidContract,
  applyBidContre,
  applyBidPass,
  applyBidSurcontre,
  applyPlayCard,
  createNewMatch,
  startNextRound,
} from './match';
import { localHotspotAdapter } from './networkAdapter';
import {
  getTurnOrderStartingFrom,
  pickRandomSeat,
} from './players';
import { calculateRoundScore, evaluateMatchVictory, TARGET_MATCH_SCORE } from './scoring';
import {
  detectCapot,
  evaluateRoundCardPointsAndWinner,
  getPlayableCards,
} from './tricks';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Attendu ${String(expected)}, reçu ${String(actual)}`,
    );
  }
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  details: string;
}

function makeTricks(winners: TeamId[]): CompletedTrick[] {
  return winners.map((team, idx) => ({
    index: idx + 1,
    leader: 'SUD',
    cards: [
      { seat: 'SUD', card: { id: `PIQUE_${7 + (idx % 2)}`, suit: 'PIQUE', rank: idx % 2 === 0 ? '7' : '8' } },
      { seat: 'EST', card: { id: 'COEUR_7', suit: 'COEUR', rank: '7' } },
      { seat: 'NORD', card: { id: 'CARREAU_7', suit: 'CARREAU', rank: '7' } },
      { seat: 'OUEST', card: { id: 'TREFLE_7', suit: 'TREFLE', rank: '7' } },
    ],
    winnerSeat: team === 'EQUIPE_A' ? 'SUD' : 'EST',
    winnerTeam: team,
  }));
}

export function runAllEngineTests(): TestCaseResult[] {
  const results: TestCaseResult[] = [];

  const test = (name: string, fn: () => void) => {
    try {
      fn();
      results.push({ name, passed: true, details: 'OK' });
    } catch (err) {
      results.push({
        name,
        passed: false,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 1. Jeu simple : 6 contrats
  const simpleCases: Array<[ContractType, number]> = [
    ['TREFLE', 32],
    ['CARREAU', 16],
    ['COEUR', 16],
    ['PIQUE', 16],
    ['SANS_ATOUT', 52],
    ['TOUT_ATOUT', 26],
  ];

  for (const [contract, expected] of simpleCases) {
    test(`Jeu simple ${contract} = ${expected} pts (perdant = 0)`, () => {
      const resA = calculateRoundScore({
        contract,
        declaringTeam: 'EQUIPE_A',
        roundWinningTeam: 'EQUIPE_A',
        capotByTeam: null,
        contreLevel: 'AUCUN',
      });
      assertEqual(resA.pointsAwardedA, expected);
      assertEqual(resA.pointsAwardedB, 0);
      assertEqual(resA.isInstantMatchWin, false);

      const resB = calculateRoundScore({
        contract,
        declaringTeam: 'EQUIPE_A',
        roundWinningTeam: 'EQUIPE_B',
        capotByTeam: null,
        contreLevel: 'AUCUN',
      });
      assertEqual(resB.pointsAwardedA, 0);
      assertEqual(resB.pointsAwardedB, expected);
    });
  }

  // 2. Contre (× 2) et Surcontre (× 4 avec exceptions Trèfle et Sans Atout)
  const multiplierCases: Array<[ContractType, ContreLevel, number]> = [
    ['TREFLE', 'CONTRE', 64],
    ['TREFLE', 'SURCONTRE', 64], // Exception Trèfle : pas de multiplicateur supplémentaire
    ['CARREAU', 'CONTRE', 32],
    ['CARREAU', 'SURCONTRE', 64],
    ['COEUR', 'CONTRE', 32],
    ['COEUR', 'SURCONTRE', 64],
    ['PIQUE', 'CONTRE', 32],
    ['PIQUE', 'SURCONTRE', 64],
    ['SANS_ATOUT', 'CONTRE', 104],
    ['SANS_ATOUT', 'SURCONTRE', 104], // Exception Sans Atout : pas de multiplicateur supplémentaire
    ['TOUT_ATOUT', 'CONTRE', 52],
    ['TOUT_ATOUT', 'SURCONTRE', 104],
  ];

  for (const [contract, contreLevel, expected] of multiplierCases) {
    test(`${contract} ${contreLevel} = ${expected} pts`, () => {
      const res = calculateRoundScore({
        contract,
        declaringTeam: 'EQUIPE_A',
        roundWinningTeam: 'EQUIPE_A',
        capotByTeam: null,
        contreLevel,
      });
      assertEqual(res.pointsAwardedA, expected);
      assertEqual(res.pointsAwardedB, 0);
    });
  }

  // 3. Capot contrat couleur -> victoire immédiate quel que soit le score
  const suitContracts: ContractType[] = ['TREFLE', 'CARREAU', 'COEUR', 'PIQUE'];
  for (const contract of suitContracts) {
    test(`Capot couleur ${contract} -> victoire immédiate`, () => {
      const res = calculateRoundScore({
        contract,
        declaringTeam: 'EQUIPE_A',
        roundWinningTeam: 'EQUIPE_B', // même si l'adversaire fait capot
        capotByTeam: 'EQUIPE_B',
        contreLevel: 'SURCONTRE',
      });
      assertEqual(res.isInstantMatchWin, true);
      assertEqual(res.instantWinnerTeam, 'EQUIPE_B');

      const victory = evaluateMatchVictory(140, 0, res);
      assertEqual(victory.winnerTeam, 'EQUIPE_B');
      assertEqual(victory.reason, 'CAPOT_COULEUR');
    });
  }

  // 4. Capot Sans Atout -> 90 pts + contre (180) + exception surcontre (180)
  test('Capot Sans Atout simple = 90 pts', () => {
    const res = calculateRoundScore({
      contract: 'SANS_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_A',
      capotByTeam: 'EQUIPE_A',
      contreLevel: 'AUCUN',
    });
    assertEqual(res.pointsAwardedA, 90);
    assertEqual(res.pointsAwardedB, 0);
    assertEqual(res.isInstantMatchWin, false);
  });

  test('Capot Sans Atout contré = 180 pts et surcontré = 180 pts (exception)', () => {
    const resContre = calculateRoundScore({
      contract: 'SANS_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_B',
      capotByTeam: 'EQUIPE_B',
      contreLevel: 'CONTRE',
    });
    assertEqual(resContre.pointsAwardedB, 180);

    const resSurcontre = calculateRoundScore({
      contract: 'SANS_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_B',
      capotByTeam: 'EQUIPE_B',
      contreLevel: 'SURCONTRE',
    });
    assertEqual(resSurcontre.pointsAwardedB, 180);
  });

  // 5. Capot Tout Atout -> 35 (déclarante) / 45 (adverse) × 2 (contré) × 2 (surcontré)
  test('Capot Tout Atout équipe déclarante : 35 / 70 / 140', () => {
    const r0 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_A',
      capotByTeam: 'EQUIPE_A',
      contreLevel: 'AUCUN',
    });
    const r1 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_A',
      capotByTeam: 'EQUIPE_A',
      contreLevel: 'CONTRE',
    });
    const r2 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_A',
      capotByTeam: 'EQUIPE_A',
      contreLevel: 'SURCONTRE',
    });
    assertEqual(r0.pointsAwardedA, 35);
    assertEqual(r1.pointsAwardedA, 70);
    assertEqual(r2.pointsAwardedA, 140);
  });

  test('Capot Tout Atout équipe adverse : 45 / 90 / 180', () => {
    const r0 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_B',
      capotByTeam: 'EQUIPE_B',
      contreLevel: 'AUCUN',
    });
    const r1 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_B',
      capotByTeam: 'EQUIPE_B',
      contreLevel: 'CONTRE',
    });
    const r2 = calculateRoundScore({
      contract: 'TOUT_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_B',
      capotByTeam: 'EQUIPE_B',
      contreLevel: 'SURCONTRE',
    });
    assertEqual(r0.pointsAwardedB, 45);
    assertEqual(r1.pointsAwardedB, 90);
    assertEqual(r2.pointsAwardedB, 180);
  });

  // 6. Objectif de 150 points
  test('Fin de partie à 150 points exactement (149 continue, 150 gagne)', () => {
    const sampleRound = calculateRoundScore({
      contract: 'COEUR',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: 'EQUIPE_A',
      capotByTeam: null,
      contreLevel: 'AUCUN',
    });
    assertEqual(TARGET_MATCH_SCORE, 150);
    assertEqual(evaluateMatchVictory(149, 132, sampleRound).winnerTeam, null);
    const winA = evaluateMatchVictory(150, 148, sampleRound);
    assertEqual(winA.winnerTeam, 'EQUIPE_A');
    assertEqual(winA.reason, 'OBJECTIF_150');
  });

  // 7. Paquet de 32 cartes et détection du capot (8 plis)
  test('Paquet de 32 cartes uniques distribuées en 4 mains de 8 cartes', () => {
    const deck = shuffleDeck(createDeck32());
    assertEqual(deck.length, 32);
    const uniqueIds = new Set(deck.map((c) => c.id));
    assertEqual(uniqueIds.size, 32);
    const hands = dealFourHands(deck);
    assertEqual(hands.length, 4);
    hands.forEach((h) => assertEqual(h.length, 8));
  });

  test('Détection du capot uniquement sur 8 plis gagnés par la même équipe', () => {
    const allA = makeTricks(Array(8).fill('EQUIPE_A'));
    assertEqual(detectCapot(allA), 'EQUIPE_A');

    const split = makeTricks([
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_A',
      'EQUIPE_B',
    ]);
    assertEqual(detectCapot(split), null);
  });

  // 8. Nouveaux tests obligatoires : distribution 3+2+3, premier annonceur, contre/surcontre, points de cartes
  const dummyProfile: PlayerProfile = {
    id: 'test-profile',
    pseudo: 'Testeur',
    avatarDataUrl: null,
    updatedAt: 1,
    deviceTag: 'Test',
  };

  test('Distribution en deux étapes 3 + 2 avant annonces puis + 3 après validation', () => {
    const deck = createDeck32();
    const order = getTurnOrderStartingFrom('SUD', 'ANTI_HORAIRE');
    const deal = dealBeloteThreeTwoThree(deck, order);

    for (const seat of order) {
      assertEqual(deal.stageOneCounts[seat], 3);
      assertEqual(deal.stageTwoCounts[seat], 2);
      assertEqual(deal.firstFiveBySeat[seat].length, 5);
      assertEqual(deal.remainingThreeBySeat[seat].length, 3);
    }

    const match = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    assertEqual(match.players.SUD.hand.length, 5);
    assertEqual(match.players.EST.hand.length, 5);
    assertEqual(match.players.NORD.hand.length, 5);
    assertEqual(match.players.OUEST.hand.length, 5);
    assertEqual(match.remainingCardsBySeat.SUD.length, 3);

    // Le premier annonceur choisit un contrat, les 3 autres passent -> 8 cartes distribuées
    let next = applyBidContract(match, 'SUD', 'TREFLE');
    next = applyBidPass(next, 'EST', false);
    next = applyBidPass(next, 'NORD', false);
    next = applyBidPass(next, 'OUEST', false);

    assertEqual(next.phase, 'JEU');
    assertEqual(next.players.SUD.hand.length, 8);
    assertEqual(next.players.EST.hand.length, 8);
    assertEqual(next.players.NORD.hand.length, 8);
    assertEqual(next.players.OUEST.hand.length, 8);
    assertEqual(next.remainingCardsBySeat.SUD.length, 0);

    const allIds = new Set([
      ...next.players.SUD.hand.map((c) => c.id),
      ...next.players.EST.hand.map((c) => c.id),
      ...next.players.NORD.hand.map((c) => c.id),
      ...next.players.OUEST.hand.map((c) => c.id),
    ]);
    assertEqual(allIds.size, 32);
  });

  test('Premier annonceur aléatoire et interdiction de passer en ouverture', () => {
    assertEqual(pickRandomSeat(() => 0.0), 'SUD');
    assertEqual(pickRandomSeat(() => 0.26), 'EST');
    assertEqual(pickRandomSeat(() => 0.51), 'NORD');
    assertEqual(pickRandomSeat(() => 0.76), 'OUEST');

    const match = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'NORD');
    assertEqual(match.firstAnnouncerSeat, 'NORD');
    assertEqual(match.currentTurnSeat, 'NORD');

    // Tentative de passer par le premier annonceur -> bloquée
    const afterAttemptedPass = applyBidPass(match, 'NORD');
    assertEqual(afterAttemptedPass.currentTurnSeat, 'NORD');
    assertEqual(afterAttemptedPass.bidHistory.length, 0);
  });

  test('Rotation antihoraire du premier annonceur sur les manches suivantes', () => {
    const r1 = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    assertEqual(r1.firstAnnouncerSeat, 'SUD');

    const r2 = startNextRound(r1, false);
    assertEqual(r2.firstAnnouncerSeat, 'EST');
    assertEqual(r2.currentTurnSeat, 'EST');

    const r3 = startNextRound(r2, false);
    assertEqual(r3.firstAnnouncerSeat, 'NORD');

    const r4 = startNextRound(r3, false);
    assertEqual(r4.firstAnnouncerSeat, 'OUEST');

    const r5 = startNextRound(r4, false);
    assertEqual(r5.firstAnnouncerSeat, 'SUD');
  });

  test('Interdiction de contrer son partenaire et droit conservé du premier annonceur', () => {
    // SUD (Équipe A) annonce, NORD (partenaire) ne peut pas contrer
    assertEqual(canSeatContre('NORD', 'COEUR', 'SUD', 'AUCUN'), false);
    assertEqual(canSeatContre('SUD', 'COEUR', 'SUD', 'AUCUN'), false);
    assertEqual(canSeatContre('EST', 'COEUR', 'SUD', 'AUCUN'), true);
    assertEqual(canSeatContre('OUEST', 'COEUR', 'SUD', 'AUCUN'), true);

    // Le premier annonceur (SUD) annonce Trèfle, puis EST annonce Sans Atout -> SUD garde le droit de contrer
    let m = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    m = applyBidContract(m, 'SUD', 'TREFLE');
    m = applyBidContract(m, 'EST', 'SANS_ATOUT');
    m = applyBidPass(m, 'NORD');
    m = applyBidPass(m, 'OUEST');
    assertEqual(m.currentTurnSeat, 'SUD');
    assertEqual(canSeatContre('SUD', m.activeContract, m.declaringSeat, m.contreLevel), true);
    m = applyBidContre(m, 'SUD');
    assertEqual(m.contreLevel, 'CONTRE');
  });

  test('Autorisation de surcontre par le déclarant ou son partenaire et interdiction à l’équipe adverse', () => {
    // SUD (Équipe A) déclare, EST (Équipe B) contre
    // SUD (déclarant) ET NORD (partenaire du déclarant) peuvent surcontrer
    assertEqual(canSeatSurcontre('SUD', 'PIQUE', 'SUD', 'CONTRE'), true);
    assertEqual(canSeatSurcontre('NORD', 'PIQUE', 'SUD', 'CONTRE'), true);
    // EST et OUEST (équipe adverse) ne peuvent pas surcontrer
    assertEqual(canSeatSurcontre('EST', 'PIQUE', 'SUD', 'CONTRE'), false);
    assertEqual(canSeatSurcontre('OUEST', 'PIQUE', 'SUD', 'CONTRE'), false);

    // Vérification intégrée en enchères : NORD surcontre le contrat de SUD contré par EST
    let m = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    m = applyBidContract(m, 'SUD', 'PIQUE');
    m = applyBidContre(m, 'EST');
    assertEqual(m.contreLevel, 'CONTRE');
    m = applyBidSurcontre(m, 'NORD');
    assertEqual(m.contreLevel, 'SURCONTRE');
  });

  test('Contrat réussi (strictement plus de points de cartes que l’adversaire)', () => {
    // Sans Atout (120 pts de cartes au total) : Équipe A gagne les 7 premiers plis (120 pts),
    // Équipe B gagne le 8e pli avec uniquement des 7/8/9 (0 pt).
    const all32 = createDeck32();
    const zeroTrickCards = [
      all32.find((c) => c.id === 'TREFLE_7')!,
      all32.find((c) => c.id === 'TREFLE_8')!,
      all32.find((c) => c.id === 'TREFLE_9')!,
      all32.find((c) => c.id === 'CARREAU_7')!,
    ];
    const zeroIds = new Set(zeroTrickCards.map((c) => c.id));
    const teamACards = all32.filter((c) => !zeroIds.has(c.id));

    const tricks: CompletedTrick[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        index: i + 1,
        leader: 'SUD' as SeatPosition,
        cards: [
          { seat: 'SUD' as SeatPosition, card: teamACards[i * 4] },
          { seat: 'EST' as SeatPosition, card: teamACards[i * 4 + 1] },
          { seat: 'NORD' as SeatPosition, card: teamACards[i * 4 + 2] },
          { seat: 'OUEST' as SeatPosition, card: teamACards[i * 4 + 3] },
        ],
        winnerSeat: 'SUD' as SeatPosition,
        winnerTeam: 'EQUIPE_A' as TeamId,
      })),
      {
        index: 8,
        leader: 'SUD',
        cards: [
          { seat: 'SUD', card: zeroTrickCards[0] },
          { seat: 'EST', card: zeroTrickCards[1] },
          { seat: 'NORD', card: zeroTrickCards[2] },
          { seat: 'OUEST', card: zeroTrickCards[3] },
        ],
        winnerSeat: 'EST',
        winnerTeam: 'EQUIPE_B',
      },
    ];

    const ev = evaluateRoundCardPointsAndWinner(tricks, 'SANS_ATOUT', 'EQUIPE_A');
    assertEqual(ev.cardPointsA, 120);
    assertEqual(ev.cardPointsB, 10); // 0 + 10 de der (dernier pli)
    assertEqual(ev.contractSucceeded, true);
    assertEqual(ev.roundWinningTeam, 'EQUIPE_A');
  });

  test('Contrat échoué (moins de points de cartes -> points OW’Beloty à l’adversaire)', () => {
    // Sans Atout : Équipe A (déclarante) gagne uniquement le 1er pli (11 pts),
    // Équipe B gagne les 7 plis suivants (109 pts).
    const all32 = createDeck32();
    const firstTrickCards = [
      all32.find((c) => c.id === 'TREFLE_A')!, // 11 pts
      all32.find((c) => c.id === 'TREFLE_7')!, // 0
      all32.find((c) => c.id === 'TREFLE_8')!, // 0
      all32.find((c) => c.id === 'TREFLE_9')!, // 0
    ];
    const firstIds = new Set(firstTrickCards.map((c) => c.id));
    const teamBCards = all32.filter((c) => !firstIds.has(c.id));

    const tricks: CompletedTrick[] = [
      {
        index: 1,
        leader: 'SUD',
        cards: [
          { seat: 'SUD', card: firstTrickCards[0] },
          { seat: 'EST', card: firstTrickCards[1] },
          { seat: 'NORD', card: firstTrickCards[2] },
          { seat: 'OUEST', card: firstTrickCards[3] },
        ],
        winnerSeat: 'SUD',
        winnerTeam: 'EQUIPE_A',
      },
      ...Array.from({ length: 7 }, (_, i) => ({
        index: i + 2,
        leader: 'SUD' as SeatPosition,
        cards: [
          { seat: 'SUD' as SeatPosition, card: teamBCards[i * 4] },
          { seat: 'EST' as SeatPosition, card: teamBCards[i * 4 + 1] },
          { seat: 'NORD' as SeatPosition, card: teamBCards[i * 4 + 2] },
          { seat: 'OUEST' as SeatPosition, card: teamBCards[i * 4 + 3] },
        ],
        winnerSeat: 'EST' as SeatPosition,
        winnerTeam: 'EQUIPE_B' as TeamId,
      })),
    ];

    const ev = evaluateRoundCardPointsAndWinner(tricks, 'SANS_ATOUT', 'EQUIPE_A');
    assertEqual(ev.cardPointsA, 11);
    assertEqual(ev.cardPointsB, 119); // 109 + 10 de der (dernier pli)
    assertEqual(ev.contractSucceeded, false);
    assertEqual(ev.roundWinningTeam, 'EQUIPE_B');

    const score = calculateRoundScore({
      contract: 'SANS_ATOUT',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: ev.roundWinningTeam,
      capotByTeam: null,
      contreLevel: 'AUCUN',
    });
    assertEqual(score.pointsAwardedA, 0);
    assertEqual(score.pointsAwardedB, 52);
  });

  test('Égalité exacte de points de cartes + 10 de der (65 vs 65) -> échec du contrat et points à l’adversaire', () => {
    // Sans Atout avec les 32 cartes : total = 120 pts cartes + 10 pts dernier pli (10 de der) = 130 pts.
    // Équipe A (déclarante) prend 65 pts de cartes (plis 1..4).
    // Équipe B prend 55 pts de cartes + 10 de der (plis 5..8) = 65 pts -> égalité exacte 65 à 65.
    const all32 = createDeck32();
    const byId = (id: string) => all32.find((c) => c.id === id)!;

    const trickCards: Card[][] = [
      // Plis 1..4 (Équipe A = 28 + 2 + 28 + 7 = 65 pts)
      [byId('PIQUE_A'), byId('PIQUE_10'), byId('PIQUE_R'), byId('PIQUE_D')],
      [byId('PIQUE_V'), byId('PIQUE_9'), byId('PIQUE_8'), byId('PIQUE_7')],
      [byId('COEUR_A'), byId('COEUR_10'), byId('COEUR_R'), byId('COEUR_D')],
      [byId('COEUR_V'), byId('CARREAU_D'), byId('CARREAU_V'), byId('TREFLE_7')],
      // Plis 5..8 (Équipe B = 0 + 25 + 21 + 9 + 10 de der = 65 pts)
      [byId('COEUR_9'), byId('COEUR_8'), byId('COEUR_7'), byId('TREFLE_8')],
      [byId('CARREAU_A'), byId('CARREAU_10'), byId('CARREAU_R'), byId('CARREAU_9')],
      [byId('CARREAU_8'), byId('CARREAU_7'), byId('TREFLE_A'), byId('TREFLE_10')],
      [byId('TREFLE_R'), byId('TREFLE_D'), byId('TREFLE_V'), byId('TREFLE_9')],
    ];

    const equalTricks: CompletedTrick[] = trickCards.map((cards, idx) => ({
      index: idx + 1,
      leader: 'SUD',
      cards: [
        { seat: 'SUD', card: cards[0] },
        { seat: 'EST', card: cards[1] },
        { seat: 'NORD', card: cards[2] },
        { seat: 'OUEST', card: cards[3] },
      ],
      winnerSeat: idx < 4 ? 'SUD' : 'EST',
      winnerTeam: idx < 4 ? 'EQUIPE_A' : 'EQUIPE_B',
    }));

    const ev = evaluateRoundCardPointsAndWinner(
      equalTricks,
      'SANS_ATOUT',
      'EQUIPE_A',
    );
    assertEqual(ev.cardPointsA, 65);
    assertEqual(ev.cardPointsB, 65);
    assertEqual(ev.contractSucceeded, false);
    assertEqual(ev.roundWinningTeam, 'EQUIPE_B');

    const score = calculateRoundScore({
      contract: 'TREFLE',
      declaringTeam: 'EQUIPE_A',
      roundWinningTeam: ev.roundWinningTeam,
      capotByTeam: null,
      contreLevel: 'CONTRE',
    });
    assertEqual(score.pointsAwardedA, 0);
    assertEqual(score.pointsAwardedB, 64);
  });

  test('Absence d’ajout des points des cartes au score cumulatif sur une manche complète', () => {
    // On joue une manche complète de 8 plis avec contrat COEUR (16 pts) et on vérifie
    // que le cumul final est exactement 16 (ou 0 si capot couleur), jamais les points de cartes (ex. 80..152)
    let state = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    state = applyBidContract(state, 'SUD', 'COEUR');
    state = applyBidPass(state, 'EST', false);
    state = applyBidPass(state, 'NORD', false);
    state = applyBidPass(state, 'OUEST', false);

    assertEqual(state.phase, 'JEU');
    for (let step = 0; step < 32; step++) {
      const seat = state.currentTurnSeat;
      const hand = state.players[seat].hand;
      const playable = hand.filter((c) => {
        const next = applyPlayCard(state, seat, c.id);
        return next !== state;
      });
      assertEqual(playable.length > 0, true);
      state = applyPlayCard(state, seat, playable[0].id);
    }

    assertEqual(state.ledger.length, 1);
    const entry = state.ledger[0];
    if (entry.capotByTeam) {
      assertEqual(state.phase, 'FIN_PARTIE');
      assertEqual(state.scores.EQUIPE_A, 0);
      assertEqual(state.scores.EQUIPE_B, 0);
    } else {
      assertEqual(state.scores.EQUIPE_A + state.scores.EQUIPE_B, 16);
      assertEqual(state.scores.EQUIPE_A === 16 || state.scores.EQUIPE_B === 16, true);
      assertEqual(entry.cardPointsA + entry.cardPointsB > 16, true);
    }
  });

  // 9. Tests finaux obligatoires : hiérarchie, mélange/conservation, obligations de jeu, confidentialité
  test('Hiérarchie exacte des six contrats : Trèfle < Carreau < Cœur < Pique < Sans Atout < Tout Atout', () => {
    assertEqual(
      CONFIRMED_CONTRACT_HIERARCHY.join(','),
      'TREFLE,CARREAU,COEUR,PIQUE,SANS_ATOUT,TOUT_ATOUT',
    );
    assertEqual(isContractAllowedOver('CARREAU', 'TREFLE', 'AUCUN'), true);
    assertEqual(isContractAllowedOver('TREFLE', 'CARREAU', 'AUCUN'), false);
    assertEqual(isContractAllowedOver('PIQUE', 'PIQUE', 'AUCUN'), false);
    assertEqual(isContractAllowedOver('SANS_ATOUT', 'PIQUE', 'AUCUN'), true);
    assertEqual(isContractAllowedOver('TOUT_ATOUT', 'SANS_ATOUT', 'AUCUN'), true);
    assertEqual(isContractAllowedOver('SANS_ATOUT', 'TOUT_ATOUT', 'AUCUN'), false);
    assertEqual(isContractAllowedOver('TOUT_ATOUT', 'TREFLE', 'CONTRE'), false);
  });

  test('Nouvelle manche : mélange 32 cartes, redistribution 5+3 et conservation des scores et profils', () => {
    const customProfile: PlayerProfile = {
      ...dummyProfile,
      pseudo: 'Karim',
      avatarDataUrl: 'data:image/jpeg;base64,test',
    };
    const m1 = createNewMatch(customProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    const m1Scored: typeof m1 = {
      ...m1,
      phase: 'FIN_DONNE',
      scores: { EQUIPE_A: 52, EQUIPE_B: 32 },
    };
    const m2 = startNextRound(m1Scored, false);

    assertEqual(m2.roundNumber, 2);
    assertEqual(m2.scores.EQUIPE_A, 52);
    assertEqual(m2.scores.EQUIPE_B, 32);
    assertEqual(m2.players.SUD.profile.pseudo, 'Karim');
    assertEqual(m2.players.SUD.profile.avatarDataUrl, 'data:image/jpeg;base64,test');
    assertEqual(m2.players.SUD.hand.length, 5);
    assertEqual(m2.remainingCardsBySeat.SUD.length, 3);

    const all32 = new Set([
      ...m2.players.SUD.hand.map((c) => c.id),
      ...m2.players.EST.hand.map((c) => c.id),
      ...m2.players.NORD.hand.map((c) => c.id),
      ...m2.players.OUEST.hand.map((c) => c.id),
      ...m2.remainingCardsBySeat.SUD.map((c) => c.id),
      ...m2.remainingCardsBySeat.EST.map((c) => c.id),
      ...m2.remainingCardsBySeat.NORD.map((c) => c.id),
      ...m2.remainingCardsBySeat.OUEST.map((c) => c.id),
    ]);
    assertEqual(all32.size, 32);
  });

  test('Obligations : fournir à la couleur demandée (Couleur, Sans Atout, Tout Atout)', () => {
    const hand: Card[] = [
      { id: 'PIQUE_7', suit: 'PIQUE', rank: '7' },
      { id: 'COEUR_A', suit: 'COEUR', rank: 'A' },
    ];
    const trick = [{ seat: 'EST' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } }];

    const playableCouleur = getPlayableCards(hand, trick, 'TREFLE', 'SUD');
    assertEqual(playableCouleur.length, 1);
    assertEqual(playableCouleur[0].id, 'PIQUE_7');

    const playableSA = getPlayableCards(hand, trick, 'SANS_ATOUT', 'SUD');
    assertEqual(playableSA.length, 1);
    assertEqual(playableSA[0].id, 'PIQUE_7');
  });

  test('Obligations : couper et surcouper quand l’adversaire est maître (contrat couleur)', () => {
    // Atout = COEUR. EST joue PIQUE_A, NORD joue PIQUE_7, OUEST coupe avec COEUR_10.
    // SUD n'a pas de PIQUE, possède COEUR_9 (plus fort que COEUR_10 à l'atout !) et COEUR_7 (plus faible) et TREFLE_A.
    // SUD doit obligatoirement surcouper avec COEUR_9.
    const hand: Card[] = [
      { id: 'COEUR_9', suit: 'COEUR', rank: '9' },
      { id: 'COEUR_7', suit: 'COEUR', rank: '7' },
      { id: 'TREFLE_A', suit: 'TREFLE', rank: 'A' },
    ];
    const trick = [
      { seat: 'EST' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } },
      { seat: 'NORD' as SeatPosition, card: { id: 'PIQUE_7', suit: 'PIQUE' as const, rank: '7' as const } },
      { seat: 'OUEST' as SeatPosition, card: { id: 'COEUR_10', suit: 'COEUR' as const, rank: '10' as const } },
    ];
    const playableOvercut = getPlayableCards(hand, trick, 'COEUR', 'SUD');
    assertEqual(playableOvercut.length, 1);
    assertEqual(playableOvercut[0].id, 'COEUR_9');

    // Si aucun adversaire n'a encore coupé, SUD doit couper avec l'un de ses atouts (COEUR_9 ou COEUR_7), pas TREFLE_A
    const trickNoTrump = [
      { seat: 'EST' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } },
    ];
    const playableCut = getPlayableCards(hand, trickNoTrump, 'COEUR', 'SUD');
    assertEqual(playableCut.length, 2);
    assertEqual(playableCut.every((c) => c.suit === 'COEUR'), true);
  });

  test('Obligations : monter à l’atout en contrat couleur et en Tout Atout (vs aucune montée en Sans Atout)', () => {
    // 9 d'atout est plus fort que As d'atout
    const hand: Card[] = [
      { id: 'PIQUE_9', suit: 'PIQUE', rank: '9' },
      { id: 'PIQUE_7', suit: 'PIQUE', rank: '7' },
    ];
    const trick = [
      { seat: 'EST' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } },
    ];

    // Contrat couleur PIQUE : obligation de monter -> seul PIQUE_9 est jouable
    const playableCouleur = getPlayableCards(hand, trick, 'PIQUE', 'SUD');
    assertEqual(playableCouleur.length, 1);
    assertEqual(playableCouleur[0].id, 'PIQUE_9');

    // Contrat TOUT_ATOUT : obligation de monter à la couleur demandée -> seul PIQUE_9 est jouable
    const playableTA = getPlayableCards(hand, trick, 'TOUT_ATOUT', 'SUD');
    assertEqual(playableTA.length, 1);
    assertEqual(playableTA[0].id, 'PIQUE_9');

    // Contrat SANS_ATOUT : aucune obligation de monter -> les 2 cartes de PIQUE sont jouables
    const playableSA = getPlayableCards(hand, trick, 'SANS_ATOUT', 'SUD');
    assertEqual(playableSA.length, 2);
  });

  test('Obligations : partenaire maître du pli (pas d’obligation de couper) et aucune coupe en Sans Atout', () => {
    // Atout = COEUR. NORD (partenaire de SUD) mène avec PIQUE_A, EST joue PIQUE_7.
    // SUD n'a pas de PIQUE mais possède COEUR_V et TREFLE_7 -> partenaire maître, donc TREFLE_7 est autorisé !
    const hand: Card[] = [
      { id: 'COEUR_V', suit: 'COEUR', rank: 'V' },
      { id: 'TREFLE_7', suit: 'TREFLE', rank: '7' },
    ];
    const trickPartnerWinning = [
      { seat: 'NORD' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } },
      { seat: 'EST' as SeatPosition, card: { id: 'PIQUE_7', suit: 'PIQUE' as const, rank: '7' as const } },
    ];
    const playablePartner = getPlayableCards(hand, trickPartnerWinning, 'COEUR', 'SUD');
    assertEqual(playablePartner.length, 2);

    // En Sans Atout, même si l'adversaire est maître, aucune obligation d'atout
    const trickOppWinning = [
      { seat: 'EST' as SeatPosition, card: { id: 'PIQUE_A', suit: 'PIQUE' as const, rank: 'A' as const } },
    ];
    const playableSA = getPlayableCards(hand, trickOppWinning, 'SANS_ATOUT', 'SUD');
    assertEqual(playableSA.length, 2);
  });

  test('Confidentialité des mains privées dans les instantanés réseau Partie 2', () => {
    const match = createNewMatch(dummyProfile, 'ANTI_HORAIRE', false, undefined, 'SUD');
    const redactedForSud = localHotspotAdapter.redactSnapshotForSeat(match, 'SUD');
    assertEqual(redactedForSud.players.SUD.hand.length, 5);
    assertEqual(redactedForSud.players.EST.hand.length, 0);
    assertEqual(redactedForSud.players.NORD.hand.length, 0);
    assertEqual(redactedForSud.players.OUEST.hand.length, 0);
    assertEqual(redactedForSud.remainingCardsBySeat.EST.length, 0);
  });

  return results;
}

// Exécution directe en CLI via `npm test`
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('scoring.test.ts')) {
  const results = runAllEngineTests();
  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'} - ${r.name}${r.passed ? '' : `: ${r.details}`}`);
  }
  console.log(`\nTotal: ${results.length} tests | Réussis: ${results.length - failed.length} | Échecs: ${failed.length}`);
  if (failed.length > 0) {
    process.exit(1);
  }
}
