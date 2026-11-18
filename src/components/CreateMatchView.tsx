import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Play,
  QrCode,
  Radio,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react';
import { DEFAULT_HOTSPOT_PORT, localHotspotAdapter } from '../engine/networkAdapter';
import { MultiplayerHostSession } from '../engine/multiplayerHost';
import {
  getDeviceHotspotNetworkInfo,
  isNativeAndroidEnvironment,
} from '../native/localHotspotPlugin';
import { PlayerProfile, SeatPosition, TurnDirection } from '../types/game';
import { LobbyPlayerSlot } from '../types/network';
import { PlayerAvatar } from './PlayerAvatar';
import { SubPageHeader } from './SubPageHeader';

interface CreateMatchViewProps {
  localProfile: PlayerProfile;
  defaultTurnDirection: TurnDirection;
  hostSession: MultiplayerHostSession | null;
  hostIp: string;
  managedWifi: { ssid: string; password: string } | null;
  hostServerError: string | null;
  isStartingServer: boolean;
  onStartHotspotHost: (turnDirection: TurnDirection) => void;
  onStopHotspotHost: () => void;
  onLaunchMultiplayerMatch: () => void;
  onStartLocalMatch: (
    turnDirection: TurnDirection,
    seatOverrides: Partial<Record<SeatPosition, PlayerProfile>>,
  ) => void;
  onBack: () => void;
}

export const CreateMatchView: React.FC<CreateMatchViewProps> = ({
  localProfile,
  defaultTurnDirection,
  hostSession,
  hostIp,
  managedWifi,
  hostServerError,
  isStartingServer,
  onStartHotspotHost,
  onStopHotspotHost,
  onLaunchMultiplayerMatch,
  onStartLocalMatch,
  onBack,
}) => {
  const [tab, setTab] = useState<'HOTSPOT' | 'LOCAL'>('HOTSPOT');
  const [turnDirection, setTurnDirection] =
    useState<TurnDirection>(defaultTurnDirection);
  const [nordName, setNordName] = useState('Partenaire Nord');
  const [estName, setEstName] = useState('Joueur Est');
  const [ouestName, setOuestName] = useState('Joueur Ouest');

  const [detectedIp, setDetectedIp] = useState<string>(hostIp);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [lobbySlots, setLobbySlots] = useState<LobbyPlayerSlot[]>(
    hostSession ? hostSession.getLobbyPlayers() : [],
  );

  const previewConfig = localHotspotAdapter.prepareHostSession(localProfile);
  const activeCode = hostSession?.sessionCode ?? previewConfig.sessionCode;
  const activePort = hostSession?.port ?? DEFAULT_HOTSPOT_PORT;
  const effectiveIp = hostIp || detectedIp;
  const qrPayloadString = `OWBELOTY|${effectiveIp}|${activePort}|${activeCode}|${managedWifi ? encodeURIComponent(managedWifi.ssid) : ''}|${managedWifi ? encodeURIComponent(managedWifi.password) : ''}`;
  const isNativeAndroid = isNativeAndroidEnvironment();

  useEffect(() => {
    let active = true;
    getDeviceHotspotNetworkInfo()
      .then((info) => {
        if (active && info.preferredIp) {
          setDetectedIp(info.preferredIp);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hostSession) {
      setLobbySlots([]);
      return;
    }
    setLobbySlots(hostSession.getLobbyPlayers());
    return hostSession.subscribe(() => {
      setLobbySlots([...hostSession.getLobbyPlayers()]);
    });
  }, [hostSession]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrPayloadString, {
      width: 220,
      margin: 2,
      color: { dark: '#062114', light: '#FCFBF7' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrPayloadString]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(qrPayloadString);
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 1800);
    } catch {
      // Ignorer si le presse-papiers n'est pas autorisé
    }
  };

  const handleLaunchLocal = (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    onStartLocalMatch(turnDirection, {
      SUD: localProfile,
      NORD: {
        id: 'local-seat-nord',
        pseudo: nordName.trim() || 'Partenaire Nord',
        avatarDataUrl: null,
        updatedAt: now,
        deviceTag: 'Siège Nord',
      },
      EST: {
        id: 'local-seat-est',
        pseudo: estName.trim() || 'Joueur Est',
        avatarDataUrl: null,
        updatedAt: now,
        deviceTag: 'Siège Est',
      },
      OUEST: {
        id: 'local-seat-ouest',
        pseudo: ouestName.trim() || 'Joueur Ouest',
        avatarDataUrl: null,
        updatedAt: now,
        deviceTag: 'Siège Ouest',
      },
    });
  };

  const connectedCount = hostSession ? hostSession.getConnectedCount() : 1;
  const canLaunchHotspot = hostSession ? hostSession.canStartMatch() : false;

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Créer une partie" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-safe flex flex-col gap-5">
        {/* Sélecteur de mode : Hotspot 4 téléphones OU Table locale */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#04190F] border border-white/10">
          <button
            type="button"
            onClick={() => setTab('HOTSPOT')}
            className={`min-h-[46px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              tab === 'HOTSPOT'
                ? 'bg-amber-400 text-[#062114]'
                : 'text-emerald-100/75 hover:text-white'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Hotspot 4 téléphones</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('LOCAL')}
            className={`min-h-[46px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              tab === 'LOCAL'
                ? 'bg-amber-400 text-[#062114]'
                : 'text-emerald-100/75 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Table locale 1 appareil</span>
          </button>
        </div>

        {tab === 'HOTSPOT' ? (
          <div className="flex flex-col gap-5">
            {/* Guide Hotspot Android manuel */}
            <section className="rounded-2xl bg-black/25 border border-white/10 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-300/25 flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#F7F4EB]">
                    Héberger sur Hotspot Wi-Fi local
                  </h2>
                  <p className="text-xs sm:text-sm text-emerald-100/75 mt-1 leading-relaxed">
                    OW’Beloty demande à Android de créer automatiquement un réseau Wi-Fi local (sans Internet). Les autres joueurs lisent ou collent le code d’invitation ; Android leur demandera ensuite l’autorisation de rejoindre ce réseau.
                  </p>
                </div>
              </div>

              {!isNativeAndroid && !hostSession && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-amber-100">
                  <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    L’ouverture du serveur socket Hotspot local s’exécute dans
                    l’application Android installée (APK). Dans cet aperçu
                    navigateur, un navigateur Web standard ne peut pas ouvrir de
                    serveur TCP/WebSocket en écoute.
                  </div>
                </div>
              )}

              {hostServerError && (
                <div className="rounded-xl bg-red-950/60 border border-red-400/35 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-red-100">
                  <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
                  <div>{hostServerError}</div>
                </div>
              )}

              {!hostSession ? (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-emerald-100/80">
                      Sens de rotation des plis
                    </span>
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#04190F] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setTurnDirection('ANTI_HORAIRE')}
                        className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          turnDirection === 'ANTI_HORAIRE'
                            ? 'bg-amber-400 text-[#062114] font-semibold'
                            : 'text-emerald-100/75 hover:text-white'
                        }`}
                      >
                        Anti-horaire
                      </button>
                      <button
                        type="button"
                        onClick={() => setTurnDirection('HORAIRE')}
                        className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          turnDirection === 'HORAIRE'
                            ? 'bg-amber-400 text-[#062114] font-semibold'
                            : 'text-emerald-100/75 hover:text-white'
                        }`}
                      >
                        Horaire
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isStartingServer}
                    onClick={() => onStartHotspotHost(turnDirection)}
                    className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#062114] font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                  >
                    <Wifi className="w-5 h-5" />
                    <span>
                      {isStartingServer
                        ? 'Ouverture du salon Hotspot...'
                        : 'Créer automatiquement le réseau et le salon'}
                    </span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-5 pt-2 border-t border-white/10">
                  {/* Coordonnées de connexion + QR Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center rounded-2xl bg-[#04190F] border border-amber-300/25 p-4">
                    <div className="flex flex-col gap-2 text-sm tabular-nums">
                      {managedWifi && <div className="text-xs text-emerald-100/80">Réseau Wi-Fi : <strong className="text-[#F7F4EB]">{managedWifi.ssid}</strong></div>}
                      <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" />
                        <span>Identifiants de connexion locale</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-1 border-b border-white/10">
                        <span className="text-emerald-100/70">Adresse IP</span>
                        <span className="font-mono font-bold text-[#F7F4EB]">
                          {effectiveIp}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-1 border-b border-white/10">
                        <span className="text-emerald-100/70">Port</span>
                        <span className="font-mono font-bold text-[#F7F4EB]">
                          {activePort}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-1">
                        <span className="text-emerald-100/70">Code session</span>
                        <span className="font-mono font-bold text-amber-300 text-base">
                          {activeCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyInvite}
                        className="mt-1 min-h-[40px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F7F4EB] flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>
                          {copiedNotice
                            ? 'Code de connexion copié'
                            : 'Copier le code QR texte'}
                        </span>
                      </button>
                    </div>

                    {qrDataUrl && (
                      <div className="flex flex-col items-center gap-1.5 mx-auto">
                        <img
                          src={qrDataUrl}
                          alt={`QR Code session ${activeCode}`}
                          className="w-36 h-36 rounded-xl border-2 border-amber-300/40 bg-[#FCFBF7]"
                        />
                        <span className="text-[11px] text-emerald-100/70">
                          Code QR OW’Beloty
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Salle d'attente 4 joueurs */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-100">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-amber-300" />
                        Salle d’attente des joueurs
                      </span>
                      <span className="tabular-nums text-amber-300">
                        {connectedCount} / 4 connectés
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {lobbySlots.map((slot) => (
                        <div
                          key={slot.seat}
                          className={`p-3 rounded-xl border flex items-center gap-3 ${
                            slot.profile && slot.connected
                              ? 'bg-emerald-950/50 border-emerald-400/30'
                              : 'bg-white/[0.03] border-white/10'
                          }`}
                        >
                          {slot.profile ? (
                            <PlayerAvatar profile={slot.profile} size="sm" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-emerald-200/60 shrink-0">
                              ?
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#F7F4EB] truncate">
                              {slot.profile
                                ? slot.profile.pseudo
                                : `Siège ${slot.seat} libre`}
                            </div>
                            <div className="text-[11px] text-emerald-100/70 flex items-center gap-1">
                              {slot.profile && slot.connected ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>
                                    {slot.seat}
                                    {slot.isHost ? ' · Hôte' : ' · Prêt'}
                                  </span>
                                </>
                              ) : slot.profile ? (
                                <span className="text-amber-300">
                                  {slot.seat} · Déconnecté
                                </span>
                              ) : (
                                <span>En attente d’un téléphone...</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={!canLaunchHotspot}
                      onClick={onLaunchMultiplayerMatch}
                      className="flex-1 min-h-[52px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-45 disabled:cursor-not-allowed text-[#062114] font-bold text-base flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      <span>
                        {canLaunchHotspot
                          ? 'Lancer la partie (4/4)'
                          : `En attente (${connectedCount}/4)`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onStopHotspotHost}
                      className="min-h-[52px] px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold text-[#F7F4EB] cursor-pointer"
                    >
                      Fermer le salon
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <form
            onSubmit={handleLaunchLocal}
            className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-6"
          >
            <div>
              <h2 className="text-lg font-semibold text-[#F7F4EB]">
                Composition des 2 équipes (table locale)
              </h2>
              <p className="text-sm text-emerald-100/70 mt-1">
                Les partenaires sont assis face à face. Objectif de la partie : 150 points.
              </p>
            </div>

            <div className="flex flex-col gap-3 pb-5 border-b border-white/10">
              <div className="text-xs font-semibold tracking-wide text-amber-300">
                Équipe A · Vous et votre partenaire
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <PlayerAvatar profile={localProfile} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#F7F4EB] truncate">
                    {localProfile.pseudo}
                  </div>
                  <div className="text-xs text-emerald-100/65">
                    Siège Sud · Téléphone local
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="nord-name"
                  className="text-xs font-medium text-emerald-100/80"
                >
                  Siège Nord (Partenaire)
                </label>
                <input
                  id="nord-name"
                  type="text"
                  maxLength={20}
                  value={nordName}
                  onChange={(e) => setNordName(e.target.value)}
                  className="min-h-[46px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 pb-5 border-b border-white/10">
              <div className="text-xs font-semibold tracking-wide text-emerald-200/80">
                Équipe B · Adversaires
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="est-name"
                    className="text-xs font-medium text-emerald-100/80"
                  >
                    Siège Est
                  </label>
                  <input
                    id="est-name"
                    type="text"
                    maxLength={20}
                    value={estName}
                    onChange={(e) => setEstName(e.target.value)}
                    className="min-h-[46px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="ouest-name"
                    className="text-xs font-medium text-emerald-100/80"
                  >
                    Siège Ouest
                  </label>
                  <input
                    id="ouest-name"
                    type="text"
                    maxLength={20}
                    value={ouestName}
                    onChange={(e) => setOuestName(e.target.value)}
                    className="min-h-[46px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-emerald-100">
                Sens de rotation autour de la table
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#04190F] border border-white/10">
                <button
                  type="button"
                  onClick={() => setTurnDirection('ANTI_HORAIRE')}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    turnDirection === 'ANTI_HORAIRE'
                      ? 'bg-amber-400 text-[#062114] font-semibold'
                      : 'text-emerald-100/75 hover:text-white'
                  }`}
                >
                  Anti-horaire
                </button>
                <button
                  type="button"
                  onClick={() => setTurnDirection('HORAIRE')}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    turnDirection === 'HORAIRE'
                      ? 'bg-amber-400 text-[#062114] font-semibold'
                      : 'text-emerald-100/75 hover:text-white'
                  }`}
                >
                  Horaire
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[54px] px-5 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-[#062114] font-bold text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Démarrer la table locale</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
