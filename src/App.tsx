import { useCallback, useEffect, useRef, useState } from 'react';
import { PluginListenerHandle } from '@capacitor/core';
import { AboutView } from './components/AboutView';
import { CreateMatchView } from './components/CreateMatchView';
import { GameTableView } from './components/GameTableView';
import { HomeMenu, ScreenRoute } from './components/HomeMenu';
import { JoinMatchView } from './components/JoinMatchView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { VsComputerView } from './components/VsComputerView';
import { createNewMatch } from './engine/match';
import {
  ClientSessionState,
  createWebSocketClientTransport,
  MultiplayerClientSession,
} from './engine/multiplayerClient';
import { MultiplayerHostSession } from './engine/multiplayerHost';
import { DEFAULT_HOTSPOT_PORT, localHotspotAdapter } from './engine/networkAdapter';
import {
  loadAppSettings,
  loadLocalProfile,
  saveAppSettings,
  saveLocalProfile,
} from './engine/profiles';
import {
  isNativeAndroidEnvironment,
  NativeLocalHotspot,
} from './native/localHotspotPlugin';
import {
  AppSettings,
  MatchMode,
  MatchState,
  PlayerProfile,
  SeatPosition,
  TurnDirection,
} from './types/game';
import { BidActionPayload } from './types/network';

interface MatchLaunchConfig {
  mode: MatchMode;
  turnDirection: TurnDirection;
  seatOverrides?: Partial<Record<SeatPosition, PlayerProfile>>;
}

export default function App() {
  const [route, setRoute] = useState<ScreenRoute>('ACCUEIL');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadLocalProfile());
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [activeMatch, setActiveMatch] = useState<MatchState | null>(null);
  const [lastLaunchConfig, setLastLaunchConfig] = useState<MatchLaunchConfig>({
    mode: 'SOLO_IA',
    turnDirection: settings.turnDirection,
  });

  // État Hôte Hotspot Wi-Fi
  const [hostSession, setHostSession] = useState<MultiplayerHostSession | null>(null);
  const [hostIp, setHostIp] = useState<string>('192.168.43.1');
  const [hostError, setHostError] = useState<string | null>(null);
  const [isStartingHostServer, setIsStartingHostServer] = useState(false);
  const [hostTwoPlayerMode, setHostTwoPlayerMode] = useState(false);
  const [hostViewMatch, setHostViewMatch] = useState<MatchState | null>(null);
  const [hostDisconnectedSeats, setHostDisconnectedSeats] = useState<SeatPosition[]>([]);
  const hostListenersRef = useRef<PluginListenerHandle[]>([]);

  // État Client Hotspot Wi-Fi
  const clientSessionRef = useRef<MultiplayerClientSession | null>(null);
  const [clientState, setClientState] = useState<ClientSessionState | null>(null);
  const lastClientTargetRef = useRef<{
    hostIp: string;
    port: number;
    sessionCode: string;
  } | null>(null);

  const cleanupHostListeners = useCallback(async () => {
    for (const handle of hostListenersRef.current) {
      try {
        await handle.remove();
      } catch {
        // Ignorer
      }
    }
    hostListenersRef.current = [];
  }, []);

  const stopHotspotHost = useCallback(async () => {
    if (hostSession) {
      hostSession.closeSession();
    }
    await cleanupHostListeners();
    if (isNativeAndroidEnvironment()) {
      try {
        await NativeLocalHotspot.stopHostServer();
      } catch {
        // Ignorer
      }
    }
    localHotspotAdapter.setStatus('PRET_POUR_SYNCHRO');
    setHostSession(null);
    setHostViewMatch(null);
    setHostDisconnectedSeats([]);
    setHostError(null);
  }, [hostSession, cleanupHostListeners]);

  const disconnectClient = useCallback(() => {
    if (clientSessionRef.current) {
      clientSessionRef.current.disconnect();
      clientSessionRef.current = null;
    }
    setClientState(null);
  }, []);

  useEffect(() => {
    return () => {
      void cleanupHostListeners();
      clientSessionRef.current?.disconnect();
    };
  }, [cleanupHostListeners]);

  const handleSaveProfile = (nextProfile: PlayerProfile) => {
    const saved = saveLocalProfile(nextProfile);
    setProfile(saved);
    setActiveMatch((prev) =>
      prev
        ? {
            ...prev,
            players: {
              ...prev.players,
              SUD: {
                ...prev.players.SUD,
                profile: saved,
              },
            },
          }
        : null,
    );
  };

  const handleUpdateSettings = (nextSettings: AppSettings) => {
    const saved = saveAppSettings(nextSettings);
    setSettings(saved);
  };

  const launchLocalOrSoloMatch = (
    mode: 'SOLO_IA' | 'LOCAL_TEST',
    turnDirection: TurnDirection,
    seatOverrides?: Partial<Record<SeatPosition, PlayerProfile>>,
  ): MatchState => {
    const resolvedOverrides: Partial<Record<SeatPosition, PlayerProfile>> | undefined =
      mode === 'SOLO_IA'
        ? {
            SUD: profile,
            EST: {
              id: 'ai-seat-est',
              pseudo: 'IA Est',
              avatarDataUrl: null,
              updatedAt: Date.now(),
              deviceTag: 'Intelligence Artificielle',
            },
            NORD: {
              id: 'ai-seat-nord',
              pseudo: 'IA Nord',
              avatarDataUrl: null,
              updatedAt: Date.now(),
              deviceTag: 'Intelligence Artificielle',
            },
            OUEST: {
              id: 'ai-seat-ouest',
              pseudo: 'IA Ouest',
              avatarDataUrl: null,
              updatedAt: Date.now(),
              deviceTag: 'Intelligence Artificielle',
            },
          }
        : seatOverrides;

    setLastLaunchConfig({ mode, turnDirection, seatOverrides: resolvedOverrides });
    const fresh = createNewMatch(
      profile,
      turnDirection,
      settings.sortCardsBySuit,
      resolvedOverrides,
    );
    fresh.matchMode = mode;
    setActiveMatch(fresh);
    setRoute('JOUER');
    return fresh;
  };

  const handleStartHotspotHost = async (turnDirection: TurnDirection, twoPlayerMode = false) => {
    setHostTwoPlayerMode(twoPlayerMode);
    setHostError(null);
    if (!isNativeAndroidEnvironment()) {
      setHostError(
        'Le serveur Hotspot Wi-Fi local nécessite l’application Android installée (APK). Utilisez le mode Solo ou la table locale dans un navigateur standard.',
      );
      return;
    }

    setIsStartingHostServer(true);
    try {
      await cleanupHostListeners();
      const cfg = localHotspotAdapter.prepareHostSession(profile);
      const result = await NativeLocalHotspot.startHostServer({
        port: cfg.port,
        sessionCode: cfg.sessionCode,
      });

      const session = new MultiplayerHostSession({
        hostProfile: profile,
        sessionCode: cfg.sessionCode,
        port: result.port || DEFAULT_HOTSPOT_PORT,
        turnDirection,
        sortCardsBySuit: settings.sortCardsBySuit,
        twoPlayerMode,
        transport: {
          sendToClient: (clientId, msg) => {
            void NativeLocalHotspot.sendToClient({
              clientId,
              payload: JSON.stringify(msg),
            });
          },
        },
      });

      const h1 = await NativeLocalHotspot.addListener('messageReceived', (ev) => {
        session.handleClientMessage(ev.clientId, ev.payload);
      });
      const h2 = await NativeLocalHotspot.addListener('clientDisconnected', (ev) => {
        session.handleClientDisconnected(ev.clientId);
      });
      const h3 = await NativeLocalHotspot.addListener('serverError', (ev) => {
        setHostError(ev.message);
      });
      hostListenersRef.current = [h1, h2, h3];

      session.subscribe(() => {
        setHostViewMatch(session.getHostViewMatchState());
        const disconnected = session
          .getLobbyPlayers()
          .filter((s) => s.profile !== null && !s.connected)
          .map((s) => s.seat);
        setHostDisconnectedSeats(disconnected);
      });

      localHotspotAdapter.setStatus('SERVEUR_ACTIF');
      setHostIp(result.hostIp || '192.168.49.1');
      setHostSession(session);
    } catch (err) {
      if (isNativeAndroidEnvironment()) {
        try { await NativeLocalHotspot.stopHostServer(); } catch { /* Ignorer */ }
      }
      setHostError(
        err instanceof Error
          ? err.message
          : 'Impossible de démarrer le serveur Hotspot local.',
      );
    } finally {
      setIsStartingHostServer(false);
    }
  };

  const handleLaunchMultiplayerMatch = () => {
    if (!hostSession) return;
    const res = hostSession.startMatch();
    if (!res.ok) {
      setHostError(res.reason);
      return;
    }
    setHostError(null);
    setHostViewMatch(hostSession.getHostViewMatchState());
    setRoute('JOUER');
  };

  const handleConnectToHost = (
    targetIp: string,
    targetPort: number,
    targetCode: string,
  ) => {
    disconnectClient();
    lastClientTargetRef.current = {
      hostIp: targetIp,
      port: targetPort,
      sessionCode: targetCode,
    };

    let sessionRef: MultiplayerClientSession;
    const transport = createWebSocketClientTransport(targetIp, targetPort, {
      onOpen: () => sessionRef.onTransportOpened(),
      onMessage: (raw) => sessionRef.handleServerMessage(raw),
      onClose: (wasClean) => sessionRef.onTransportClosed(wasClean),
      onError: (reason) => sessionRef.onTransportError(reason),
    });

    sessionRef = new MultiplayerClientSession({
      profile,
      sessionCode: targetCode,
      transport,
    });
    clientSessionRef.current = sessionRef;

    sessionRef.subscribe((nextState) => {
      setClientState(nextState);
      if (nextState.phase === 'EN_PARTIE' && nextState.matchState) {
        setRoute('JOUER');
      }
    });
  };

  const handleClientReconnect = () => {
    const target = lastClientTargetRef.current;
    if (!target) return;
    handleConnectToHost(target.hostIp, target.port, target.sessionCode);
  };

  const handleQuickPlay = () => {
    if (hostViewMatch && hostViewMatch.phase !== 'FIN_PARTIE') {
      setRoute('JOUER');
      return;
    }
    if (clientState?.matchState && clientState.phase === 'EN_PARTIE') {
      setRoute('JOUER');
      return;
    }
    if (activeMatch && activeMatch.phase !== 'FIN_PARTIE') {
      setRoute('JOUER');
      return;
    }
    launchLocalOrSoloMatch('SOLO_IA', settings.turnDirection);
  };

  const handleRestartMatch = (): MatchState => {
    const mode =
      lastLaunchConfig.mode === 'LOCAL_TEST' ? 'LOCAL_TEST' : 'SOLO_IA';
    return launchLocalOrSoloMatch(
      mode,
      lastLaunchConfig.turnDirection,
      lastLaunchConfig.seatOverrides,
    );
  };

  const handleExitGameTable = () => {
    if (hostSession) {
      void stopHotspotHost();
    }
    if (clientSessionRef.current) {
      disconnectClient();
    }
    setRoute('ACCUEIL');
  };

  // Écran Table de jeu : Multijoueur Hôte
  if (route === 'JOUER' && hostSession && hostViewMatch) {
    return (
      <GameTableView
        initialMatch={hostViewMatch}
        externalMatch={hostViewMatch}
        localPerspectiveSeat="SUD"
        networkError={hostError}
        disconnectedSeats={hostDisconnectedSeats}
        onDispatchBid={(action: BidActionPayload) => {
          const res = hostSession.applyHostBid(action);
          setHostError(res.ok ? null : res.reason);
        }}
        onDispatchCard={(cardId: string) => {
          const res = hostSession.applyHostCard(cardId);
          setHostError(res.ok ? null : res.reason);
        }}
        onDispatchNextRound={() => {
          const res = hostSession.advanceToNextRound();
          setHostError(res.ok ? null : res.reason);
        }}
        onDispatchRestart={() => {
          const res = hostSession.restartMatch();
          setHostError(res.ok ? null : res.reason);
        }}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onRestartMatch={handleRestartMatch}
        onExitToHome={handleExitGameTable}
      />
    );
  }

  // Écran Table de jeu : Multijoueur Client
  if (route === 'JOUER' && clientState?.matchState && clientSessionRef.current) {
    const cSession = clientSessionRef.current;
    const disconnectedSeats = clientState.lobbyPlayers
      .filter((s) => s.profile !== null && !s.connected)
      .map((s) => s.seat);

    return (
      <GameTableView
        initialMatch={clientState.matchState}
        externalMatch={clientState.matchState}
        localPerspectiveSeat={clientState.mySeat ?? 'SUD'}
        networkNotice={clientState.noticeMessage}
        networkError={clientState.errorMessage}
        clientDisconnected={
          clientState.phase === 'DECONNECTE' || clientState.phase === 'ERREUR'
        }
        hostClosedReason={
          clientState.phase === 'HOTE_FERME'
            ? clientState.errorMessage ?? 'L’hôte a quitté la partie.'
            : null
        }
        disconnectedSeats={disconnectedSeats}
        onClientReconnect={handleClientReconnect}
        onDispatchBid={(action: BidActionPayload) => {
          if (action.kind === 'PASSE') cSession.sendBidPass();
          else if (action.kind === 'CONTRAT' && action.contract) {
            cSession.sendBidContract(action.contract);
          } else if (action.kind === 'CONTRE') cSession.sendBidContre();
          else if (action.kind === 'SURCONTRE') cSession.sendBidSurcontre();
        }}
        onDispatchCard={(cardId: string) => cSession.sendPlayCard(cardId)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onRestartMatch={handleRestartMatch}
        onExitToHome={handleExitGameTable}
      />
    );
  }

  // Écran Table de jeu : Solo IA ou Table locale 4 mains
  if (route === 'JOUER' && activeMatch) {
    return (
      <GameTableView
        initialMatch={activeMatch}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onRestartMatch={handleRestartMatch}
        onExitToHome={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'CREER_PARTIE') {
    return (
      <CreateMatchView
        localProfile={profile}
        defaultTurnDirection={settings.turnDirection}
        hostSession={hostSession}
        hostIp={hostIp}
        hostServerError={hostError}
        isStartingServer={isStartingHostServer}
        onStartHotspotHost={handleStartHotspotHost}
        onStopHotspotHost={() => void stopHotspotHost()}
        onLaunchMultiplayerMatch={handleLaunchMultiplayerMatch}
        onStartLocalMatch={(dir, overrides) =>
          launchLocalOrSoloMatch('LOCAL_TEST', dir, overrides)
        }
        onBack={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'REJOINDRE_PARTIE') {
    return (
      <JoinMatchView
        localProfile={profile}
        clientState={clientState}
        onConnectToHost={handleConnectToHost}
        onDisconnectFromHost={disconnectClient}
        onGoToProfile={() => setRoute('PROFIL')}
        onBack={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'CONTRE_ORDI') {
    return (
      <VsComputerView
        localProfile={profile}
        defaultTurnDirection={settings.turnDirection}
        onStartSoloMatch={(dir) => launchLocalOrSoloMatch('SOLO_IA', dir)}
        onBack={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'PROFIL') {
    return (
      <ProfileView
        profile={profile}
        onSaveProfile={handleSaveProfile}
        onBack={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'PARAMETRES') {
    return (
      <SettingsView
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onBack={() => setRoute('ACCUEIL')}
      />
    );
  }

  if (route === 'A_PROPOS') {
    return <AboutView onBack={() => setRoute('ACCUEIL')} />;
  }

  return (
    <HomeMenu
      profile={profile}
      onNavigate={setRoute}
      onQuickPlay={handleQuickPlay}
    />
  );
}
