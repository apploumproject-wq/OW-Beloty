import {
  ContractType,
  MatchState,
  PlayerProfile,
  SeatPosition,
  TurnDirection,
} from './game';

export type HotspotRole = 'HOTE' | 'CLIENT';

export type HotspotConnectionStatus =
  | 'NON_CONNECTE'
  | 'EN_ATTENTE_PARTIE_2'
  | 'PRET_POUR_SYNCHRO'
  | 'SERVEUR_ACTIF'
  | 'CONNECTE'
  | 'DECONNECTE'
  | 'HOTE_FERME'
  | 'ERREUR';

export interface HotspotSessionConfig {
  sessionCode: string;
  hostIpPlaceholder: string;
  port: number;
  role: HotspotRole;
  maxPlayers: 4;
}

export interface ProfileSyncPayload {
  schemaVersion: 1;
  senderId: string;
  sentAt: number;
  seatPreference?: SeatPosition;
  profile: PlayerProfile;
}

export interface LobbyPlayerSlot {
  seat: SeatPosition;
  profile: PlayerProfile | null;
  connected: boolean;
  isHost: boolean;
}

export type SyncMessageType =
  | 'HELLO_PROFIL'
  | 'WELCOME_SEAT'
  | 'SYNC_LOBBY_JOUEURS'
  | 'LANCER_PARTIE'
  | 'ACTION_ENCHERE'
  | 'ACTION_JOUER_CARTE'
  | 'ACTION_DONNE_SUIVANTE'
  | 'ACTION_NOUVELLE_PARTIE'
  | 'ETAT_COMPLET_PARTIE'
  | 'ACTION_REJETEE'
  | 'JOUEUR_STATUT'
  | 'HOTE_FERME'
  | 'PING'
  | 'PONG';

export interface SyncMessage<T = unknown> {
  type: SyncMessageType;
  matchId: string;
  senderProfileId: string;
  sequence: number;
  timestamp: number;
  payload: T;
}

export interface HelloProfilPayload {
  sessionCode: string;
  profile: PlayerProfile;
}

export interface WelcomeSeatPayload {
  seat: SeatPosition;
  sessionCode: string;
  lobbyPlayers: LobbyPlayerSlot[];
  turnDirection: TurnDirection;
}

export interface SyncLobbyPayload {
  sessionCode: string;
  players: LobbyPlayerSlot[];
  turnDirection: TurnDirection;
  matchStarted: boolean;
}

export interface BidActionPayload {
  kind: 'PASSE' | 'CONTRAT' | 'CONTRE' | 'SURCONTRE';
  contract?: ContractType;
}

export interface PlayCardActionPayload {
  cardId: string;
}

export interface MatchSnapshotPayload {
  matchState: MatchState;
  profiles: PlayerProfile[];
  notice?: string;
}

export interface ActionRejectedPayload {
  reason: string;
}

export interface PlayerStatusPayload {
  seat: SeatPosition;
  pseudo: string;
  connected: boolean;
}

export interface HostClosedPayload {
  reason: string;
}

/**
 * Contrat d'adaptateur réseau pour le transport Hotspot Wi-Fi local.
 */
export interface NetworkTransportAdapter {
  readonly isImplementedInCurrentPhase: boolean;
  readonly transportLabel: string;
  getStatus(): HotspotConnectionStatus;
  prepareHostSession(localProfile: PlayerProfile): HotspotSessionConfig;
  prepareProfileBroadcast(localProfile: PlayerProfile): ProfileSyncPayload;
  buildSnapshot(matchState: MatchState): MatchSnapshotPayload;
  redactSnapshotForSeat(matchState: MatchState, viewerSeat: SeatPosition): MatchState;
}
