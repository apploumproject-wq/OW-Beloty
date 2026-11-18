import React from 'react';
import { SubPageHeader } from './SubPageHeader';

interface AboutViewProps {
  onBack: () => void;
}

export const AboutView: React.FC<AboutViewProps> = ({ onBack }) => {
  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="À propos" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-safe">
        <section className="rounded-2xl bg-black/25 border border-white/10 p-6 sm:p-8 flex flex-col gap-5 text-center">
          <h2
            className="text-2xl sm:text-3xl font-bold text-[#F7F4EB]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            OW’Beloty
          </h2>

          <p className="text-sm sm:text-base text-emerald-100/85 leading-relaxed">
            Jeu de belote à quatre joueurs, avec mode solo hors ligne et
            multijoueur local par Hotspot Wi-Fi.
          </p>

          <div className="border-t border-white/10 pt-5 flex flex-col gap-3">
            <p className="text-sm text-emerald-100/85">
              OW’Beloty est un projet développé par AppLoumProject.
            </p>
            <p className="text-sm text-emerald-100/75">
              Contact : apploumproject@gmail.com
            </p>
          </div>

          <p className="text-xs text-emerald-100/55 pt-2">
            © 2026 AppLoumProject. Tous droits réservés.
          </p>
        </section>
      </main>
    </div>
  );
};
