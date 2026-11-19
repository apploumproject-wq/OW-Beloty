import React from 'react';
import { BarChart3, Trophy, Users } from 'lucide-react';
import { PlayerProfile } from '../types/game';
import { PlayerStatistics } from '../engine/profiles';
import { SubPageHeader } from './SubPageHeader';

interface StatisticsViewProps {
  profile: PlayerProfile;
  statistics: PlayerStatistics;
  onBack: () => void;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3">
      <div className="text-2xl font-bold text-amber-300 tabular-nums">{value}</div>
      <div className="text-xs text-emerald-100/70">{label}</div>
    </div>
  );
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({ profile, statistics, onBack }) => {
  const soloRate = statistics.solo.played ? Math.round((statistics.solo.wins / statistics.solo.played) * 100) : 0;
  const teamRate = statistics.team.played ? Math.round((statistics.team.wins / statistics.team.played) * 100) : 0;
  const partners = Object.entries(statistics.team.partners).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Mes statistiques" onBack={onBack} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-safe flex flex-col gap-5">
        <p className="text-sm text-emerald-100/75">Résultats enregistrés sur ce téléphone pour {profile.pseudo}.</p>
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[#F7F4EB] font-semibold"><BarChart3 className="w-5 h-5 text-amber-300" /> Solo contre IA</div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Parties" value={statistics.solo.played} />
            <StatTile label="Victoires" value={statistics.solo.wins} />
            <StatTile label="Défaites" value={statistics.solo.losses} />
          </div>
          <div className="text-sm text-emerald-100/80">Taux de victoire : <strong className="text-amber-300">{soloRate}%</strong></div>
        </section>
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[#F7F4EB] font-semibold"><Users className="w-5 h-5 text-amber-300" /> Mode équipe / multijoueur</div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Parties" value={statistics.team.played} />
            <StatTile label="Victoires" value={statistics.team.wins} />
            <StatTile label="Défaites" value={statistics.team.losses} />
          </div>
          <div className="text-sm text-emerald-100/80">Taux de victoire : <strong className="text-amber-300">{teamRate}%</strong></div>
          <div className="border-t border-white/10 pt-3">
            <div className="text-sm font-semibold text-[#F7F4EB] mb-2">Coéquipiers</div>
            {partners.length ? <div className="flex flex-col gap-2">{partners.map(([name, count]) => <div key={name} className="flex justify-between text-sm text-emerald-100/80"><span>{name}</span><strong className="text-amber-300">{count} partie(s)</strong></div>)}</div> : <p className="text-xs text-emerald-100/60">Aucune partie en équipe enregistrée.</p>}
          </div>
        </section>
        <p className="text-xs text-emerald-100/50">Les statistiques sont sauvegardées localement. Elles ne sont pas synchronisées entre les téléphones.</p>
      </main>
    </div>
  );
};
