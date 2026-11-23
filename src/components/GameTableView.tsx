import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Hand,
  RefreshCw,
  RotateCcw,
  Trophy,
  Wifi,
  X,
} from 'lucide-react';
import { decideAiBid, decideAiCard, extractAiContext } from '../engine/ai';
import { playCardSound, playTrickWinSound, playVictorySound } from '../engine/audio';
import { SUIT_META } from '../engine/cards';
import {
  canSeatContre,
  canSeatSurcontre,
  CONTRE_LABELS,
  CONTRACT_META,
  CONTRACT_OPTIONS,
  isContractAllowedOver,
} from '../engine/contracts';
import {
  applyBidContre,
  applyBidContract,
  applyBidPass,
  applyBidSurcontre,
  applyPlayCard,
  startNextRound,
} from '../engine/match';
import {
  getNextSeat,
  getPartnerSeat,
  getPreviousSeat,
  getTeamForSeat,
  TEAM_LABELS,
} from '../engine/players';
import { TARGET_MATCH_SCORE } from '../engine/scoring';
import { recordPlayerMatchResult } from '../engine/profiles';
import { getPlayableCards, resolveCompletedTrick } from '../engine/tricks';
import {
  AppSettings,
  ContractType,
  MatchState,
  SeatPosition,
  TrickCard,
} from '../types/game';
import { BidActionPayload } from '../types/network';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayingCard } from './PlayingCard';

interface GameTableViewProps {
  initialMatch: MatchState;
  externalMatch?: MatchState | null;
  localPerspectiveSeat?: SeatPosition;
  networkNotice?: string | null;
  networkError?: string | null;
  clientDisconnected?: boolean;
  hostClosedReason?: string | null;
  disconnectedSeats?: SeatPosition[];
  onClientReconnect?: () => void;
  onDispatchBid?: (action: BidActionPayload) => void;
  onDispatchCard?: (cardId: string) => void;
  onDispatchNextRound?: () => void;
  onDispatchRestart?: () => void;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onRestartMatch: () => MatchState;
  onExitToHome: () => void;
}

export const GameTableView: React.FC<GameTableViewProps> = ({
  initialMatch,
  externalMatch,
  localPerspectiveSeat = 'SUD',
  networkNotice,
  networkError,
  clientDisconnected = false,
  hostClosedReason = null,
  disconnectedSeats = [],
  onClientReconnect,
  onDispatchBid,
  onDispatchCard,
  onDispatchNextRound,
  onDispatchRestart,
  settings,
  onUpdateSettings,
  onRestartMatch,
  onExitToHome,
}) => {
  const [localMatch, setLocalMatch] = useState<MatchState>(initialMatch);
  const match = externalMatch ?? localMatch;
  const matchMode = match.matchMode ?? 'LOCAL_TEST';

  const isSoloAi = matchMode === 'SOLO_IA';
  const isMultiplayerHost = matchMode === 'MULTIJOUEUR_HOTE';
  const isMultiplayerClient = matchMode === 'MULTIJOUEUR_CLIENT';
  const isMultiplayer = isMultiplayerHost || isMultiplayerClient;
  const isLocalTest = !isSoloAi && !isMultiplayer;

  const recordedResultsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (match.phase !== 'FIN_PARTIE' || !match.winnerTeam) return;
    if (!isSoloAi && !isMultiplayer) return;
    if (recordedResultsRef.current.has(match.matchId)) return;
    recordedResultsRef.current.add(match.matchId);
    const localPlayer = match.players[localPerspectiveSeat];
    const won = match.winnerTeam === getTeamForSeat(localPerspectiveSeat);
    if (isSoloAi) {
      recordPlayerMatchResult(localPlayer.profile.id, match.matchId, 'solo', won);
    } else {
      const partner = match.players[getPartnerSeat(localPerspectiveSeat)].profile.pseudo;
      recordPlayerMatchResult(localPlayer.profile.id, match.matchId, 'team', won, partner);
    }
  }, [match.phase, match.winnerTeam, match.matchId, match.players, localPerspectiveSeat, isSoloAi, isMultiplayer]);

  const [trickDisplayFreeze, setTrickDisplayFreeze] = useState<{
    cards: TrickCard[];
    winnerSeat: SeatPosition;
  } | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  const prevTricksCountRef = useRef(match.completedTricks.length);
  const prevPhaseRef = useRef(match.phase);

  // Synchronise quand une nouvelle partie locale/solo est injectée
  useEffect(() => {
    if (!externalMatch) {
      setLocalMatch(initialMatch);
      setTrickDisplayFreeze(null);
      prevTricksCountRef.current = initialMatch.completedTricks.length;
      prevPhaseRef.current = initialMatch.phase;
    }
  }, [initialMatch, externalMatch]);

  // En multijoueur, figer brièvement le 4e pli complet lorsqu'il vient de se terminer
  useEffect(() => {
    if (!isMultiplayer) return;
    if (
      match.completedTricks.length > prevTricksCountRef.current &&
      match.completedTricks.length > 0
    ) {
      const lastTrick = match.completedTricks[match.completedTricks.length - 1];
      setTrickDisplayFreeze({
        cards: lastTrick.cards,
        winnerSeat: lastTrick.winnerSeat,
      });
      const t = window.setTimeout(() => {
        setTrickDisplayFreeze(null);
      }, 700);
      prevTricksCountRef.current = match.completedTricks.length;
      prevPhaseRef.current = match.phase;
      return () => window.clearTimeout(t);
    }
    if (match.completedTricks.length < prevTricksCountRef.current) {
      setTrickDisplayFreeze(null);
    }
  }, [isMultiplayer, match.completedTricks, match.phase]);

  // Effets sonores discrets lors de victoire ou fin de pli
  useEffect(() => {
    if (match.phase === 'FIN_PARTIE' && prevPhaseRef.current !== 'FIN_PARTIE') {
      playVictorySound(settings.soundEffectsEnabled);
    } else if (match.completedTricks.length > prevTricksCountRef.current) {
      playTrickWinSound(settings.soundEffectsEnabled);
    }
    prevTricksCountRef.current = match.completedTricks.length;
    prevPhaseRef.current = match.phase;
  }, [match.completedTricks.length, match.phase, settings.soundEffectsEnabled]);

  const isLocalAutoMode =
    isLocalTest && settings.tableControlMode === 'TEST_AUTO_ADVERSAIRES';
  const activeSeat = match.currentTurnSeat;
  const activePlayer = match.players[activeSeat];

  // Tour des 3 IA en Mode Solo OU mode auto de la table locale
  useEffect(() => {
    if (isMultiplayer) return;
    if (!isSoloAi && !isLocalAutoMode) return;
    if (trickDisplayFreeze !== null) return;
    if (match.phase !== 'ENCHERES' && match.phase !== 'JEU') return;
    if (activeSeat === 'SUD') return;

    const timer = window.setTimeout(() => {
      if (isSoloAi) {
        const aiCtx = extractAiContext(match, activeSeat);
        if (match.phase === 'ENCHERES') {
          const bid = decideAiBid(aiCtx);
          if (bid.action === 'CONTRAT') {
            setLocalMatch((prev) => applyBidContract(prev, activeSeat, bid.contract));
          } else if (bid.action === 'CONTRE') {
            setLocalMatch((prev) => applyBidContre(prev, activeSeat));
          } else if (bid.action === 'SURCONTRE') {
            setLocalMatch((prev) => applyBidSurcontre(prev, activeSeat));
          } else {
            setLocalMatch((prev) =>
              applyBidPass(prev, activeSeat, settings.sortCardsBySuit),
            );
          }
          return;
        }

        if (match.phase === 'JEU' && match.activeContract) {
          const chosen = decideAiCard(aiCtx);
          handlePlayCardWithPause(activeSeat, chosen.id);
        }
        return;
      }

      // Mode TEST_AUTO_ADVERSAIRES conservé pour la table locale de test Partie 1
      if (match.phase === 'ENCHERES') {
        const mustDeclare =
          !match.activeContract && activeSeat === match.firstAnnouncerSeat;
        const suitCounts: Record<'TREFLE' | 'CARREAU' | 'COEUR' | 'PIQUE', number> = {
          TREFLE: 0,
          CARREAU: 0,
          COEUR: 0,
          PIQUE: 0,
        };
        activePlayer.hand.forEach((c) => {
          suitCounts[c.suit] += 1;
        });
        const bestSuit = (Object.keys(suitCounts) as Array<keyof typeof suitCounts>).sort(
          (a, b) => suitCounts[b] - suitCounts[a],
        )[0];

        if (mustDeclare) {
          setLocalMatch((prev) => applyBidContract(prev, activeSeat, bestSuit));
          return;
        }
        setLocalMatch((prev) =>
          applyBidPass(prev, activeSeat, settings.sortCardsBySuit),
        );
        return;
      }

      if (match.phase === 'JEU' && match.activeContract) {
        const playable = getPlayableCards(
          activePlayer.hand,
          match.currentTrick,
          match.activeContract,
          activeSeat,
        );
        if (playable.length > 0) {
          handlePlayCardWithPause(activeSeat, playable[0].id);
        }
      }
    }, 520);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMultiplayer,
    isSoloAi,
    isLocalAutoMode,
    trickDisplayFreeze,
    match.phase,
    match.currentTurnSeat,
    match.roundNumber,
    match.completedTricks.length,
    match.currentTrick.length,
    match.consecutivePasses,
  ]);

  const handlePlayCardWithPause = (seat: SeatPosition, cardId: string) => {
    if (trickDisplayFreeze !== null) return;
    playCardSound(settings.soundEffectsEnabled);

    if (isMultiplayer) {
      if (seat !== localPerspectiveSeat) return;
      onDispatchCard?.(cardId);
      return;
    }

    const cardObj = match.players[seat].hand.find((c) => c.id === cardId);
    if (!cardObj || !match.activeContract) return;

    if (match.currentTrick.length === 3) {
      const fullTrick = [...match.currentTrick, { seat, card: cardObj }];
      const resolved = resolveCompletedTrick(
        match.completedTricks.length + 1,
        fullTrick,
        match.activeContract,
      );
      setTrickDisplayFreeze({
        cards: fullTrick,
        winnerSeat: resolved.winnerSeat,
      });

      window.setTimeout(() => {
        setTrickDisplayFreeze(null);
        setLocalMatch((prev) => applyPlayCard(prev, seat, cardId));
      }, 750);
      return;
    }

    setLocalMatch((prev) => applyPlayCard(prev, seat, cardId));
  };

  const handleBidAction = (action: BidActionPayload) => {
    if (isMultiplayer) {
      if (activeSeat !== localPerspectiveSeat) return;
      onDispatchBid?.(action);
      return;
    }
    if (action.kind === 'PASSE') {
      setLocalMatch((prev) =>
        applyBidPass(prev, activeSeat, settings.sortCardsBySuit),
      );
    } else if (action.kind === 'CONTRAT' && action.contract) {
      setLocalMatch((prev) => applyBidContract(prev, activeSeat, action.contract!));
    } else if (action.kind === 'CONTRE') {
      setLocalMatch((prev) => applyBidContre(prev, activeSeat));
    } else if (action.kind === 'SURCONTRE') {
      setLocalMatch((prev) => applyBidSurcontre(prev, activeSeat));
    }
  };

  // Placement visuel relatif au joueur local :
  // - En Solo, Hôte ou Test 4 mains : Sud en bas (ou activeSeat en mode 4 mains)
  // - En Client multijoueur : le siège du téléphone client est toujours affiché en bas
  const seatTop: SeatPosition = isMultiplayerClient
    ? getPartnerSeat(localPerspectiveSeat)
    : 'NORD';
  const seatRight: SeatPosition = isMultiplayerClient
    ? getNextSeat(localPerspectiveSeat, 'ANTI_HORAIRE')
    : 'EST';
  const seatLeft: SeatPosition = isMultiplayerClient
    ? getPreviousSeat(localPerspectiveSeat, 'ANTI_HORAIRE')
    : 'OUEST';

  const bottomSeat: SeatPosition =
    isLocalTest && !isLocalAutoMode ? activeSeat : localPerspectiveSeat;
  const bottomPlayer = match.players[bottomSeat];

  const myTeam = getTeamForSeat(localPerspectiveSeat);
  const myTeamScore =
    myTeam === 'EQUIPE_A' ? match.scores.EQUIPE_A : match.scores.EQUIPE_B;
  const oppTeamScore =
    myTeam === 'EQUIPE_A' ? match.scores.EQUIPE_B : match.scores.EQUIPE_A;

  const isMyTurn =
    isMultiplayer || isSoloAi || isLocalAutoMode
      ? activeSeat === localPerspectiveSeat
      : true;

  const playableIds = useMemo(() => {
    if (match.phase !== 'JEU' || !match.activeContract || trickDisplayFreeze) {
      return new Set<string>();
    }
    if (!isMyTurn) {
      return new Set<string>();
    }
    const list = getPlayableCards(
      bottomPlayer.hand,
      match.currentTrick,
      match.activeContract,
      bottomSeat,
    );
    return new Set(list.map((c) => c.id));
  }, [
    match.phase,
    match.activeContract,
    match.currentTrick,
    trickDisplayFreeze,
    isMyTurn,
    bottomPlayer.hand,
    bottomSeat,
  ]);

  const tricksWonA = match.completedTricks.filter(
    (t) => t.winnerTeam === 'EQUIPE_A',
  ).length;
  const tricksWonB = match.completedTricks.length - tricksWonA;

  const myTeamTricks = myTeam === 'EQUIPE_A' ? tricksWonA : tricksWonB;
  const oppTeamTricks = myTeam === 'EQUIPE_A' ? tricksWonB : tricksWonA;

  const displayedTrickCards = trickDisplayFreeze
    ? trickDisplayFreeze.cards
    : match.currentTrick;

  const trickCardBySeat = useMemo(() => {
    const map: Partial<Record<SeatPosition, TrickCard>> = {};
    for (const tc of displayedTrickCards) {
      map[tc.seat] = tc;
    }
    return map;
  }, [displayedTrickCards]);

  const canActInBidding = match.phase === 'ENCHERES' && isMyTurn;

  const canPassInBidding =
    canActInBidding &&
    !(match.activeContract === null && activeSeat === match.firstAnnouncerSeat);

  const canContre =
    canActInBidding &&
    canSeatContre(
      activeSeat,
      match.activeContract,
      match.declaringSeat,
      match.contreLevel,
    );

  const canSurcontre =
    canActInBidding &&
    canSeatSurcontre(
      activeSeat,
      match.activeContract,
      match.declaringSeat,
      match.contreLevel,
    );

  const latestLedger =
    match.ledger.length > 0 ? match.ledger[match.ledger.length - 1] : null;

  const toggleControlMode = () => {
    onUpdateSettings({
      ...settings,
      tableControlMode: isLocalAutoMode
        ? 'CONTROLE_4_MAINS'
        : 'TEST_AUTO_ADVERSAIRES',
    });
  };

  const seatCardCountLabel = (seat: SeatPosition): number => {
    if (!isMultiplayer) return match.players[seat].hand.length;
    // En multijoueur, les mains adverses sont masquées (hand = []), on déduit le nombre exact de cartes restantes
    if (seat === localPerspectiveSeat) return match.players[seat].hand.length;
    if (match.phase === 'ENCHERES') return 5;
    if (match.phase === 'FIN_DONNE' || match.phase === 'FIN_PARTIE') return 0;
    const playedBySeat =
      match.completedTricks.length +
      (match.currentTrick.some((tc) => tc.seat === seat) ? 1 : 0);
    return Math.max(0, 8 - playedBySeat);
  };

  return (
    <div className="min-h-dvh flex flex-col felt-surface relative overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20 bg-cover bg-center mix-blend-overlay"
        style={{
          backgroundImage: 'url(/src/assets/images/owbeloty_table_felt_1794998087991.jpg)',
        }}
      />

      {/* Barre supérieure compacte */}
      <header className="relative z-20 h-14 bg-[#051C11]/90 backdrop-blur-md border-b border-white/10 px-2 sm:px-4 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onExitToHome}
          aria-label="Quitter la table"
          className="min-w-[44px] min-h-[44px] px-2 flex items-center gap-1 rounded-xl text-emerald-100 hover:bg-white/10 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-medium hidden sm:inline whitespace-nowrap">
            Quitter
          </span>
        </button>

        {/* Tableau des scores */}
        <div className="flex items-center gap-3 text-xs sm:text-sm font-medium tabular-nums truncate">
          <span className="text-amber-300 font-semibold whitespace-nowrap">
            Nous {myTeamScore}
          </span>
          <span className="text-white/35" aria-hidden="true">
            /
          </span>
          <span className="text-emerald-100 font-semibold whitespace-nowrap">
            Eux {oppTeamScore}
          </span>
          <span className="text-white/40 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-emerald-200/70 hidden sm:inline whitespace-nowrap">
            Objectif {TARGET_MATCH_SCORE}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLocalTest && (
            <button
              type="button"
              onClick={toggleControlMode}
              title={
                isLocalAutoMode
                  ? 'Passer au contrôle manuel des 4 mains'
                  : 'Passer en avance automatique des autres sièges'
              }
              className="min-h-[40px] px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] sm:text-xs font-medium text-emerald-100 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Hand className="w-3.5 h-3.5 text-amber-300" />
              <span>{isLocalAutoMode ? 'Auto' : '4 mains'}</span>
            </button>
          )}

          {isMultiplayer && (
            <span className="px-2 py-1 rounded-lg bg-white/10 text-[11px] font-medium text-amber-200 flex items-center gap-1 whitespace-nowrap">
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isMultiplayerHost ? 'Hôte' : `Siège ${localPerspectiveSeat}`}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowLedger(true)}
            aria-label="Ouvrir le carnet de score"
            className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-medium hidden sm:inline">Carnet</span>
          </button>
        </div>
      </header>

      {/* Bandeau d'alertes réseau multijoueur (déconnexion, rejet d'action, reconnexion) */}
      {(networkError || networkNotice || disconnectedSeats.length > 0 || clientDisconnected) && (
        <div className="relative z-20 px-3 pt-2 max-w-4xl w-full mx-auto flex flex-col gap-1.5">
          {clientDisconnected && (
            <div className="rounded-xl bg-red-950/85 border border-red-400/40 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-red-100">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                Connexion perdue avec le téléphone hôte.
              </span>
              {onClientReconnect && (
                <button
                  type="button"
                  onClick={onClientReconnect}
                  className="min-h-[34px] px-3 rounded-lg bg-amber-400 text-[#062114] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reconnecter</span>
                </button>
              )}
            </div>
          )}

          {!clientDisconnected && disconnectedSeats.length > 0 && (
            <div className="rounded-xl bg-amber-950/80 border border-amber-400/35 px-3.5 py-2 flex items-center gap-2 text-xs text-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                Joueur(s) hors ligne :{' '}
                {disconnectedSeats
                  .map((s) => match.players[s].profile.pseudo)
                  .join(', ')}{' '}
                — en attente de reconnexion.
              </span>
            </div>
          )}

          {networkError && (
            <div className="rounded-xl bg-red-950/80 border border-red-400/35 px-3.5 py-2 flex items-center gap-2 text-xs text-red-100">
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
              <span>{networkError}</span>
            </div>
          )}

          {networkNotice && !networkError && (
            <div className="rounded-xl bg-emerald-950/80 border border-emerald-400/30 px-3.5 py-2 text-xs text-emerald-100">
              {networkNotice}
            </div>
          )}
        </div>
      )}

      {/* Plateau de table principal */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-2 sm:px-6 py-2 flex flex-col justify-between gap-1.5">
        {/* Siège HAUT (Partenaire) */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10">
            <PlayerAvatar
              profile={match.players[seatTop].profile}
              size="sm"
              isActiveTurn={
                activeSeat === seatTop &&
                (match.phase === 'ENCHERES' || match.phase === 'JEU')
              }
              isDealer={match.dealerSeat === seatTop}
            />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[#F7F4EB] truncate max-w-[160px]">
                {match.players[seatTop].profile.pseudo}
                {disconnectedSeats.includes(seatTop) ? ' (Hors ligne)' : ''}
              </div>
              <div className="text-[11px] text-emerald-200/75 tabular-nums">
                {seatCardCountLabel(seatTop)} cartes · Plis Nous : {myTeamTricks}
              </div>
            </div>
          </div>

          {seatCardCountLabel(seatTop) > 0 && bottomSeat !== seatTop && (
            <div className="flex items-center -space-x-5" aria-hidden="true">
              {Array.from({ length: seatCardCountLabel(seatTop) }).map((_, idx) => (
                <PlayingCard key={`top-back-${idx}`} faceDown size="xs" />
              ))}
            </div>
          )}
        </div>

        {/* Zone centrale : GAUCHE — TAPIS DE PLI — DROITE */}
        <div className="flex-1 grid grid-cols-[76px_1fr_76px] sm:grid-cols-[120px_1fr_120px] items-center gap-2 my-1">
          {/* GAUCHE */}
          <div className="flex flex-col items-center text-center gap-1.5">
            <PlayerAvatar
              profile={match.players[seatLeft].profile}
              size="md"
              isActiveTurn={
                activeSeat === seatLeft &&
                (match.phase === 'ENCHERES' || match.phase === 'JEU')
              }
              isDealer={match.dealerSeat === seatLeft}
            />
            <div className="text-xs font-semibold text-[#F7F4EB] truncate max-w-full px-1">
              {match.players[seatLeft].profile.pseudo}
            </div>
            <div className="text-[11px] text-emerald-200/70 tabular-nums">
              {seatCardCountLabel(seatLeft)} cartes
              {disconnectedSeats.includes(seatLeft) ? ' · Déco' : ''}
            </div>
            {seatCardCountLabel(seatLeft) > 0 && seatLeft !== bottomSeat && (
              <div className="flex flex-col items-center -space-y-7 pt-1" aria-hidden="true">
                {Array.from({ length: seatCardCountLabel(seatLeft) }).map((_, idx) => (
                  <PlayingCard key={`left-back-${idx}`} faceDown size="xs" />
                ))}
              </div>
            )}
          </div>

          {/* ARÈNE CENTRALE DU PLI & CONTRAT */}
          <div className="relative min-h-[230px] sm:min-h-[270px] rounded-3xl border border-amber-300/20 bg-black/20 flex flex-col items-center justify-between p-3 sm:p-4">
            <div className="text-center text-xs text-emerald-100/85 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 tabular-nums">
              <span>Donne {match.roundNumber}</span>
              <span aria-hidden="true">·</span>
              {match.activeContract ? (
                <span className="font-semibold text-amber-300">
                  {CONTRACT_META[match.activeContract].symbol}{' '}
                  {CONTRACT_META[match.activeContract].label}
                  {match.contreLevel !== 'AUCUN'
                    ? ` (${CONTRE_LABELS[match.contreLevel]})`
                    : ''}
                  {match.declaringSeat
                    ? ` par ${match.players[match.declaringSeat].profile.pseudo}`
                    : ''}
                </span>
              ) : (
                <span className="text-amber-200/90">
                  Enchères (5 cartes · 1er annonceur :{' '}
                  {match.players[match.firstAnnouncerSeat].profile.pseudo})
                </span>
              )}
              {match.phase === 'JEU' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Pli {Math.min(match.completedTricks.length + 1, 8)} / 8
                  </span>
                </>
              )}
            </div>

            {/* 4 cartes posées en croix selon l'orientation relative du joueur */}
            <div className="relative w-full max-w-[250px] h-[158px] sm:h-[180px] my-1">
              <div className="absolute top-0 left-1/2 -translate-x-1/2">
                {trickCardBySeat[seatTop] && (
                  <PlayingCard card={trickCardBySeat[seatTop]!.card} size="sm" />
                )}
              </div>
              <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2">
                {trickCardBySeat[seatLeft] && (
                  <PlayingCard card={trickCardBySeat[seatLeft]!.card} size="sm" />
                )}
              </div>
              <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2">
                {trickCardBySeat[seatRight] && (
                  <PlayingCard card={trickCardBySeat[seatRight]!.card} size="sm" />
                )}
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                {trickCardBySeat[localPerspectiveSeat] && (
                  <PlayingCard
                    card={trickCardBySeat[localPerspectiveSeat]!.card}
                    size="sm"
                  />
                )}
              </div>
            </div>

            <div className="text-xs font-medium text-center min-h-[18px]">
              {trickDisplayFreeze ? (
                <span className="text-amber-300 font-semibold">
                  Pli remporté par{' '}
                  {match.players[trickDisplayFreeze.winnerSeat].profile.pseudo}
                </span>
              ) : (
                <span className="text-emerald-100/80">
                  Tour de {activePlayer.profile.pseudo}
                  {match.phase === 'JEU' && isMyTurn
                    ? ' — Touchez une carte éclairée'
                    : ''}
                </span>
              )}
            </div>
          </div>

          {/* DROITE */}
          <div className="flex flex-col items-center text-center gap-1.5">
            <PlayerAvatar
              profile={match.players[seatRight].profile}
              size="md"
              isActiveTurn={
                activeSeat === seatRight &&
                (match.phase === 'ENCHERES' || match.phase === 'JEU')
              }
              isDealer={match.dealerSeat === seatRight}
            />
            <div className="text-xs font-semibold text-[#F7F4EB] truncate max-w-full px-1">
              {match.players[seatRight].profile.pseudo}
            </div>
            <div className="text-[11px] text-emerald-200/70 tabular-nums">
              {seatCardCountLabel(seatRight)} cartes · Plis {oppTeamTricks}
              {disconnectedSeats.includes(seatRight) ? ' · Déco' : ''}
            </div>
            {seatCardCountLabel(seatRight) > 0 && seatRight !== bottomSeat && (
              <div className="flex flex-col items-center -space-y-7 pt-1" aria-hidden="true">
                {Array.from({ length: seatCardCountLabel(seatRight) }).map((_, idx) => (
                  <PlayingCard key={`right-back-${idx}`} faceDown size="xs" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ZONE BASSE : Enchères OU Main tactile du joueur */}
        <section className="pb-safe flex flex-col gap-1">
          {match.phase === 'ENCHERES' && (
            <div className="rounded-2xl bg-black/40 border border-white/15 p-1.5 sm:p-2 flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] sm:text-[11px] text-emerald-100/80">
                <span>
                  {canActInBidding
                    ? activeSeat === match.firstAnnouncerSeat && !match.activeContract
                      ? `1er annonceur (${activePlayer.profile.pseudo}) : contrat obligatoire`
                      : `Enchère de ${activePlayer.profile.pseudo}`
                    : `En attente de ${activePlayer.profile.pseudo}...`}
                </span>
                <span className="tabular-nums">
                  {match.activeContract
                    ? `Contrat actuel : ${CONTRACT_META[match.activeContract].label} · Hiérarchie Trèfle → TA`
                    : 'Distribution 3+2 (5 cartes · 3 restantes après enchères)'}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {CONTRACT_OPTIONS.map((opt) => {
                  const isRed = opt.type === 'CARREAU' || opt.type === 'COEUR';
                  const isAlreadyActive = match.activeContract === opt.type;
                  const canSelectThisContract =
                    canActInBidding &&
                    isContractAllowedOver(
                      opt.type,
                      match.activeContract,
                      match.contreLevel,
                    );
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      disabled={!canSelectThisContract}
                      onClick={() =>
                        handleBidAction({
                          kind: 'CONTRAT',
                          contract: opt.type as ContractType,
                        })
                      }
                      className={`min-h-[34px] px-1 py-0.5 rounded-lg border text-[10px] sm:text-xs font-semibold flex flex-col items-center justify-center leading-tight transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        isAlreadyActive
                          ? 'bg-amber-400 text-[#062114] border-amber-300'
                          : 'bg-[#FCFBF7] hover:bg-amber-50 border-stone-300'
                      }`}
                    >
                      <span
                        className={`text-sm font-bold leading-none ${
                          isAlreadyActive
                            ? 'text-[#062114]'
                            : isRed
                              ? 'text-[#C81E1E]'
                              : 'text-slate-900'
                        }`}
                      >
                        {opt.symbol}
                      </span>
                      <span
                        className={`text-[9px] leading-none truncate max-w-full ${
                          isAlreadyActive ? 'text-[#062114]' : 'text-slate-800'
                        }`}
                      >
                        {opt.shortLabel} · {opt.basePoints}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canPassInBidding}
                  onClick={() => handleBidAction({ kind: 'PASSE' })}
                  className="flex-1 min-h-[34px] px-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-[#F7F4EB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {!match.activeContract && activeSeat === match.firstAnnouncerSeat
                    ? 'Contrat obligatoire'
                    : 'Passer'}
                </button>

                {canContre && (
                  <button
                    type="button"
                    onClick={() => handleBidAction({ kind: 'CONTRE' })}
                    className="flex-1 min-h-[34px] px-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                  >
                    Contrer (× 2)
                  </button>
                )}

                {canSurcontre && (
                  <button
                    type="button"
                    onClick={() => handleBidAction({ kind: 'SURCONTRE' })}
                    className="flex-1 min-h-[34px] px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-[#062114] cursor-pointer"
                  >
                    Surcontrer
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bandeau joueur bas + main tactile */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-between w-full px-1">
              <div className="flex items-center gap-2.5">
                <PlayerAvatar
                  profile={bottomPlayer.profile}
                  size="sm"
                  isActiveTurn={
                    activeSeat === bottomSeat &&
                    (match.phase === 'ENCHERES' || match.phase === 'JEU')
                  }
                  isDealer={match.dealerSeat === bottomSeat}
                />
                <div>
                  <div className="text-sm font-semibold text-[#F7F4EB]">
                    {bottomPlayer.profile.pseudo}
                    {isLocalTest && !isLocalAutoMode ? ` (${bottomSeat})` : ''}
                  </div>
                  <div className="text-[11px] text-emerald-200/75 tabular-nums">
                    {bottomPlayer.team === 'EQUIPE_A'
                      ? 'Équipe Sud / Nord'
                      : 'Équipe Est / Ouest'}{' '}
                    · Plis : {bottomPlayer.team === 'EQUIPE_A' ? tricksWonA : tricksWonB}
                  </div>
                </div>
              </div>

              {match.activeContract && (
                <div className="text-xs font-medium text-amber-300 tabular-nums">
                  Atout :{' '}
                  {SUIT_META[match.activeContract as keyof typeof SUIT_META]?.symbol ??
                    CONTRACT_META[match.activeContract].shortLabel}
                </div>
              )}
            </div>

            <div className="w-full max-w-full overflow-visible flex items-center justify-center py-2 px-1">
              <div className="flex flex-nowrap items-center justify-center">
                {bottomPlayer.hand.map((card, index) => {
                  const isPlayable = playableIds.has(card.id);
                  const shouldDim = match.phase === 'JEU' && isMyTurn && !isPlayable;
                  const fanOffset = index - (bottomPlayer.hand.length - 1) / 2;
                  return (
                    <div
                      key={card.id}
                      className={index === 0 ? 'relative shrink-0' : 'relative shrink-0 -ml-[30px] sm:-ml-[38px]'}
                      style={{
                        zIndex: index + 1,
                        transform: `rotate(${fanOffset * 1.5}deg) translateY(${Math.abs(fanOffset) * 1.2}px)`,
                      }}
                    >
                      <PlayingCard
                        card={card}
                        size="lg"
                        playable={isPlayable}
                        dimmed={shouldDim}
                        onClick={() => handlePlayCardWithPause(bottomSeat, card.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modale d'interruption définitive si l'hôte a fermé la partie */}
      {hostClosedReason && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#092B1B] border border-red-400/40 p-6 flex flex-col items-center text-center gap-4 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <h2 className="text-xl font-bold text-[#F7F4EB]">
              Session interrompue
            </h2>
            <p className="text-sm text-emerald-100/80">{hostClosedReason}</p>
            <button
              type="button"
              onClick={onExitToHome}
              className="w-full min-h-[48px] rounded-xl bg-amber-400 hover:bg-amber-300 text-[#062114] font-bold text-sm cursor-pointer"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      )}

      {/* Modale Fin de donne / Fin de partie */}
      {(match.phase === 'FIN_DONNE' || match.phase === 'FIN_PARTIE') &&
        latestLedger &&
        !hostClosedReason && (
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-[#092B1B] border border-amber-300/30 p-6 flex flex-col gap-5 shadow-2xl">
              <div className="flex flex-col items-center text-center gap-2">
                {match.phase === 'FIN_PARTIE' && (
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/20 flex items-center justify-center mb-1">
                    <Trophy className="w-7 h-7 text-amber-300" />
                  </div>
                )}
                <h2
                  className="text-2xl font-bold text-[#F7F4EB]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {match.phase === 'FIN_PARTIE'
                    ? match.winnerTeam === myTeam
                      ? 'Victoire de votre équipe !'
                      : 'Victoire de l’équipe adverse'
                    : `Fin de la donne ${latestLedger.roundNumber}`}
                </h2>
                <p className="text-sm text-amber-200/90">
                  {match.victoryReason === 'CAPOT_COULEUR'
                    ? 'Capot sur contrat couleur : victoire immédiate de la partie'
                    : match.victoryReason === 'OBJECTIF_150'
                      ? 'Objectif de 150 points atteint'
                      : latestLedger.ruleAppliedLabel}
                </p>
              </div>

              <div className="rounded-2xl bg-black/30 border border-white/10 p-4 flex flex-col gap-3 text-sm tabular-nums">
                {match.phase === 'FIN_PARTIE' && (
                  <div className="flex flex-col gap-1.5 pb-2 border-b border-white/10 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          match.winnerTeam === 'EQUIPE_A'
                            ? 'font-semibold text-amber-300'
                            : 'text-emerald-100/75'
                        }
                      >
                        Équipe Sud / Nord{' '}
                        {match.winnerTeam === 'EQUIPE_A' ? '(Gagnante)' : ''}
                      </span>
                      <span className="text-[#F7F4EB] truncate max-w-[190px]">
                        {match.players.SUD.profile.pseudo} &amp;{' '}
                        {match.players.NORD.profile.pseudo}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          match.winnerTeam === 'EQUIPE_B'
                            ? 'font-semibold text-amber-300'
                            : 'text-emerald-100/75'
                        }
                      >
                        Équipe Est / Ouest{' '}
                        {match.winnerTeam === 'EQUIPE_B' ? '(Gagnante)' : ''}
                      </span>
                      <span className="text-[#F7F4EB] truncate max-w-[190px]">
                        {match.players.EST.profile.pseudo} &amp;{' '}
                        {match.players.OUEST.profile.pseudo}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-emerald-100/75">Contrat</span>
                  <span className="font-semibold text-[#F7F4EB]">
                    {CONTRACT_META[latestLedger.contract].label} (
                    {CONTRE_LABELS[latestLedger.contreLevel]}) ·{' '}
                    {latestLedger.contractSucceeded ? 'Réussi' : 'Échoué'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-100/75">Plis remportés</span>
                  <span className="font-semibold text-[#F7F4EB]">
                    Sud/Nord {latestLedger.tricksWonA} — {latestLedger.tricksWonB}{' '}
                    Est/Ouest
                    {latestLedger.capotByTeam ? ' (CAPOT)' : ''}
                  </span>
                </div>
                {!latestLedger.capotByTeam && (
                  <div className="flex items-center justify-between text-xs text-emerald-100/70">
                    <span>Cartes + 10 de der (non cumulé)</span>
                    <span>
                      {latestLedger.cardPointsA} — {latestLedger.cardPointsB}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className="text-emerald-100/75">Points de la donne</span>
                  <span className="font-bold text-amber-300">
                    Sud/Nord +{latestLedger.pointsAwardedA} · Est/Ouest +
                    {latestLedger.pointsAwardedB}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-100/75">Score final cumulé</span>
                  <span className="font-bold text-[#F7F4EB]">
                    Sud/Nord {match.scores.EQUIPE_A} — {match.scores.EQUIPE_B}{' '}
                    Est/Ouest
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {match.phase === 'FIN_DONNE' ? (
                  isMultiplayerClient ? (
                    <div className="w-full min-h-[48px] rounded-xl bg-white/10 text-amber-200 text-sm font-medium flex items-center justify-center px-4 text-center">
                      En attente que l’hôte lance la donne suivante...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (isMultiplayerHost) {
                          onDispatchNextRound?.();
                        } else {
                          setLocalMatch((prev) =>
                            startNextRound(prev, settings.sortCardsBySuit),
                          );
                        }
                      }}
                      className="w-full min-h-[52px] rounded-xl bg-amber-400 hover:bg-amber-300 text-[#062114] font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Donne suivante</span>
                    </button>
                  )
                ) : isMultiplayerClient ? (
                  <div className="w-full min-h-[48px] rounded-xl bg-white/10 text-amber-200 text-sm font-medium flex items-center justify-center px-4 text-center">
                    En attente de l’hôte pour une nouvelle partie...
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (isMultiplayerHost) {
                        onDispatchRestart?.();
                      } else {
                        setLocalMatch(onRestartMatch());
                      }
                    }}
                    className="w-full min-h-[52px] rounded-xl bg-amber-400 hover:bg-amber-300 text-[#062114] font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>Nouvelle partie</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onExitToHome}
                  className="w-full min-h-[46px] rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-[#F7F4EB] cursor-pointer"
                >
                  Retour à l’accueil
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Modale Carnet de score */}
      {showLedger && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-lg max-h-[82dvh] rounded-t-3xl sm:rounded-3xl bg-[#092B1B] border border-white/15 p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2
                className="text-lg font-bold text-[#F7F4EB]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Carnet de score OW’Beloty
              </h2>
              <button
                type="button"
                onClick={() => setShowLedger(false)}
                aria-label="Fermer le carnet"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 text-emerald-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center rounded-2xl bg-black/30 p-3 tabular-nums">
              <div>
                <div className="text-xs text-emerald-200/75">
                  {TEAM_LABELS.EQUIPE_A}
                </div>
                <div className="text-2xl font-bold text-amber-300">
                  {match.scores.EQUIPE_A} / 150
                </div>
              </div>
              <div>
                <div className="text-xs text-emerald-200/75">
                  {TEAM_LABELS.EQUIPE_B}
                </div>
                <div className="text-2xl font-bold text-[#F7F4EB]">
                  {match.scores.EQUIPE_B} / 150
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/10 text-xs sm:text-sm tabular-nums">
              {match.ledger.length === 0 ? (
                <p className="py-8 text-center text-emerald-100/65">
                  Aucune donne terminée pour le moment.
                </p>
              ) : (
                match.ledger.map((entry) => (
                  <div
                    key={entry.roundNumber}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-[#F7F4EB]">
                        Donne {entry.roundNumber} · {CONTRACT_META[entry.contract].label}
                        {entry.contreLevel !== 'AUCUN'
                          ? ` (${CONTRE_LABELS[entry.contreLevel]})`
                          : ''}
                      </div>
                      <div className="text-xs text-emerald-100/70">
                        {entry.ruleAppliedLabel} · Plis {entry.tricksWonA}-
                        {entry.tricksWonB}
                      </div>
                    </div>
                    <div className="text-right font-mono font-semibold shrink-0">
                      <div className="text-amber-300">+{entry.pointsAwardedA}</div>
                      <div className="text-emerald-100">+{entry.pointsAwardedB}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
