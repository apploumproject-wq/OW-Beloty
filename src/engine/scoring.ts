import {
  ContractType,
  ContreLevel,
  RoundOutcomeInput,
  ScoreCalculationResult,
  TeamId,
} from '../types/game';

export const TARGET_MATCH_SCORE = 150;

export const BASE_CONTRACT_POINTS: Record<ContractType, number> = {
  TREFLE: 32,
  CARREAU: 16,
  COEUR: 16,
  PIQUE: 16,
  SANS_ATOUT: 52,
  TOUT_ATOUT: 26,
};

export function isSuitContract(contract: ContractType): boolean {
  return (
    contract === 'TREFLE' ||
    contract === 'CARREAU' ||
    contract === 'COEUR' ||
    contract === 'PIQUE'
  );
}

/**
 * Calcule le multiplicateur OW'Beloty selon le contrat, le contre/surcontre et si un capot est appliqué.
 *
 * Règles obligatoires :
 * - Contré : × 2
 * - Surcontré : × 2 puis encore × 2 (soit × 4)
 * - Exceptions :
 *   - Trèfle : le surcontre ne donne pas de multiplicateur supplémentaire (reste × 2)
 *   - Sans Atout : le surcontre ne donne pas de multiplicateur supplémentaire (reste × 2)
 * - Capot Tout Atout :
 *   - Contré : × 2 (35 ou 45 × 2)
 *   - Surcontré : résultat précédent × 2 (soit × 4)
 */
export function getContractMultiplier(
  contract: ContractType,
  contreLevel: ContreLevel,
): number {
  if (contreLevel === 'AUCUN') return 1;
  if (contreLevel === 'CONTRE') return 2;

  // SURCONTRE
  if (contract === 'TREFLE' || contract === 'SANS_ATOUT') {
    return 2;
  }
  return 4;
}

/**
 * Moteur de score pur OW'Beloty (totalement découplé de l'interface).
 * Ne jamais utiliser le système traditionnel de 162 points.
 * Aucun point de belote/rebelote ni partage de points.
 */
export function calculateRoundScore(input: RoundOutcomeInput): ScoreCalculationResult {
  const { contract, declaringTeam, roundWinningTeam, capotByTeam, contreLevel } = input;

  // 1. Priorité absolue : détection du capot (8 plis remportés par la même équipe)
  if (capotByTeam !== null) {
    // Capot sur contrat couleur -> victoire immédiate de la partie quel que soit le score
    if (isSuitContract(contract)) {
      return {
        contract,
        declaringTeam,
        roundWinningTeam: capotByTeam,
        capotByTeam,
        contreLevel,
        basePoints: 0,
        multiplier: 1,
        pointsAwardedA: 0,
        pointsAwardedB: 0,
        isInstantMatchWin: true,
        instantWinnerTeam: capotByTeam,
        ruleAppliedLabel: `Capot couleur (${contract}) — Victoire immédiate de la partie`,
      };
    }

    // Capot en Sans Atout -> 90 points pour l'équipe qui réalise les 8 plis
    if (contract === 'SANS_ATOUT') {
      const basePoints = 90;
      const multiplier = getContractMultiplier(contract, contreLevel);
      const total = basePoints * multiplier;
      return {
        contract,
        declaringTeam,
        roundWinningTeam: capotByTeam,
        capotByTeam,
        contreLevel,
        basePoints,
        multiplier,
        pointsAwardedA: capotByTeam === 'EQUIPE_A' ? total : 0,
        pointsAwardedB: capotByTeam === 'EQUIPE_B' ? total : 0,
        isInstantMatchWin: false,
        instantWinnerTeam: null,
        ruleAppliedLabel:
          multiplier > 1
            ? `Capot Sans Atout (90 × ${multiplier})`
            : 'Capot Sans Atout (90 pts)',
      };
    }

    // Capot en Tout Atout -> 35 pts si équipe déclarante, 45 pts si équipe adverse
    const isDeclaringCapot = capotByTeam === declaringTeam;
    const basePoints = isDeclaringCapot ? 35 : 45;
    const multiplier = getContractMultiplier(contract, contreLevel);
    const total = basePoints * multiplier;

    return {
      contract,
      declaringTeam,
      roundWinningTeam: capotByTeam,
      capotByTeam,
      contreLevel,
      basePoints,
      multiplier,
      pointsAwardedA: capotByTeam === 'EQUIPE_A' ? total : 0,
      pointsAwardedB: capotByTeam === 'EQUIPE_B' ? total : 0,
      isInstantMatchWin: false,
      instantWinnerTeam: null,
      ruleAppliedLabel: isDeclaringCapot
        ? `Capot Tout Atout (déclarant : ${basePoints} × ${multiplier})`
        : `Capot Tout Atout (adverse : ${basePoints} × ${multiplier})`,
    };
  }

  // 2. Jeu simple (aucun capot)
  const basePoints = BASE_CONTRACT_POINTS[contract];
  const multiplier = getContractMultiplier(contract, contreLevel);
  const total = basePoints * multiplier;

  const pointsAwardedA = roundWinningTeam === 'EQUIPE_A' ? total : 0;
  const pointsAwardedB = roundWinningTeam === 'EQUIPE_B' ? total : 0;

  return {
    contract,
    declaringTeam,
    roundWinningTeam,
    capotByTeam: null,
    contreLevel,
    basePoints,
    multiplier,
    pointsAwardedA,
    pointsAwardedB,
    isInstantMatchWin: false,
    instantWinnerTeam: null,
    ruleAppliedLabel:
      multiplier > 1
        ? `Contrat ${contract} (${basePoints} × ${multiplier})`
        : `Contrat ${contract} (${basePoints} pts)`,
  };
}

export function evaluateMatchVictory(
  scoreA: number,
  scoreB: number,
  roundScoreResult: ScoreCalculationResult,
): { winnerTeam: TeamId | null; reason: 'CAPOT_COULEUR' | 'OBJECTIF_150' | null } {
  if (roundScoreResult.isInstantMatchWin && roundScoreResult.instantWinnerTeam) {
    return {
      winnerTeam: roundScoreResult.instantWinnerTeam,
      reason: 'CAPOT_COULEUR',
    };
  }
  if (scoreA >= TARGET_MATCH_SCORE) {
    return { winnerTeam: 'EQUIPE_A', reason: 'OBJECTIF_150' };
  }
  if (scoreB >= TARGET_MATCH_SCORE) {
    return { winnerTeam: 'EQUIPE_B', reason: 'OBJECTIF_150' };
  }
  return { winnerTeam: null, reason: null };
}
