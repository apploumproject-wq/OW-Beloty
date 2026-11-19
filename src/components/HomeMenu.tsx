import React from 'react';
import {
  Bot,
  ChevronRight,
  Info,
  Play,
  PlusCircle,
  Settings,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { PlayerProfile } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';

export type ScreenRoute =
  | 'ACCUEIL'
  | 'JOUER'
  | 'CREER_PARTIE'
  | 'REJOINDRE_PARTIE'
  | 'CONTRE_ORDI'
  | 'STATISTIQUES'
  | 'PROFIL'
  | 'PARAMETRES'
  | 'A_PROPOS';

interface HomeMenuProps {
  profile: PlayerProfile;
  onNavigate: (route: ScreenRoute) => void;
  onQuickPlay: () => void;
}

export const HomeMenu: React.FC<HomeMenuProps> = ({
  profile,
  onNavigate,
  onQuickPlay,
}) => {
  const secondaryMenus: Array<{
    route: ScreenRoute;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      route: 'CREER_PARTIE',
      title: 'Créer une partie',
      subtitle: 'Héberger sur Hotspot Wi-Fi ou table locale',
      icon: <PlusCircle className="w-5 h-5 text-amber-300" />,
    },
    {
      route: 'REJOINDRE_PARTIE',
      title: 'Rejoindre une partie',
      subtitle: 'Connexion au téléphone hôte sur Hotspot Wi-Fi',
      icon: <Users className="w-5 h-5 text-emerald-200" />,
    },
    {
      route: 'CONTRE_ORDI',
      title: "Jouer contre l'ordinateur",
      subtitle: 'Mode Solo hors ligne contre trois IA',
      icon: <Bot className="w-5 h-5 text-emerald-200" />,
    },
    {
      route: 'STATISTIQUES',
      title: 'Statistiques',
      subtitle: 'Victoires et défaites en Solo et en équipe',
      icon: <Trophy className="w-5 h-5 text-amber-300" />,
    },
    {
      route: 'PROFIL',
      title: 'Mon profil',
      subtitle: 'Pseudo et photo depuis la galerie',
      icon: <User className="w-5 h-5 text-emerald-200" />,
    },
    {
      route: 'PARAMETRES',
      title: 'Paramètres',
      subtitle: 'Sens de jeu et règles OW’Beloty',
      icon: <Settings className="w-5 h-5 text-emerald-200" />,
    },
    {
      route: 'A_PROPOS',
      title: 'À propos',
      subtitle: 'Informations sur OW’Beloty et AppLoumProject',
      icon: <Info className="w-5 h-5 text-emerald-200" />,
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col felt-surface relative overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20 bg-cover bg-center mix-blend-overlay"
        style={{ backgroundImage: 'url(/src/assets/images/owbeloty_table_felt_1794998087991.jpg)' }}
      />

      {/* En-tête sobre */}
      <header className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-safe py-4 flex items-center justify-between gap-4 border-b border-white/10">
        <span
          className="text-xl sm:text-2xl font-bold tracking-tight text-[#F7F4EB] whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          OW’Beloty
        </span>

        <button
          type="button"
          onClick={() => onNavigate('PROFIL')}
          className="min-h-[44px] flex items-center gap-3 px-3 py-1.5 rounded-xl bg-black/25 hover:bg-black/35 border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <PlayerAvatar profile={profile} size="sm" />
          <span className="text-sm font-medium text-[#F7F4EB] max-w-[140px] truncate">
            {profile.pseudo}
          </span>
        </button>
      </header>

      {/* Contenu principal adapté mobile portrait & grand écran */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Colonne d'accueil et action principale */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-amber-300/90">
              Belote à 4 joueurs · Objectif 150 points
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold text-[#F7F4EB] leading-tight text-balance"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Table de belote classique OW’Beloty
            </h1>
            <p className="text-sm sm:text-base text-emerald-100/80 leading-relaxed">
              Barème exclusif sans système 162, mode Solo hors ligne contre
              l’ordinateur et multijoueur local par Hotspot Wi-Fi entre quatre
              téléphones Android.
            </p>
          </div>

          <button
            type="button"
            onClick={onQuickPlay}
            className="w-full min-h-[58px] px-6 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-[#062114] font-bold text-base sm:text-lg flex items-center justify-between shadow-lg shadow-black/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Play className="w-5 h-5 fill-current" />
              Jouer
            </span>
            <span className="text-xs font-semibold opacity-80 whitespace-nowrap">
              Mode Solo · 32 cartes
            </span>
          </button>

          {/* Rappel synthétique sans pilules */}
          <div className="pt-3 border-t border-white/10 text-xs text-emerald-100/75 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>Trèfle 32</span>
            <span aria-hidden="true">·</span>
            <span>Carreau / Cœur / Pique 16</span>
            <span aria-hidden="true">·</span>
            <span>Sans Atout 52</span>
            <span aria-hidden="true">·</span>
            <span>Tout Atout 26</span>
          </div>
        </section>

        {/* Colonne des menus principaux */}
        <nav aria-label="Menus principaux" className="lg:col-span-7 flex flex-col divide-y divide-white/10 rounded-2xl bg-black/25 border border-white/10 overflow-hidden">
          {secondaryMenus.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className="w-full min-h-[64px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[#F7F4EB] truncate">
                    {item.title}
                  </div>
                  <div className="text-xs sm:text-sm text-emerald-100/70 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-200/60 shrink-0" />
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
};
