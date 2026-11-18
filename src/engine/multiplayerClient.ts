import { ContractType, MatchState, PlayerProfile, SeatPosition, TurnDirection } from '../types/game';
import {
  ActionRejectedPayload,
  BidActionPayload,
  HelloProfilPayload,
  HostClosedPayload,
  LobbyPlayerSlot,
  MatchSnapshotPayload,
  PlayCardActionPayload,
  PlayerStatusPayload,
  SyncLobbyPayload,
  SyncMessage,
  SyncMessageType,
  WelcomeSeatPayload,
} from '../types/network';

export type ClientConnectionPhase =
  | 'INACTIF'
  | 'CONNEXION'
  | 'EN_ATTENTE_LOBBY'
  | 'EN_PARTIE'
  | 'DECONNECTE'
  | 'HOTE_FERME'
  | 'ERREUR';

export interface ClientTransportBridge {
  send(message: SyncMessage): void;
  close(): void;
}

export interface ClientSessionState {
  phase: ClientConnectionPhase;
  sessionCode: string;
  mySeat: SeatPosition | null;
  turnDirection: TurnDirection;
  lobbyPlayers: LobbyPlayerSlot[];
  matchState: MatchState | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class MultiplayerClientSession {
  readonly profile: PlayerProfile;
  readonly sessionCode: string;
  private transport: ClientTransportBridge;
  private sequence = 0;

  private state: ClientSessionState;
  private listeners = new Set<(state: ClientSessionState) => void>();

  constructor(options: {
    profile: PlayerProfile;
    sessionCode: string;
    transport: ClientTransportBridge;
  }) {
    this.profile = options.profile;
    this.sessionCode = options.sessionCode.trim().toUpperCase();
    this.transport = options.transport;

    this.state = {
      phase: 'CONNEXION',
      sessionCode: this.sessionCode,
      mySeat: null,
      turnDirection: 'ANTI_HORAIRE',
      lobbyPlayers: [],
      matchState: null,
      errorMessage: null,
      noticeMessage: null,
    };
  }

  subscribe(listener: (state: ClientSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ClientSessionState {
    return this.state;
  }

  private setState(partial: Partial<ClientSessionState>): void {
    this.state = { ...this.state, ...partial };
    for (const cb of this.listeners) cb(this.state);
  }

  private nextMessage<T>(type: SyncMessageType, payload: T): SyncMessage<T> {
    this.sequence += 1;
    return {
      type,
      matchId: this.state.matchState?.matchId ?? this.sessionCode,
      senderProfileId: this.profile.id,
      sequence: this.sequence,
      timestamp: Date.now(),
      payload,
    };
  }

  onTransportOpened(): void {
    this.setState({ errorMessage: null, noticeMessage: null });
    this.transport.send(
      this.nextMessage<HelloProfilPayload>('HELLO_PROFIL', {
        sessionCode: this.sessionCode,
        profile: this.profile,
      }),
    );
  }

  onTransportClosed(wasClean = false): void {
    if (this.state.phase === 'HOTE_FERME') return;
    this.setState({
      phase: 'DECONNECTE',
      noticeMessage: wasClean
        ? 'Connexion fermée.'
        : 'Connexion perdue avec le téléphone hôte. Vous pouvez vous reconnecter.',
    });
  }

  onTransportError(reason: string): void {
    if (this.state.phase === 'HOTE_FERME') return;
    this.setState({
      phase: 'ERREUR',
      errorMessage: reason,
    });
  }

  handleServerMessage(rawOrMsg: string | SyncMessage): void {
    let msg: SyncMessage;
    try {
      msg =
        typeof rawOrMsg === 'string'
          ? (JSON.parse(rawOrMsg) as SyncMessage)
          : rawOrMsg;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'WELCOME_SEAT': {
        const p = msg.payload as WelcomeSeatPayload;
        this.setState({
          phase: this.state.matchState ? 'EN_PARTIE' : 'EN_ATTENTE_LOBBY',
          mySeat: p.seat,
          sessionCode: p.sessionCode,
          lobbyPlayers: p.lobbyPlayers,
          turnDirection: p.turnDirection,
          errorMessage: null,
        });
        break;
      }
      case 'SYNC_LOBBY_JOUEURS': {
        const p = msg.payload as SyncLobbyPayload;
        this.setState({
          lobbyPlayers: p.players,
          turnDirection: p.turnDirection,
          phase:
            p.matchStarted && this.state.matchState
              ? 'EN_PARTIE'
              : this.state.phase === 'CONNEXION'
                ? 'EN_ATTENTE_LOBBY'
                : this.state.phase,
        });
        break;
      }
      case 'LANCER_PARTIE':
      case 'ETAT_COMPLET_PARTIE': {
        const p = msg.payload as MatchSnapshotPayload;
        this.setState({
          phase: 'EN_PARTIE',
          matchState: {
            ...p.matchState,
            matchMode: 'MULTIJOUEUR_CLIENT',
          },
          errorMessage: null,
          noticeMessage: p.notice ?? null,
        });
        break;
      }
      case 'ACTION_REJETEE': {
        const p = msg.payload as ActionRejectedPayload;
        this.setState({ errorMessage: p.reason });
        break;
      }
      case 'JOUEUR_STATUT': {
        const p = msg.payload as PlayerStatusPayload;
        this.setState({
          noticeMessage: p.connected
            ? `${p.pseudo} s’est reconnecté.`
            : `${p.pseudo} est déconnecté — en attente de reconnexion.`,
        });
        break;
      }
      case 'HOTE_FERME': {
        const p = msg.payload as HostClosedPayload;
        this.setState({
          phase: 'HOTE_FERME',
          errorMessage: p.reason || 'L’hôte a quitté la partie.',
        });
        break;
      }
      default:
        break;
    }
  }

  sendBidPass(): void {
    this.transport.send(
      this.nextMessage<BidActionPayload>('ACTION_ENCHERE', { kind: 'PASSE' }),
    );
  }

  sendBidContract(contract: ContractType): void {
    this.transport.send(
      this.nextMessage<BidActionPayload>('ACTION_ENCHERE', {
        kind: 'CONTRAT',
        contract,
      }),
    );
  }

  sendBidContre(): void {
    this.transport.send(
      this.nextMessage<BidActionPayload>('ACTION_ENCHERE', { kind: 'CONTRE' }),
    );
  }

  sendBidSurcontre(): void {
    this.transport.send(
      this.nextMessage<BidActionPayload>('ACTION_ENCHERE', {
        kind: 'SURCONTRE',
      }),
    );
  }

  sendPlayCard(cardId: string): void {
    this.transport.send(
      this.nextMessage<PlayCardActionPayload>('ACTION_JOUER_CARTE', { cardId }),
    );
  }

  clearMessages(): void {
    this.setState({ errorMessage: null, noticeMessage: null });
  }

  disconnect(): void {
    this.transport.close();
    this.setState({ phase: 'INACTIF' });
  }
}

/**
 * Fabrique un transport WebSocket réel compatible Android WebView et navigateur
 * pour se connecter au téléphone hôte sur le réseau Hotspot Wi-Fi local (ws://ip:port).
 */
export function createWebSocketClientTransport(
  hostIp: string,
  port: number,
  callbacks: {
    onOpen: () => void;
    onMessage: (raw: string) => void;
    onClose: (wasClean: boolean) => void;
    onError: (reason: string) => void;
  },
): ClientTransportBridge {
  const cleanHost = hostIp.trim();
  const url = `ws://${cleanHost}:${port}`;
  let socket: WebSocket | null = null;

  try {
    socket = new WebSocket(url);
  } catch (err) {
    callbacks.onError(
      err instanceof Error
        ? err.message
        : `Impossible d'ouvrir la connexion vers ${url}`,
    );
    return {
      send: () => {},
      close: () => {},
    };
  }

  socket.onopen = () => callbacks.onOpen();
  socket.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      callbacks.onMessage(ev.data);
    }
  };
  socket.onerror = () => {
    callbacks.onError(
      `Échec de connexion vers ${url}. Vérifiez le Hotspot Wi-Fi et l’adresse IP de l’hôte.`,
    );
  };
  socket.onclose = (ev) => callbacks.onClose(ev.wasClean);

  return {
    send: (msg) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    },
    close: () => {
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    },
  };
}
