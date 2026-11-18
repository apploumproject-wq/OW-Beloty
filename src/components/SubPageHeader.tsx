import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface SubPageHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}

export const SubPageHeader: React.FC<SubPageHeaderProps> = ({
  title,
  onBack,
  rightAction,
}) => {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[#062114]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-3xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="min-w-[44px] min-h-[44px] -ml-2 px-2 flex items-center gap-1.5 rounded-xl text-emerald-100 hover:bg-white/10 active:scale-95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">
            Accueil
          </span>
        </button>

        <h1
          className="text-base sm:text-lg font-semibold text-[#F7F4EB] truncate text-center"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>

        <div className="min-w-[44px] flex justify-end">{rightAction}</div>
      </div>
    </header>
  );
};
