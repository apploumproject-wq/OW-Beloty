import { MatchState, PlayerProfile, SeatPosition } from '../types/game';
import {
  HotspotConnectionStatus,
  HotspotSessionConfig,
  MatchSnapshotPayload,
  NetworkTransportAdapter,
  ProfileSyncPayload,
} from '../types/network';
import { createProfileSyncPayload } from './profiles';

export const DEFAULT_HOTSPOT_PORT = 7432;

/**
 * Adaptateur réseau local pour OW'Beloty (Hotspot Wi-Fi local entre 4 téléphones Android).
 * Garantit la confidentialité stricte des mains via `redactSnapshotForSeat`.
 */
export class LocalHotspotPreparedAdapter implements NetworkTransportAdapter {
  readonly isImplementedInCurrentPhase = true;
  readonly transportLabel = 'Hotspot Wi-Fi local Android (WebSocket RFC 6455)';

  private currentStatus: HotspotConnectionStatus = 'PRET_POUR_SYNCHRO';

  getStatus(): HotspotConnectionStatus {
    return this.currentStatus;
  }

  setStatus(status: HotspotConnectionStatus): void {
    this.currentStatus = status;
  }

  prepareHostSession(localProfile: PlayerProfile): HotspotSessionConfig {
    const clean = localProfile.id.replace(/[^a-zA-Z0-9]/g, '');
    const suffix = (clean.slice(-4) || '0001').toUpperCase().padStart(4, '0');
    return {
      sessionCode: `OWB-${suffix}`,
      hostIpPlaceholder: '192.168.43.1',
      port: DEFAULT_HOTSPOT_PORT,
      role: 'HOTE',
      maxPlayers: 4,
    };
  }

  prepareProfileBroadcast(localProfile: PlayerProfile): ProfileSyncPayload {
    return createProfileSyncPayload(localProfile);
  }

  buildSnapshot(matchState: MatchState): MatchSnapshotPayload {
    return {
      matchState,
      profiles: [
        matchState.players.SUD.profile,
        matchState.players.EST.profile,
        matchState.players.NORD.profile,
        matchState.players.OUEST.profile,
      ],
    };
  }

  /**
   * Prépare un instantané sécurisé pour un téléphone donné :
   * conserve uniquement la main privée de `viewerSeat` et masque les cartes
   * des trois autres joueurs ainsi que les paquets de 3 cartes restantes.
   */
  redactSnapshotForSeat(
    matchState: MatchState,
    viewerSeat: SeatPosition,
  ): MatchState {
    const redactSeat = (seat: SeatPosition) =>
      seat === viewerSeat
        ? matchState.players[seat]
        : { ...matchState.players[seat], hand: [] };

    return {
      ...matchState,
      players: {
        SUD: redactSeat('SUD'),
        EST: redactSeat('EST'),
        NORD: redactSeat('NORD'),
        OUEST: redactSeat('OUEST'),
      },
      remainingCardsBySeat: {
        SUD: [],
        EST: [],
        NORD: [],
        OUEST: [],
      },
    };
  }
}

export const localHotspotAdapter = new LocalHotspotPreparedAdapter();
