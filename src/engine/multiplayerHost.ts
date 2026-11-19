import {
  ContractType,
  MatchState,
  PlayerProfile,
  SeatPosition,
  TurnDirection,
} from '../types/game';
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
import {
  canSeatContre,
  canSeatSurcontre,
  isContractAllowedOver,
} from './contracts';
import {
  applyBidContre,
  applyBidContract,
  applyBidPass,
  applyBidSurcontre,
  applyPlayCard,
  createNewMatch,
  startNextRound,
} from './match';
import { localHotspotAdapter } from './networkAdapter';
import { getPlayableCards } from './tricks';
import { decideAiBid, decideAiCard, extractAiContext } from './ai';

export interface HostTransportBridge {
  sendToClient(clientId: string, message: SyncMessage): void;
  broadcastToClients?(message: SyncMessage): void;
}

const REMOTE_SEATS: SeatPosition[] = ['EST', 'NORD', 'OUEST'];

export class MultiplayerHostSession {
  readonly sessionCode: string;
  readonly port: number;
  readonly hostProfile: PlayerProfile;
  turnDirection: TurnDirection;
  sortCardsBySuit: boolean;
  readonly twoPlayerMode: boolean;

  private transport: HostTransportBridge;
  private sequence = 0;
  private matchState: MatchState | null = null;
  private closed = false;

  private slots: Record<SeatPosition, LobbyPlayerSlot>;
  private clientIdBySeat: Partial<Record<SeatPosition, string>> = {};
  private seatByClientId: Map<string, SeatPosition> = new Map();

  private listeners = new Set<() => void>();

  constructor(options: {
    hostProfile: PlayerProfile;
    sessionCode: string;
    port: number;
    turnDirection: TurnDirection;
    sortCardsBySuit: boolean;
    transport: HostTransportBridge;
    twoPlayerMode?: boolean;
  }) {
    this.hostProfile = options.hostProfile;
    this.sessionCode = options.sessionCode.trim().toUpperCase();
    this.port = options.port;
    this.turnDirection = options.turnDirection;
    this.sortCardsBySuit = options.sortCardsBySuit;
    this.transport = options.transport;
    this.twoPlayerMode = options.twoPlayerMode ?? false;

    this.slots = {
      SUD: {
        seat: 'SUD',
        profile: options.hostProfile,
        connected: true,
        isHost: true,
      },
      EST: this.twoPlayerMode
        ? { seat: 'EST', profile: this.createAiProfile('EST'), connected: true, isHost: false }
        : { seat: 'EST', profile: null, connected: false, isHost: false },
      NORD: { seat: 'NORD', profile: null, connected: false, isHost: false },
      OUEST: this.twoPlayerMode
        ? { seat: 'OUEST', profile: this.createAiProfile('OUEST'), connected: true, isHost: false }
        : { seat: 'OUEST', profile: null, connected: false, isHost: false },
    };
  }

  private createAiProfile(seat: 'EST' | 'OUEST'): PlayerProfile {
    return {
      id: `hotspot-ai-${seat.toLowerCase()}`,
      pseudo: seat === 'EST' ? 'IA Est' : 'IA Ouest',
      avatarDataUrl: null,
      updatedAt: Date.now(),
      deviceTag: 'Intelligence Artificielle',
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const cb of this.listeners) cb();
  }

  private nextMessage<T>(type: SyncMessageType, payload: T): SyncMessage<T> {
    this.sequence += 1;
    return {
      type,
      matchId: this.matchState?.matchId ?? this.sessionCode,
      senderProfileId: this.hostProfile.id,
      sequence: this.sequence,
      timestamp: Date.now(),
      payload,
    };
  }

  getLobbyPlayers(): LobbyPlayerSlot[] {
    return [this.slots.SUD, this.slots.EST, this.slots.NORD, this.slots.OUEST];
  }

  getConnectedCount(): number {
    return this.twoPlayerMode
      ? [this.slots.SUD, this.slots.NORD].filter((s) => s.profile !== null && s.connected).length
      : this.getLobbyPlayers().filter((s) => s.profile !== null && s.connected).length;
  }

  getOccupiedCount(): number {
    return this.getLobbyPlayers().filter((s) => s.profile !== null).length;
  }

  canStartMatch(): boolean {
    if (this.closed || this.matchState !== null) return false;
    if (this.twoPlayerMode) {
      return this.slots.SUD.connected && this.slots.NORD.profile !== null && this.slots.NORD.connected;
    }
    return this.getLobbyPlayers().every((s) => s.profile !== null && s.connected);
  }

  /**
   * Retourne l'état complet autoritaire (uniquement sur l'hôte).
   */
  getAuthoritativeMatchState(): MatchState | null {
    return this.matchState;
  }

  /**
   * Retourne l'état filtré pour le joueur hôte (SUD) afin de respecter
   * exactement la même confidentialité d'affichage sur son écran.
   */
  getHostViewMatchState(): MatchState | null {
    if (!this.matchState) return null;
    return {
      ...localHotspotAdapter.redactSnapshotForSeat(this.matchState, 'SUD'),
      matchMode: 'MULTIJOUEUR_HOTE',
    };
  }

  isClosed(): boolean {
    return this.closed;
  }

  private sendRejected(clientId: string, reason: string): void {
    this.transport.sendToClient(
      clientId,
      this.nextMessage<ActionRejectedPayload>('ACTION_REJETEE', { reason }),
    );
  }

  private broadcastLobby(): void {
    const payload: SyncLobbyPayload = {
      sessionCode: this.sessionCode,
      players: this.getLobbyPlayers(),
      turnDirection: this.turnDirection,
      matchStarted: this.matchState !== null,
    };
    for (const seat of REMOTE_SEATS) {
      const cid = this.clientIdBySeat[seat];
      if (cid && this.slots[seat].connected) {
        this.transport.sendToClient(
          cid,
          this.nextMessage<SyncLobbyPayload>('SYNC_LOBBY_JOUEURS', payload),
        );
      }
    }
  }

  private broadcastMatchSnapshots(
    type: 'LANCER_PARTIE' | 'ETAT_COMPLET_PARTIE',
    notice?: string,
  ): void {
    if (!this.matchState) return;
    const profiles = [
      this.matchState.players.SUD.profile,
      this.matchState.players.EST.profile,
      this.matchState.players.NORD.profile,
      this.matchState.players.OUEST.profile,
    ];

    for (const seat of REMOTE_SEATS) {
      const cid = this.clientIdBySeat[seat];
      if (!cid || !this.slots[seat].connected) continue;
      const redacted = localHotspotAdapter.redactSnapshotForSeat(
        this.matchState,
        seat,
      );
      redacted.matchMode = 'MULTIJOUEUR_CLIENT';
      this.transport.sendToClient(
        cid,
        this.nextMessage<MatchSnapshotPayload>(type, {
          matchState: redacted,
          profiles,
          notice,
        }),
      );
    }
  }

  handleClientDisconnected(clientId: string): void {
    if (this.closed) return;
    const seat = this.seatByClientId.get(clientId);
    if (!seat) return;

    this.seatByClientId.delete(clientId);
    if (this.clientIdBySeat[seat] === clientId) {
      delete this.clientIdBySeat[seat];
    }

    const slot = this.slots[seat];
    slot.connected = false;

    const pseudo = slot.profile?.pseudo ?? seat;
    for (const otherSeat of REMOTE_SEATS) {
      const otherCid = this.clientIdBySeat[otherSeat];
      if (otherCid && this.slots[otherSeat].connected) {
        this.transport.sendToClient(
          otherCid,
          this.nextMessage<PlayerStatusPayload>('JOUEUR_STATUT', {
            seat,
            pseudo,
            connected: false,
          }),
        );
      }
    }
    this.broadcastLobby();
    this.emitChange();
  }

  handleClientMessage(clientId: string, rawOrMsg: string | SyncMessage): void {
    if (this.closed) {
      this.sendRejected(clientId, 'La session a été fermée par l’hôte.');
      return;
    }

    let msg: SyncMessage;
    try {
      msg =
        typeof rawOrMsg === 'string'
          ? (JSON.parse(rawOrMsg) as SyncMessage)
          : rawOrMsg;
    } catch {
      this.sendRejected(clientId, 'Message réseau invalide.');
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      this.sendRejected(clientId, 'Format de message inconnu.');
      return;
    }

    if (msg.type === 'PING') {
      this.transport.sendToClient(clientId, this.nextMessage('PONG', {}));
      return;
    }

    if (msg.type === 'HELLO_PROFIL') {
      this.handleHello(clientId, msg.payload as HelloProfilPayload);
      return;
    }

    const seat = this.seatByClientId.get(clientId);
    if (!seat) {
      this.sendRejected(
        clientId,
        'Client non authentifié : veuillez rejoindre la session avec votre profil.',
      );
      return;
    }

    const assignedProfile = this.slots[seat].profile;
    if (!assignedProfile || msg.senderProfileId !== assignedProfile.id) {
      this.sendRejected(
        clientId,
        'Identité de joueur incohérente pour ce siège.',
      );
      return;
    }

    if (msg.type === 'ACTION_ENCHERE') {
      const payload = msg.payload as BidActionPayload;
      const result = this.applyBidAction(seat, payload);
      if (!result.ok) {
        this.sendRejected(clientId, result.reason);
      }
      return;
    }

    if (msg.type === 'ACTION_JOUER_CARTE') {
      const payload = msg.payload as PlayCardActionPayload;
      const result = this.applyCardAction(seat, payload?.cardId);
      if (!result.ok) {
        this.sendRejected(clientId, result.reason);
      }
      return;
    }

    if (msg.type === 'ACTION_DONNE_SUIVANTE') {
      this.sendRejected(
        clientId,
        'Seul l’hôte de la table déclenche la donne suivante.',
      );
      return;
    }

    this.sendRejected(
      clientId,
      `Action non autorisée depuis un téléphone client (${msg.type}).`,
    );
  }

  private handleHello(clientId: string, payload: HelloProfilPayload): void {
    if (!payload || !payload.profile || !payload.profile.id) {
      this.sendRejected(clientId, 'Profil joueur manquant.');
      return;
    }
    const providedCode = (payload.sessionCode ?? '').trim().toUpperCase();
    if (providedCode && providedCode !== this.sessionCode) {
      this.sendRejected(
        clientId,
        `Code de session incorrect (attendu : ${this.sessionCode}).`,
      );
      return;
    }
    if (payload.profile.id === this.hostProfile.id) {
      this.sendRejected(
        clientId,
        'Ce profil correspond déjà au téléphone hôte.',
      );
      return;
    }

    // 1. Reconnexion d'un joueur déjà assis à un siège (même profile.id)
    let targetSeat: SeatPosition | null = null;
    for (const seat of (this.twoPlayerMode ? ['NORD'] as SeatPosition[] : REMOTE_SEATS)) {
      if (this.slots[seat].profile?.id === payload.profile.id) {
        targetSeat = seat;
        break;
      }
    }

    const isReconnection = targetSeat !== null;

    // 2. Sinon attribuer le premier siège libre si le match n'a pas encore démarré
    if (!targetSeat) {
      if (this.matchState !== null) {
        this.sendRejected(
          clientId,
          'La partie a déjà commencé sans ce profil.',
        );
        return;
      }
      for (const seat of (this.twoPlayerMode ? ['NORD'] as SeatPosition[] : REMOTE_SEATS)) {
        if (this.slots[seat].profile === null) {
          targetSeat = seat;
          break;
        }
      }
    }

    if (!targetSeat) {
      this.sendRejected(
        clientId,
        'La table est déjà complète (4 joueurs maximum).',
      );
      return;
    }

    // Si une ancienne socket occupait ce siège, on nettoie l'association précédente
    const oldCid = this.clientIdBySeat[targetSeat];
    if (oldCid && oldCid !== clientId) {
      this.seatByClientId.delete(oldCid);
    }

    const cleanProfile: PlayerProfile = {
      ...payload.profile,
      pseudo: payload.profile.pseudo.trim().slice(0, 20) || `Joueur ${targetSeat}`,
      updatedAt: Date.now(),
    };

    this.slots[targetSeat] = {
      seat: targetSeat,
      profile: cleanProfile,
      connected: true,
      isHost: false,
    };
    this.clientIdBySeat[targetSeat] = clientId;
    this.seatByClientId.set(clientId, targetSeat);

    // Mettre à jour le profil dans le matchState si partie déjà lancée
    if (this.matchState) {
      this.matchState = {
        ...this.matchState,
        players: {
          ...this.matchState.players,
          [targetSeat]: {
            ...this.matchState.players[targetSeat],
            profile: cleanProfile,
          },
        },
      };
    }

    this.transport.sendToClient(
      clientId,
      this.nextMessage<WelcomeSeatPayload>('WELCOME_SEAT', {
        seat: targetSeat,
        sessionCode: this.sessionCode,
        lobbyPlayers: this.getLobbyPlayers(),
        turnDirection: this.turnDirection,
      }),
    );

    if (isReconnection) {
      for (const otherSeat of REMOTE_SEATS) {
        if (otherSeat === targetSeat) continue;
        const otherCid = this.clientIdBySeat[otherSeat];
        if (otherCid && this.slots[otherSeat].connected) {
          this.transport.sendToClient(
            otherCid,
            this.nextMessage<PlayerStatusPayload>('JOUEUR_STATUT', {
              seat: targetSeat,
              pseudo: cleanProfile.pseudo,
              connected: true,
            }),
          );
        }
      }
    }

    this.broadcastLobby();

    // Si la partie est déjà en cours, renvoyer immédiatement la main privée et l'état au joueur reconnecté
    if (this.matchState) {
      const redacted = localHotspotAdapter.redactSnapshotForSeat(
        this.matchState,
        targetSeat,
      );
      redacted.matchMode = 'MULTIJOUEUR_CLIENT';
      this.transport.sendToClient(
        clientId,
        this.nextMessage<MatchSnapshotPayload>('ETAT_COMPLET_PARTIE', {
          matchState: redacted,
          profiles: [
            this.matchState.players.SUD.profile,
            this.matchState.players.EST.profile,
            this.matchState.players.NORD.profile,
            this.matchState.players.OUEST.profile,
          ],
          notice: `${cleanProfile.pseudo} a rejoint la table.`,
        }),
      );
    }

    this.emitChange();
  }

  startMatch(initialFirstAnnouncer?: SeatPosition): { ok: true } | { ok: false; reason: string } {
    if (this.closed) {
      return { ok: false, reason: 'Session fermée.' };
    }
    if (!this.canStartMatch()) {
      return {
        ok: false,
        reason: 'Les 4 joueurs doivent être connectés pour lancer la partie.',
      };
    }

    const fresh = createNewMatch(
      this.hostProfile,
      this.turnDirection,
      this.sortCardsBySuit,
      {
        SUD: this.slots.SUD.profile!,
        EST: this.slots.EST.profile!,
        NORD: this.slots.NORD.profile!,
        OUEST: this.slots.OUEST.profile!,
      },
      initialFirstAnnouncer,
    );
    fresh.matchMode = 'MULTIJOUEUR_HOTE';
    this.matchState = fresh;
    this.processAiTurns();

    this.broadcastLobby();
    this.broadcastMatchSnapshots('LANCER_PARTIE');
    this.emitChange();
    return { ok: true };
  }

  /**
   * Action locale du joueur hôte (SUD).
   */
  applyHostBid(payload: BidActionPayload): { ok: true } | { ok: false; reason: string } {
    return this.applyBidAction('SUD', payload);
  }

  applyHostCard(cardId: string): { ok: true } | { ok: false; reason: string } {
    return this.applyCardAction('SUD', cardId);
  }

  advanceToNextRound(): { ok: true } | { ok: false; reason: string } {
    if (!this.matchState || this.matchState.phase !== 'FIN_DONNE') {
      return { ok: false, reason: 'La donne actuelle n’est pas terminée.' };
    }
    const next = startNextRound(this.matchState, this.sortCardsBySuit);
    next.matchMode = 'MULTIJOUEUR_HOTE';
    this.matchState = next;
    this.processAiTurns();
    this.broadcastMatchSnapshots('ETAT_COMPLET_PARTIE');
    this.emitChange();
    return { ok: true };
  }

  restartMatch(): { ok: true } | { ok: false; reason: string } {
    if (!this.matchState) {
      return this.startMatch();
    }
    const fresh = createNewMatch(
      this.hostProfile,
      this.turnDirection,
      this.sortCardsBySuit,
      {
        SUD: this.slots.SUD.profile ?? this.hostProfile,
        EST: this.slots.EST.profile ?? this.matchState.players.EST.profile,
        NORD: this.slots.NORD.profile ?? this.matchState.players.NORD.profile,
        OUEST: this.slots.OUEST.profile ?? this.matchState.players.OUEST.profile,
      },
    );
    fresh.matchMode = 'MULTIJOUEUR_HOTE';
    this.matchState = fresh;
    this.processAiTurns();
    this.broadcastMatchSnapshots('ETAT_COMPLET_PARTIE');
    this.emitChange();
    return { ok: true };
  }


  private processAiTurns(): void {
    if (!this.twoPlayerMode || !this.matchState) return;
    let safety = 0;
    while (
      this.matchState &&
      (this.matchState.phase === 'ENCHERES' || this.matchState.phase === 'JEU') &&
      (this.matchState.currentTurnSeat === 'EST' || this.matchState.currentTurnSeat === 'OUEST') &&
      safety < 12
    ) {
      safety += 1;
      const seat = this.matchState.currentTurnSeat;
      const context = extractAiContext(this.matchState, seat);
      if (this.matchState.phase === 'ENCHERES') {
        const bid = decideAiBid(context);
        if (bid.action === 'CONTRAT') this.matchState = applyBidContract(this.matchState, seat, bid.contract);
        else if (bid.action === 'CONTRE') this.matchState = applyBidContre(this.matchState, seat);
        else if (bid.action === 'SURCONTRE') this.matchState = applyBidSurcontre(this.matchState, seat);
        else this.matchState = applyBidPass(this.matchState, seat, this.sortCardsBySuit);
      } else if (this.matchState.activeContract) {
        const card = decideAiCard(context);
        this.matchState = applyPlayCard(this.matchState, seat, card.id);
      }
    }
  }

  private applyBidAction(
    seat: SeatPosition,
    payload: BidActionPayload,
  ): { ok: true } | { ok: false; reason: string } {
    if (!this.matchState) {
      return { ok: false, reason: 'La partie n’a pas encore démarré.' };
    }
    if (this.matchState.phase !== 'ENCHERES') {
      return { ok: false, reason: 'La phase d’enchères est terminée.' };
    }
    if (this.matchState.currentTurnSeat !== seat) {
      return { ok: false, reason: 'Ce n’est pas votre tour d’enchérir.' };
    }
    if (!payload || !payload.kind) {
      return { ok: false, reason: 'Enchère invalide.' };
    }

    if (payload.kind === 'PASSE') {
      if (!this.matchState.activeContract && seat === this.matchState.firstAnnouncerSeat) {
        return {
          ok: false,
          reason: 'Le premier annonceur est obligé de choisir un contrat.',
        };
      }
      this.matchState = applyBidPass(
        this.matchState,
        seat,
        this.sortCardsBySuit,
      );
    } else if (payload.kind === 'CONTRAT') {
      const contract = payload.contract as ContractType | undefined;
      if (!contract) {
        return { ok: false, reason: 'Contrat manquant.' };
      }
      if (this.matchState.declaringSeat === seat) {
        return {
          ok: false,
          reason: 'Vous détenez déjà le contrat actuel.',
        };
      }
      if (
        !isContractAllowedOver(
          contract,
          this.matchState.activeContract,
          this.matchState.contreLevel,
        )
      ) {
        return {
          ok: false,
          reason: 'Contrat non autorisé selon la hiérarchie actuelle.',
        };
      }
      this.matchState = applyBidContract(this.matchState, seat, contract);
    } else if (payload.kind === 'CONTRE') {
      if (
        !canSeatContre(
          seat,
          this.matchState.activeContract,
          this.matchState.declaringSeat,
          this.matchState.contreLevel,
        )
      ) {
        return {
          ok: false,
          reason: 'Contre interdit (vous ne pouvez pas contrer votre équipe).',
        };
      }
      this.matchState = applyBidContre(this.matchState, seat);
    } else if (payload.kind === 'SURCONTRE') {
      if (
        !canSeatSurcontre(
          seat,
          this.matchState.activeContract,
          this.matchState.declaringSeat,
          this.matchState.contreLevel,
        )
      ) {
        return {
          ok: false,
          reason: 'Surcontre interdit pour votre siège.',
        };
      }
      this.matchState = applyBidSurcontre(this.matchState, seat);
    } else {
      return { ok: false, reason: 'Type d’enchère inconnu.' };
    }

    this.processAiTurns();
    this.broadcastMatchSnapshots('ETAT_COMPLET_PARTIE');
    this.emitChange();
    return { ok: true };
  }

  private applyCardAction(
    seat: SeatPosition,
    cardId: string,
  ): { ok: true } | { ok: false; reason: string } {
    if (!this.matchState) {
      return { ok: false, reason: 'La partie n’a pas encore démarré.' };
    }
    if (this.matchState.phase !== 'JEU' || !this.matchState.activeContract) {
      return { ok: false, reason: 'Impossible de jouer une carte actuellement.' };
    }
    if (this.matchState.currentTurnSeat !== seat) {
      return { ok: false, reason: 'Ce n’est pas votre tour de jouer.' };
    }
    if (!cardId) {
      return { ok: false, reason: 'Identifiant de carte manquant.' };
    }

    const player = this.matchState.players[seat];
    const hasCard = player.hand.some((c) => c.id === cardId);
    if (!hasCard) {
      return { ok: false, reason: 'Cette carte n’est pas dans votre main.' };
    }

    const playable = getPlayableCards(
      player.hand,
      this.matchState.currentTrick,
      this.matchState.activeContract,
      seat,
    );
    if (!playable.some((c) => c.id === cardId)) {
      return {
        ok: false,
        reason: 'Carte illégale selon les règles de couleur/coupe/montée.',
      };
    }

    this.matchState = applyPlayCard(this.matchState, seat, cardId);
    this.processAiTurns();
    this.broadcastMatchSnapshots('ETAT_COMPLET_PARTIE');
    this.emitChange();
    return { ok: true };
  }

  closeSession(reason = 'L’hôte a quitté la partie. Session interrompue.'): void {
    if (this.closed) return;
    this.closed = true;
    const msg = this.nextMessage<HostClosedPayload>('HOTE_FERME', { reason });
    for (const seat of REMOTE_SEATS) {
      const cid = this.clientIdBySeat[seat];
      if (cid && this.slots[seat].connected) {
        this.transport.sendToClient(cid, msg);
      }
    }
    this.emitChange();
  }
}
