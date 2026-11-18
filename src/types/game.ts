export type Suit = 'TREFLE' | 'CARREAU' | 'COEUR' | 'PIQUE';

export type Rank = '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type TeamId = 'EQUIPE_A' | 'EQUIPE_B';

export type SeatPosition = 'SUD' | 'EST' | 'NORD' | 'OUEST';

export type TurnDirection = 'ANTI_HORAIRE' | 'HORAIRE';

export type ContractType =
  | 'TREFLE'
  | 'CARREAU'
  | 'COEUR'
  | 'PIQUE'
  | 'SANS_ATOUT'
  | 'TOUT_ATOUT';

export type ContreLevel = 'AUCUN' | 'CONTRE' | 'SURCONTRE';

export interface PlayerProfile {
  id: string;
  pseudo: string;
  avatarDataUrl: string | null;
  updatedAt: number;
  deviceTag: string;
}

export interface TablePlayer {
  seat: SeatPosition;
  team: TeamId;
  profile: PlayerProfile;
  isLocalUser: boolean;
  hand: Card[];
}

export interface TrickCard {
  seat: SeatPosition;
  card: Card;
}

export interface CompletedTrick {
  index: number;
  leader: SeatPosition;
  cards: TrickCard[];
  winnerSeat: SeatPosition;
  winnerTeam: TeamId;
}

export type VictoryReason = 'CAPOT_COULEUR' | 'OBJECTIF_150' | null;

export interface RoundOutcomeInput {
  contract: ContractType;
  declaringTeam: TeamId;
  roundWinningTeam: TeamId;
  capotByTeam: TeamId | null;
  contreLevel: ContreLevel;
}

export interface ScoreCalculationResult {
  contract: ContractType;
  declaringTeam: TeamId;
  roundWinningTeam: TeamId;
  capotByTeam: TeamId | null;
  contreLevel: ContreLevel;
  basePoints: number;
  multiplier: number;
  pointsAwardedA: number;
  pointsAwardedB: number;
  isInstantMatchWin: boolean;
  instantWinnerTeam: TeamId | null;
  ruleAppliedLabel: string;
}

export interface RoundLedgerEntry {
  roundNumber: number;
  dealerSeat: SeatPosition;
  firstAnnouncerSeat: SeatPosition;
  contract: ContractType;
  declaringSeat: SeatPosition;
  declaringTeam: TeamId;
  contreLevel: ContreLevel;
  tricksWonA: number;
  tricksWonB: number;
  cardPointsA: number;
  cardPointsB: number;
  contractSucceeded: boolean;
  capotByTeam: TeamId | null;
  pointsAwardedA: number;
  pointsAwardedB: number;
  totalAfterA: number;
  totalAfterB: number;
  ruleAppliedLabel: string;
}

export type RoundPhase =
  | 'ENCHERES'
  | 'JEU'
  | 'FIN_DONNE'
  | 'FIN_PARTIE';

export interface BidEntry {
  seat: SeatPosition;
  action: 'PASSE' | 'CONTRAT' | 'CONTRE' | 'SURCONTRE';
  contract?: ContractType;
}

export type MatchMode =
  | 'SOLO_IA'
  | 'LOCAL_TEST'
  | 'MULTIJOUEUR_HOTE'
  | 'MULTIJOUEUR_CLIENT';

export interface MatchState {
  matchId: string;
  matchMode?: MatchMode;
  roundNumber: number;
  phase: RoundPhase;
  turnDirection: TurnDirection;
  dealerSeat: SeatPosition;
  firstAnnouncerSeat: SeatPosition;
  currentTurnSeat: SeatPosition;
  players: Record<SeatPosition, TablePlayer>;
  remainingCardsBySeat: Record<SeatPosition, Card[]>;
  scores: Record<TeamId, number>;
  activeContract: ContractType | null;
  declaringSeat: SeatPosition | null;
  declaringTeam: TeamId | null;
  contreBySeat: SeatPosition | null;
  contreLevel: ContreLevel;
  consecutivePasses: number;
  bidHistory: BidEntry[];
  currentTrick: TrickCard[];
  currentTrickLeader: SeatPosition;
  completedTricks: CompletedTrick[];
  ledger: RoundLedgerEntry[];
  winnerTeam: TeamId | null;
  victoryReason: VictoryReason;
}

export interface AppSettings {
  turnDirection: TurnDirection;
  soundEffectsEnabled: boolean;
  sortCardsBySuit: boolean;
  tableControlMode: 'CONTROLE_4_MAINS' | 'TEST_AUTO_ADVERSAIRES';
}
