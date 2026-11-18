import React, { useState } from 'react';
import { Bot, Play, ShieldCheck, Users } from 'lucide-react';
import { PlayerProfile, TurnDirection } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { SubPageHeader } from './SubPageHeader';

interface VsComputerViewProps {
  localProfile: PlayerProfile;
  defaultTurnDirection: TurnDirection;
  onStartSoloMatch: (turnDirection: TurnDirection) => void;
  onBack: () => void;
}

export const VsComputerView: React.FC<VsComputerViewProps> = ({
  localProfile,
  defaultTurnDirection,
  onStartSoloMatch,
  onBack,
}) => {
  const [turnDirection, setTurnDirection] =
    useState<TurnDirection>(defaultTurnDirection);

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Jouer contre l'ordinateur" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-safe flex flex-col gap-6">
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-300/25 flex items-center justify-center shrink-0">
              <Bot className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F7F4EB]">
                Mode Solo hors ligne (1 joueur + 3 IA)
              </h2>
              <p className="text-sm text-emerald-100/75 mt-1 leading-relaxed">
                Vous jouez avec votre partenaire IA (Nord) face aux deux
                adversaires IA (Est et Ouest) selon toutes les règles officielles
                OW’Beloty à 150 points.
              </p>
            </div>
          </div>

          {/* Composition de la table Solo */}
          <div className="rounded-xl bg-black/25 border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Users className="w-4 h-4" />
              <span>Table de jeu</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                <PlayerAvatar profile={localProfile} size="sm" />
                <div className="min-w-0">
                  <div className="font-semibold text-[#F7F4EB] truncate">
                    {localProfile.pseudo}
                  </div>
                  <div className="text-xs text-emerald-200/75">
                    Sud · Vous (Équipe A)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                <div className="w-9 h-9 rounded-full bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-xs font-bold text-amber-200 shrink-0">
                  IA
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[#F7F4EB]">Partenaire Nord</div>
                  <div className="text-xs text-emerald-200/75">
                    Nord · Alliée IA (Équipe A)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-emerald-100 shrink-0">
                  IA
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[#F7F4EB]">Adversaire Est</div>
                  <div className="text-xs text-emerald-200/70">
                    Est · IA (Équipe B)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-emerald-100 shrink-0">
                  IA
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[#F7F4EB]">Adversaire Ouest</div>
                  <div className="text-xs text-emerald-200/70">
                    Ouest · IA (Équipe B)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sens de rotation */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-emerald-100">
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

          <div className="rounded-xl bg-emerald-950/50 border border-emerald-400/20 p-3.5 flex items-start gap-3 text-xs sm:text-sm text-emerald-100/85">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Jeu loyal : les trois intelligences artificielles suivent les mêmes
              règles de belote, comptent uniquement les cartes déjà jouées et ne
              consultent jamais votre jeu.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onStartSoloMatch(turnDirection)}
            className="w-full min-h-[54px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-[#062114] font-bold text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Démarrer la partie Solo</span>
          </button>
        </section>
      </main>
    </div>
  );
};
