import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  QrCode,
  RefreshCw,
  Users,
  Wifi,
} from 'lucide-react';
import { ClientSessionState } from '../engine/multiplayerClient';
import { DEFAULT_HOTSPOT_PORT } from '../engine/networkAdapter';
import { PlayerProfile } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { SubPageHeader } from './SubPageHeader';

interface JoinMatchViewProps {
  localProfile: PlayerProfile;
  clientState: ClientSessionState | null;
  onConnectToHost: (hostIp: string, port: number, sessionCode: string, wifi?: { ssid: string; password: string }) => void;
  onDisconnectFromHost: () => void;
  onGoToProfile: () => void;
  onBack: () => void;
}

export function parseOwBelotyInviteText(raw: string): {
  hostIp?: string;
  port?: number;
  sessionCode?: string;
  ssid?: string;
  password?: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.toUpperCase().startsWith('OWBELOTY|')) {
    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      const parsedPort = Number.parseInt(parts[2], 10);
      return {
        hostIp: parts[1].trim(),
        port: Number.isFinite(parsedPort) ? parsedPort : DEFAULT_HOTSPOT_PORT,
        sessionCode: parts[3].trim().toUpperCase(),
        ssid: parts[4] ? decodeURIComponent(parts[4]) : undefined,
        password: parts[5] ? decodeURIComponent(parts[5]) : undefined,
      };
    }
  }

  if (trimmed.toLowerCase().startsWith('owbeloty://')) {
    try {
      const normalized = trimmed.replace(/^owbeloty:\/\//i, 'http://');
      const url = new URL(normalized);
      const ip = url.searchParams.get('ip') ?? undefined;
      const portStr = url.searchParams.get('port');
      const code = url.searchParams.get('code') ?? undefined;
      const ssid = url.searchParams.get('ssid') ?? undefined;
      const password = url.searchParams.get('password') ?? undefined;
      const parsedPort = portStr ? Number.parseInt(portStr, 10) : DEFAULT_HOTSPOT_PORT;
      return {
        hostIp: ip,
        port: Number.isFinite(parsedPort) ? parsedPort : DEFAULT_HOTSPOT_PORT,
        sessionCode: code?.toUpperCase(),
        ssid,
        password,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export const JoinMatchView: React.FC<JoinMatchViewProps> = ({
  localProfile,
  clientState,
  onConnectToHost,
  onDisconnectFromHost,
  onGoToProfile,
  onBack,
}) => {
  const [hostIp, setHostIp] = useState('192.168.43.1');
  const [port, setPort] = useState(String(DEFAULT_HOTSPOT_PORT));
  const [sessionCode, setSessionCode] = useState('');
  const [wifiCredentials, setWifiCredentials] = useState<{ ssid: string; password: string } | undefined>();
  const [qrInput, setQrInput] = useState('');
  const [qrFeedback, setQrFeedback] = useState<string | null>(null);

  const handleApplyQrText = (value: string) => {
    setQrInput(value);
    const parsed = parseOwBelotyInviteText(value);
    if (!parsed) {
      setQrFeedback(
        value.trim()
          ? 'Format QR non reconnu (attendu : invitation OW’Beloty).'
          : null,
      );
      return;
    }
    if (parsed.hostIp) setHostIp(parsed.hostIp);
    if (parsed.port) setPort(String(parsed.port));
    if (parsed.sessionCode) setSessionCode(parsed.sessionCode);
    if (parsed.ssid && parsed.password) setWifiCredentials({ ssid: parsed.ssid, password: parsed.password });
    setQrFeedback('Paramètres extraits du code QR OW’Beloty.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericPort = Number.parseInt(port, 10) || DEFAULT_HOTSPOT_PORT;
    onConnectToHost(hostIp.trim(), numericPort, sessionCode.trim().toUpperCase(), wifiCredentials);
  };

  const isConnecting = clientState?.phase === 'CONNEXION';
  const isInLobby = clientState?.phase === 'EN_ATTENTE_LOBBY';
  const isDisconnectedOrError =
    clientState?.phase === 'DECONNECTE' ||
    clientState?.phase === 'ERREUR' ||
    clientState?.phase === 'HOTE_FERME';

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Rejoindre une partie" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-safe flex flex-col gap-5">
        {/* Profil envoyé à l'hôte */}
        <section className="rounded-2xl bg-black/25 border border-white/10 p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerAvatar profile={localProfile} size="md" />
            <div className="min-w-0">
              <div className="text-base font-semibold text-[#F7F4EB] truncate">
                {localProfile.pseudo}
              </div>
              <div className="text-xs text-emerald-100/70">
                Profil synchronisé à la connexion Hotspot
              </div>
            </div>
          </div>

          {!isInLobby && (
            <button
              type="button"
              onClick={onGoToProfile}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-[#F7F4EB] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Modifier
            </button>
          )}
        </section>

        {isInLobby && clientState ? (
          <section className="rounded-2xl bg-black/25 border border-amber-300/25 p-5 sm:p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#F7F4EB]">
                  Salle d’attente · {clientState.sessionCode}
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100/75 mt-1">
                  Vous occupez le siège{' '}
                  <strong className="text-amber-300">{clientState.mySeat}</strong>.
                  La table s’ouvrira automatiquement dès que l’hôte lancera la
                  partie.
                </p>
              </div>
              <span className="text-xs font-mono text-amber-300 tabular-nums shrink-0">
                {clientState.lobbyPlayers.filter((p) => p.connected).length} / 4
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {clientState.lobbyPlayers.map((slot) => {
                const isMe = slot.seat === clientState.mySeat;
                return (
                  <div
                    key={slot.seat}
                    className={`p-3 rounded-xl border flex items-center gap-3 ${
                      isMe
                        ? 'bg-amber-400/15 border-amber-300/45'
                        : slot.profile && slot.connected
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
                          ? `${slot.profile.pseudo}${isMe ? ' (Vous)' : ''}`
                          : `Siège ${slot.seat} libre`}
                      </div>
                      <div className="text-[11px] text-emerald-100/70 flex items-center gap-1">
                        {slot.profile && slot.connected ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {slot.seat}
                              {slot.isHost ? ' · Hôte' : ' · Connecté'}
                            </span>
                          </>
                        ) : (
                          <span>En attente...</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-emerald-100/75 pt-2 border-t border-white/10">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-300" />
                En attente du lancement par l’hôte...
              </span>
              <button
                type="button"
                onClick={onDisconnectFromHost}
                className="min-h-[42px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#F7F4EB] cursor-pointer"
              >
                Quitter le salon
              </button>
            </div>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-300/25 flex items-center justify-center shrink-0">
                <Wifi className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#F7F4EB]">
                  Connexion au téléphone hôte (Hotspot Wi-Fi)
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100/75 mt-1 leading-relaxed">
                  Collez le code d’invitation fourni par l’hôte. Si le code contient les identifiants Wi-Fi, OW’Beloty demandera à Android de rejoindre automatiquement le réseau ; une confirmation système peut apparaître.
                </p>
              </div>
            </div>

            {/* Import rapide par texte QR */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="qr-paste-input"
                className="text-xs font-medium text-emerald-100/80 flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-300" />
                <span>Importer un code QR OW’Beloty (optionnel)</span>
              </label>
              <input
                id="qr-paste-input"
                type="text"
                value={qrInput}
                onChange={(e) => handleApplyQrText(e.target.value)}
                placeholder="OWBELOTY|IP|7432|CODE|SSID|MOT_DE_PASSE"
                className="min-h-[44px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-xs font-mono text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {qrFeedback && (
                <span className="text-xs text-amber-200">{qrFeedback}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label
                  htmlFor="host-ip-input"
                  className="text-xs font-medium text-emerald-100/80"
                >
                  Adresse IP hôte
                </label>
                <input
                  id="host-ip-input"
                  type="text"
                  required
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                  placeholder="192.168.43.1"
                  className="min-h-[48px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm font-mono text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="host-port-input"
                  className="text-xs font-medium text-emerald-100/80"
                >
                  Port
                </label>
                <input
                  id="host-port-input"
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="min-h-[48px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm font-mono text-[#F7F4EB] tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="session-code-input"
                  className="text-xs font-medium text-emerald-100/80"
                >
                  Code session
                </label>
                <input
                  id="session-code-input"
                  type="text"
                  maxLength={12}
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="OWB-1234"
                  className="min-h-[48px] px-3.5 rounded-xl bg-[#04190F] border border-white/15 text-sm font-mono text-[#F7F4EB] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            {isDisconnectedOrError && (clientState?.errorMessage || clientState?.noticeMessage) && (
              <div className="rounded-xl bg-red-950/60 border border-red-400/35 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-red-100">
                <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
                <div>{clientState.errorMessage ?? clientState.noticeMessage}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={isConnecting}
              className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-55 text-[#062114] font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <RefreshCw
                className={`w-5 h-5 ${isConnecting ? 'animate-spin' : ''}`}
              />
              <span>
                {isConnecting
                  ? 'Connexion au salon Hotspot...'
                  : wifiCredentials ? 'Rejoindre le réseau et le salon' : 'Rejoindre le salon'}
              </span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
