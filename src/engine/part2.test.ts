import { parseOwBelotyInviteText } from '../components/JoinMatchView';
import { Card, MatchState, PlayerProfile, SeatPosition } from '../types/game';
import { SyncMessage } from '../types/network';
import {
  decideAiBid,
  decideAiCard,
  evaluateHandForContract,
  extractAiContext,
} from './ai';
import {
  applyBidContre,
  applyBidContract,
  applyBidPass,
  applyBidSurcontre,
  applyPlayCard,
  createNewMatch,
  startNextRound,
} from './match';
import { MultiplayerClientSession } from './multiplayerClient';
import { MultiplayerHostSession } from './multiplayerHost';
import { getPlayableCards } from './tricks';

function assert(condition: boolean, message = 'Assertion échouée'): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Attendu ${String(expected)}, reçu ${String(actual)}`,
    );
  }
}

export interface Part2TestResult {
  name: string;
  passed: boolean;
  details: string;
}

function makeProfile(id: string, pseudo: string, avatarDataUrl: string | null = null): PlayerProfile {
  return {
    id,
    pseudo,
    avatarDataUrl,
    updatedAt: 1700000000000,
    deviceTag: `Device-${id}`,
  };
}

/**
 * Harnais de transport en mémoire reliant 1 hôte et N clients sans aucune simulation factice
 * de la logique : chaque message transite sérialisé en JSON comme sur la socket WebSocket réelle.
 */
function createInMemoryNetworkHarness(hostProfile: PlayerProfile, sessionCode = 'OWB-TEST') {
  const clients = new Map<string, MultiplayerClientSession>();

  const host = new MultiplayerHostSession({
    hostProfile,
    sessionCode,
    port: 7432,
    turnDirection: 'ANTI_HORAIRE',
    sortCardsBySuit: true,
    transport: {
      sendToClient: (clientId, msg: SyncMessage) => {
        const serialized = JSON.stringify(msg);
        const client = clients.get(clientId);
        if (client) {
          client.handleServerMessage(serialized);
        }
      },
    },
  });

  function connectClient(clientId: string, profile: PlayerProfile, code = sessionCode) {
    const client = new MultiplayerClientSession({
      profile,
      sessionCode: code,
      transport: {
        send: (msg: SyncMessage) => {
          host.handleClientMessage(clientId, JSON.stringify(msg));
        },
        close: () => {
          clients.delete(clientId);
          host.handleClientDisconnected(clientId);
        },
      },
    });
    clients.set(clientId, client);
    client.onTransportOpened();
    return client;
  }

  function dropClient(clientId: string) {
    const client = clients.get(clientId);
    clients.delete(clientId);
    host.handleClientDisconnected(clientId);
    client?.onTransportClosed(false);
  }

  return { host, clients, connectClient, dropClient };
}

export function runPart2Tests(): Part2TestResult[] {
  const results: Part2TestResult[] = [];

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

  // ========================
  // 1. TESTS MODE SOLO & IA
  // ========================

  test('IA Solo : isolation stricte des mains cachées via extractAiContext', () => {
    const match = createNewMatch(makeProfile('p-sud', 'Humain'), 'ANTI_HORAIRE', true, undefined, 'SUD');
    const ctx = extractAiContext(match, 'EST');
    assertEqual(ctx.seat, 'EST');
    assertEqual(ctx.hand.length, 5);
    assertEqual((ctx as unknown as Record<string, unknown>).players, undefined);
    assertEqual((ctx as unknown as Record<string, unknown>).remainingCardsBySeat, undefined);
    // Vérifier qu'aucune carte de SUD n'est dans ctx.hand
    const sudIds = new Set(match.players.SUD.hand.map((c) => c.id));
    for (const c of ctx.hand) {
      assert(!sudIds.has(c.id), 'La main IA ne doit jamais contenir de carte du joueur humain');
    }
  });

  test('IA Solo : le 1er annonceur choisit obligatoirement un contrat (ne passe jamais)', () => {
    const weakHand: Card[] = [
      { id: 'TREFLE_7', suit: 'TREFLE', rank: '7' },
      { id: 'TREFLE_8', suit: 'TREFLE', rank: '8' },
      { id: 'CARREAU_7', suit: 'CARREAU', rank: '7' },
      { id: 'COEUR_8', suit: 'COEUR', rank: '8' },
      { id: 'PIQUE_9', suit: 'PIQUE', rank: '9' },
    ];
    const bid = decideAiBid({
      seat: 'EST',
      hand: weakHand,
      activeContract: null,
      declaringSeat: null,
      declaringTeam: null,
      contreLevel: 'AUCUN',
      firstAnnouncerSeat: 'EST',
      consecutivePasses: 0,
      bidHistory: [],
      currentTrick: [],
      completedTricks: [],
      turnDirection: 'ANTI_HORAIRE',
    });
    assertEqual(bid.action, 'CONTRAT');
  });

  test('IA Solo : évaluation des enchères et choix cohérent (V+9+A à Cœur => Cœur)', () => {
    const strongCoeur: Card[] = [
      { id: 'COEUR_V', suit: 'COEUR', rank: 'V' },
      { id: 'COEUR_9', suit: 'COEUR', rank: '9' },
      { id: 'COEUR_A', suit: 'COEUR', rank: 'A' },
      { id: 'PIQUE_A', suit: 'PIQUE', rank: 'A' },
      { id: 'TREFLE_7', suit: 'TREFLE', rank: '7' },
    ];
    const coeurScore = evaluateHandForContract(strongCoeur, 'COEUR');
    const trefleScore = evaluateHandForContract(strongCoeur, 'TREFLE');
    assert(coeurScore > trefleScore, 'Le score Cœur doit nettement dépasser Trèfle');

    const bid = decideAiBid({
      seat: 'NORD',
      hand: strongCoeur,
      activeContract: 'TREFLE',
      declaringSeat: 'EST',
      declaringTeam: 'EQUIPE_B',
      contreLevel: 'AUCUN',
      firstAnnouncerSeat: 'EST',
      consecutivePasses: 0,
      bidHistory: [{ seat: 'EST', action: 'CONTRAT', contract: 'TREFLE' }],
      currentTrick: [],
      completedTricks: [],
      turnDirection: 'ANTI_HORAIRE',
    });
    assert(bid.action === 'CONTRAT' && bid.contract === 'COEUR', 'L’IA doit surenchérir à Cœur');
  });

  test('IA Solo : ne contre jamais son partenaire et peut contrer un adversaire avec gros jeu défensif', () => {
    const defenseHand: Card[] = [
      { id: 'TREFLE_V', suit: 'TREFLE', rank: 'V' },
      { id: 'TREFLE_9', suit: 'TREFLE', rank: '9' },
      { id: 'TREFLE_A', suit: 'TREFLE', rank: 'A' },
      { id: 'PIQUE_A', suit: 'PIQUE', rank: 'A' },
      { id: 'COEUR_A', suit: 'COEUR', rank: 'A' },
    ];
    // Partenaire OUEST a pris Trèfle -> EST ne doit PAS contrer
    const bidPartner = decideAiBid({
      seat: 'EST',
      hand: defenseHand,
      activeContract: 'TREFLE',
      declaringSeat: 'OUEST',
      declaringTeam: 'EQUIPE_B',
      contreLevel: 'AUCUN',
      firstAnnouncerSeat: 'OUEST',
      consecutivePasses: 1,
      bidHistory: [],
      currentTrick: [],
      completedTricks: [],
      turnDirection: 'ANTI_HORAIRE',
    });
    assert(bidPartner.action !== 'CONTRE', 'Interdiction de contrer son partenaire');

    // Adversaire SUD a pris Trèfle -> EST doit contrer
    const bidEnemy = decideAiBid({
      seat: 'EST',
      hand: defenseHand,
      activeContract: 'TREFLE',
      declaringSeat: 'SUD',
      declaringTeam: 'EQUIPE_A',
      contreLevel: 'AUCUN',
      firstAnnouncerSeat: 'SUD',
      consecutivePasses: 0,
      bidHistory: [],
      currentTrick: [],
      completedTricks: [],
      turnDirection: 'ANTI_HORAIRE',
    });
    assertEqual(bidEnemy.action, 'CONTRE');
  });

  test('IA Solo : préserve un As non nécessaire quand le partenaire est maître dernier de main', () => {
    // Contrat Sans Atout : Partenaire NORD gagne avec As de Cœur, EST est 4e et n'a pas de Cœur.
    // EST a 7 de Trèfle, As de Pique, 10 de Carreau -> ne doit pas jeter son As de Pique maître !
    const chosen = decideAiCard({
      seat: 'EST',
      hand: [
        { id: 'PIQUE_A', suit: 'PIQUE', rank: 'A' },
        { id: 'TREFLE_7', suit: 'TREFLE', rank: '7' },
        { id: 'CARREAU_10', suit: 'CARREAU', rank: '10' },
      ],
      activeContract: 'SANS_ATOUT',
      declaringSeat: 'NORD',
      declaringTeam: 'EQUIPE_A',
      contreLevel: 'AUCUN',
      firstAnnouncerSeat: 'NORD',
      consecutivePasses: 3,
      bidHistory: [],
      currentTrick: [
        { seat: 'OUEST', card: { id: 'COEUR_A', suit: 'COEUR', rank: 'A' } },
        { seat: 'SUD', card: { id: 'COEUR_7', suit: 'COEUR', rank: '7' } },
        { seat: 'NORD', card: { id: 'COEUR_8', suit: 'COEUR', rank: '8' } },
      ],
      completedTricks: [],
      turnDirection: 'ANTI_HORAIRE',
    });
    assert(chosen.id !== 'PIQUE_A', 'L’IA ne doit pas gaspiller son As maître sur le pli déjà gagné par le partenaire');
  });

  test('IA Solo : simulation complète d’une partie jusqu’à 150 pts ou capot avec coups 100% légaux', () => {
    let state: MatchState = createNewMatch(
      makeProfile('humain', 'Joueur Test'),
      'ANTI_HORAIRE',
      true,
      undefined,
      'SUD',
    );
    state.matchMode = 'SOLO_IA';

    let guard = 0;
    while (state.phase !== 'FIN_PARTIE' && guard < 2000) {
      guard += 1;
      if (state.phase === 'FIN_DONNE') {
        state = startNextRound(state, true);
        state.matchMode = 'SOLO_IA';
        continue;
      }

      const seat = state.currentTurnSeat;
      const ctx = extractAiContext(state, seat);

      if (state.phase === 'ENCHERES') {
        const bid = decideAiBid(ctx);
        if (bid.action === 'CONTRAT') {
          state = applyBidContract(state, seat, bid.contract);
        } else if (bid.action === 'CONTRE') {
          state = applyBidContre(state, seat);
        } else if (bid.action === 'SURCONTRE') {
          state = applyBidSurcontre(state, seat);
        } else {
          state = applyBidPass(state, seat, true);
        }
      } else if (state.phase === 'JEU' && state.activeContract) {
        const legal = getPlayableCards(
          state.players[seat].hand,
          state.currentTrick,
          state.activeContract,
          seat,
        );
        const chosen = decideAiCard(ctx);
        assert(
          legal.some((c) => c.id === chosen.id),
          `Carte IA illégale (${chosen.id}) au tour de ${seat}`,
        );
        state = applyPlayCard(state, seat, chosen.id);
      }
    }

    assertEqual(state.phase, 'FIN_PARTIE', 'La partie Solo complète doit atteindre FIN_PARTIE');
    assert(state.winnerTeam !== null, 'Une équipe gagnante doit être désignée');
    assert(state.ledger.length >= 1, 'Le carnet de score doit contenir au moins une donne');
  });

  // ======================================
  // 2. TESTS MULTIJOUEUR HOTSPOT HÔTE/CLIENT
  // ======================================

  test('Multijoueur : création de salon, arrivée de 4 joueurs, rejet du 5e et synchro des profils/photos', () => {
    const pSud = makeProfile('id-sud', 'Alice Hôte', 'data:image/jpeg;base64,AAA');
    const pEst = makeProfile('id-est', 'Bob Est', 'data:image/jpeg;base64,BBB');
    const pNord = makeProfile('id-nord', 'Chloé Nord', 'data:image/jpeg;base64,CCC');
    const pOuest = makeProfile('id-ouest', 'David Ouest', 'data:image/jpeg;base64,DDD');
    const pExtra = makeProfile('id-extra', 'Intrus');

    const { host, connectClient } = createInMemoryNetworkHarness(pSud, 'OWB-9999');

    // Mauvais code session rejeté
    const badClient = connectClient('cid-bad', pEst, 'OWB-0000');
    assertEqual(badClient.getState().phase, 'CONNEXION');
    assert(
      (badClient.getState().errorMessage ?? '').includes('Code de session incorrect'),
      'Un mauvais code session doit être rejeté',
    );

    const cEst = connectClient('cid-est', pEst);
    const cNord = connectClient('cid-nord', pNord);
    const cOuest = connectClient('cid-ouest', pOuest);

    assertEqual(cEst.getState().mySeat, 'EST');
    assertEqual(cNord.getState().mySeat, 'NORD');
    assertEqual(cOuest.getState().mySeat, 'OUEST');
    assertEqual(host.getConnectedCount(), 4);
    assert(host.canStartMatch(), 'La table à 4/4 doit pouvoir démarrer');

    // 5e joueur refusé
    const cExtra = connectClient('cid-extra', pExtra);
    assertEqual(cExtra.getState().mySeat, null);
    assert(
      (cExtra.getState().errorMessage ?? '').includes('complète'),
      'Un 5e joueur doit être refusé',
    );

    // Vérifier synchronisation des pseudos & photos sur le lobby client
    const lobbyNord = cNord.getState().lobbyPlayers;
    assertEqual(lobbyNord.length, 4);
    assertEqual(lobbyNord.find((s) => s.seat === 'SUD')?.profile?.avatarDataUrl, 'data:image/jpeg;base64,AAA');
    assertEqual(lobbyNord.find((s) => s.seat === 'EST')?.profile?.pseudo, 'Bob Est');
  });

  test('Multijoueur : distribution 3+2 puis +3 et confidentialité stricte des mains', () => {
    const pSud = makeProfile('id-sud', 'Hôte');
    const pEst = makeProfile('id-est', 'Est');
    const pNord = makeProfile('id-nord', 'Nord');
    const pOuest = makeProfile('id-ouest', 'Ouest');

    const { host, connectClient } = createInMemoryNetworkHarness(pSud);
    const cEst = connectClient('cid-est', pEst);
    const cNord = connectClient('cid-nord', pNord);
    const cOuest = connectClient('cid-ouest', pOuest);

    const started = host.startMatch('SUD');
    assert(started.ok, 'Le lancement à 4 joueurs doit réussir');

    // Chaque client a exactement 5 cartes pour lui-même et 0 pour les autres
    const estSnap = cEst.getState().matchState!;
    assertEqual(estSnap.players.EST.hand.length, 5);
    assertEqual(estSnap.players.SUD.hand.length, 0);
    assertEqual(estSnap.players.NORD.hand.length, 0);
    assertEqual(estSnap.players.OUEST.hand.length, 0);
    assertEqual(estSnap.remainingCardsBySeat.EST.length, 0);

    // Enchères : SUD annonce Trèfle, puis EST/NORD/OUEST passent -> passage à 8 cartes
    assert(host.applyHostBid({ kind: 'CONTRAT', contract: 'TREFLE' }).ok);
    cEst.sendBidPass();
    cNord.sendBidPass();
    cOuest.sendBidPass();

    assertEqual(host.getAuthoritativeMatchState()!.phase, 'JEU');
    assertEqual(cEst.getState().matchState!.players.EST.hand.length, 8);
    assertEqual(cNord.getState().matchState!.players.NORD.hand.length, 8);
    assertEqual(cOuest.getState().matchState!.players.OUEST.hand.length, 8);
    assertEqual(cEst.getState().matchState!.players.SUD.hand.length, 0);
  });

  test('Multijoueur : rejet des actions illégales (hors tour, carte absente, règle non respectée, donne non autorisée)', () => {
    const pSud = makeProfile('id-sud', 'Hôte');
    const pEst = makeProfile('id-est', 'Est');
    const pNord = makeProfile('id-nord', 'Nord');
    const pOuest = makeProfile('id-ouest', 'Ouest');

    const { host, connectClient } = createInMemoryNetworkHarness(pSud);
    const cEst = connectClient('cid-est', pEst);
    const cNord = connectClient('cid-nord', pNord);
    const cOuest = connectClient('cid-ouest', pOuest);

    host.startMatch('SUD');

    // EST essaie d'enchérir alors que c'est le tour de SUD
    cEst.sendBidContract('COEUR');
    assert(
      (cEst.getState().errorMessage ?? '').includes('pas votre tour'),
      'Une enchère hors tour doit être rejetée',
    );
    assertEqual(host.getAuthoritativeMatchState()!.activeContract, null);

    // SUD tente de passer en tant que 1er annonceur -> rejeté
    const badHostPass = host.applyHostBid({ kind: 'PASSE' });
    assert(!badHostPass.ok, 'Le 1er annonceur ne peut pas passer');

    // SUD annonce Pique, EST passe, NORD tente de contrer son partenaire SUD -> rejeté
    assert(host.applyHostBid({ kind: 'CONTRAT', contract: 'PIQUE' }).ok);
    cEst.sendBidPass();
    cNord.sendBidContre();
    assert(
      (cNord.getState().errorMessage ?? '').includes('Contre interdit'),
      'Un joueur ne peut pas contrer son partenaire',
    );
    cNord.sendBidPass();
    cOuest.sendBidPass();

    // Maintenant phase JEU, c'est à SUD de jouer
    const auth = host.getAuthoritativeMatchState()!;
    assertEqual(auth.phase, 'JEU');

    // EST essaie de jouer une carte hors tour
    const estCard = auth.players.EST.hand[0].id;
    cEst.sendPlayCard(estCard);
    assert(
      (cEst.getState().errorMessage ?? '').includes('pas votre tour'),
      'Un jeu de carte hors tour doit être rejeté',
    );

    // SUD joue une carte légale
    const sudCard = auth.players.SUD.hand[0];
    assert(host.applyHostCard(sudCard.id).ok);

    // Au tour d'EST : si EST essaie de jouer une carte appartenant à SUD -> rejeté
    cEst.sendPlayCard(sudCard.id);
    assert(
      (cEst.getState().errorMessage ?? '').includes('pas dans votre main'),
      'Jouer la carte d’un autre joueur doit être rejeté',
    );

    // Si EST possède la couleur demandée mais essaie de jouer une autre couleur -> rejeté
    const estHand = host.getAuthoritativeMatchState()!.players.EST.hand;
    const sameSuit = estHand.filter((c) => c.suit === sudCard.suit);
    const diffSuit = estHand.filter((c) => c.suit !== sudCard.suit);
    if (sameSuit.length > 0 && diffSuit.length > 0) {
      cEst.sendPlayCard(diffSuit[0].id);
      assert(
        (cEst.getState().errorMessage ?? '').includes('Carte illégale'),
        'Ne pas fournir la couleur demandée doit être rejeté par l’hôte',
      );
    }

    // Un client tente d'envoyer ACTION_DONNE_SUIVANTE -> rejeté par l'hôte
    host.handleClientMessage('cid-est', {
      type: 'ACTION_DONNE_SUIVANTE',
      matchId: auth.matchId,
      senderProfileId: pEst.id,
      sequence: 99,
      timestamp: Date.now(),
      payload: {},
    });
    assert(
      (cEst.getState().errorMessage ?? '').includes('Seul l’hôte'),
      'Un client ne peut pas forcer le passage à la donne suivante',
    );
  });

  test('Multijoueur : déconnexion temporaire et reconnexion avec récupération complète de main et siège', () => {
    const pSud = makeProfile('id-sud', 'Hôte');
    const pEst = makeProfile('id-est', 'Bob');
    const pNord = makeProfile('id-nord', 'Chloé');
    const pOuest = makeProfile('id-ouest', 'David');

    const { host, connectClient, dropClient } = createInMemoryNetworkHarness(pSud);
    const cEst = connectClient('cid-est', pEst);
    const cNord = connectClient('cid-nord', pNord);
    const cOuest = connectClient('cid-ouest', pOuest);

    host.startMatch('SUD');
    host.applyHostBid({ kind: 'CONTRAT', contract: 'COEUR' });
    cEst.sendBidPass();
    cNord.sendBidPass();
    cOuest.sendBidPass();

    const expectedEstHandIds = cEst
      .getState()
      .matchState!.players.EST.hand.map((c) => c.id)
      .join(',');

    // Bob (EST) se déconnecte temporairement
    dropClient('cid-est');
    assertEqual(host.getLobbyPlayers().find((s) => s.seat === 'EST')?.connected, false);
    assert(
      (cNord.getState().noticeMessage ?? '').includes('déconnecté'),
      'Les autres joueurs doivent être notifiés de la déconnexion',
    );

    // Bob se reconnecte avec une nouvelle socket mais le même profile.id
    const cEstReconnected = connectClient('cid-est-new', pEst);
    assertEqual(cEstReconnected.getState().phase, 'EN_PARTIE');
    assertEqual(cEstReconnected.getState().mySeat, 'EST');
    const recoveredHandIds = cEstReconnected
      .getState()
      .matchState!.players.EST.hand.map((c) => c.id)
      .join(',');
    assertEqual(recoveredHandIds, expectedEstHandIds, 'Le joueur reconnecté doit retrouver exactement sa main privée');
  });

  test('Multijoueur : fermeture définitive par l’hôte notifie tous les clients (HOTE_FERME)', () => {
    const { host, connectClient } = createInMemoryNetworkHarness(makeProfile('id-sud', 'Hôte'));
    const cEst = connectClient('cid-est', makeProfile('id-est', 'Bob'));
    const cNord = connectClient('cid-nord', makeProfile('id-nord', 'Chloé'));

    host.closeSession('L’hôte a quitté la partie.');
    assertEqual(cEst.getState().phase, 'HOTE_FERME');
    assertEqual(cNord.getState().phase, 'HOTE_FERME');
    assert(
      (cEst.getState().errorMessage ?? '').includes('quitté'),
      'Le client doit afficher la notification de fermeture de l’hôte',
    );
  });

  test('Multijoueur : partie complète synchronisée sur les 4 téléphones jusqu’à fin de donne', () => {
    const pSud = makeProfile('id-sud', 'Alice');
    const pEst = makeProfile('id-est', 'Bob');
    const pNord = makeProfile('id-nord', 'Chloé');
    const pOuest = makeProfile('id-ouest', 'David');

    const { host, connectClient } = createInMemoryNetworkHarness(pSud);
    const cEst = connectClient('cid-est', pEst);
    const cNord = connectClient('cid-nord', pNord);
    const cOuest = connectClient('cid-ouest', pOuest);

    host.startMatch('SUD');
    host.applyHostBid({ kind: 'CONTRAT', contract: 'TREFLE' });
    cEst.sendBidPass();
    cNord.sendBidPass();
    cOuest.sendBidPass();

    // Jouer les 8 plis (32 cartes) via les clients autorisés et l'hôte
    for (let step = 0; step < 32; step++) {
      const auth = host.getAuthoritativeMatchState()!;
      assertEqual(auth.phase, 'JEU');
      const turnSeat: SeatPosition = auth.currentTurnSeat;

      if (turnSeat === 'SUD') {
        const mySnap = host.getHostViewMatchState()!;
        const playable = getPlayableCards(
          mySnap.players.SUD.hand,
          mySnap.currentTrick,
          mySnap.activeContract!,
          'SUD',
        );
        const res = host.applyHostCard(playable[0].id);
        assert(res.ok, `Hôte SUD doit pouvoir jouer: ${res.ok ? '' : res.reason}`);
      } else {
        const clientMap = { EST: cEst, NORD: cNord, OUEST: cOuest };
        const client = clientMap[turnSeat];
        const snap = client.getState().matchState!;
        const playable = getPlayableCards(
          snap.players[turnSeat].hand,
          snap.currentTrick,
          snap.activeContract!,
          turnSeat,
        );
        client.sendPlayCard(playable[0].id);
      }
    }

    const finalAuth = host.getAuthoritativeMatchState()!;
    assert(
      finalAuth.phase === 'FIN_DONNE' || finalAuth.phase === 'FIN_PARTIE',
      'Après 32 cartes jouées, la donne doit se terminer et calculer les scores',
    );
    // Vérifier que les scores sont identiques sur tous les téléphones
    assertEqual(cEst.getState().matchState!.scores.EQUIPE_A, finalAuth.scores.EQUIPE_A);
    assertEqual(cNord.getState().matchState!.scores.EQUIPE_B, finalAuth.scores.EQUIPE_B);
    assertEqual(cOuest.getState().matchState!.ledger.length, 1);
  });

  test('Multijoueur : analyseur de code QR OWBeloty', () => {
    const parsed1 = parseOwBelotyInviteText('OWBELOTY|192.168.43.1|7432|OWB-A1B2');
    assert(parsed1 !== null);
    assertEqual(parsed1!.hostIp, '192.168.43.1');
    assertEqual(parsed1!.port, 7432);
    assertEqual(parsed1!.sessionCode, 'OWB-A1B2');

    const parsed2 = parseOwBelotyInviteText('owbeloty://join?ip=192.168.1.25&port=7432&code=owb-9001');
    assert(parsed2 !== null);
    assertEqual(parsed2!.hostIp, '192.168.1.25');
    assertEqual(parsed2!.sessionCode, 'OWB-9001');
  });

  return results;
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('part2.test.ts')) {
  const results = runPart2Tests();
  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'} - ${r.name}${r.passed ? '' : `: ${r.details}`}`);
  }
  console.log(`\nTotal Partie 2: ${results.length} tests | Réussis: ${results.length - failed.length} | Échecs: ${failed.length}`);
  if (failed.length > 0) {
    process.exit(1);
  }
}
