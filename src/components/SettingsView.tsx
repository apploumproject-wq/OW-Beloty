import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Play, Volume2, VolumeX } from 'lucide-react';
import { OWBELOTY_RULES_SPEC } from '../engine/rulesStatus';
import { runPart2Tests } from '../engine/part2.test';
import { runAllEngineTests, TestCaseResult } from '../engine/scoring.test';
import { AppSettings } from '../types/game';
import { SubPageHeader } from './SubPageHeader';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onBack,
}) => {
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);

  const confirmedRules = useMemo(
    () => OWBELOTY_RULES_SPEC.filter((r) => r.status === 'CONFIRMEE'),
    [],
  );
  const unconfirmedRules = useMemo(
    () => OWBELOTY_RULES_SPEC.filter((r) => r.status === 'A_CONFIRMER'),
    [],
  );

  const handleRunTests = () => {
    setTestResults([...runAllEngineTests(), ...runPart2Tests()]);
  };

  const passedCount = testResults?.filter((t) => t.passed).length ?? 0;

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Paramètres et règles" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-safe flex flex-col gap-6">
        {/* Préférences de jeu */}
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-[#F7F4EB]">
            Préférences de table
          </h2>

          {/* Sens de jeu */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-emerald-100">
              Sens de rotation des tours
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#04190F] border border-white/10">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ ...settings, turnDirection: 'ANTI_HORAIRE' })
                }
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.turnDirection === 'ANTI_HORAIRE'
                    ? 'bg-amber-400 text-[#062114] font-semibold'
                    : 'text-emerald-100/75 hover:text-white'
                }`}
              >
                Anti-horaire
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ ...settings, turnDirection: 'HORAIRE' })
                }
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.turnDirection === 'HORAIRE'
                    ? 'bg-amber-400 text-[#062114] font-semibold'
                    : 'text-emerald-100/75 hover:text-white'
                }`}
              >
                Horaire
              </button>
            </div>
          </div>

          {/* Contrôle de la table locale */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-emerald-100">
              Mode de contrôle en table locale (1 appareil)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl bg-[#04190F] border border-white/10">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    tableControlMode: 'TEST_AUTO_ADVERSAIRES',
                  })
                }
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.tableControlMode === 'TEST_AUTO_ADVERSAIRES'
                    ? 'bg-amber-400 text-[#062114] font-semibold'
                    : 'text-emerald-100/75 hover:text-white'
                }`}
              >
                Avance auto des 3 autres sièges
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    tableControlMode: 'CONTROLE_4_MAINS',
                  })
                }
                className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  settings.tableControlMode === 'CONTROLE_4_MAINS'
                    ? 'bg-amber-400 text-[#062114] font-semibold'
                    : 'text-emerald-100/75 hover:text-white'
                }`}
              >
                Contrôle manuel des 4 mains
              </button>
            </div>
            <p className="text-xs text-emerald-100/65 leading-relaxed">
              Le contrôle manuel des 4 mains permet de tester n’importe quel
              scénario (capot, contre, surcontre) sur un seul appareil.
            </p>
          </div>

          {/* Toggles */}
          <div className="flex flex-col divide-y divide-white/10 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  sortCardsBySuit: !settings.sortCardsBySuit,
                })
              }
              className="min-h-[52px] py-2 flex items-center justify-between gap-4 text-left cursor-pointer"
            >
              <div>
                <div className="text-sm font-medium text-[#F7F4EB]">
                  Trier les cartes automatiquement
                </div>
                <div className="text-xs text-emerald-100/65">
                  Regrouper par couleur et force d’atout
                </div>
              </div>
              <span
                className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 ${
                  settings.sortCardsBySuit ? 'bg-amber-400 justify-end' : 'bg-white/20 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-[#062114]" />
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  soundEffectsEnabled: !settings.soundEffectsEnabled,
                })
              }
              className="min-h-[52px] py-2 flex items-center justify-between gap-4 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                {settings.soundEffectsEnabled ? (
                  <Volume2 className="w-4 h-4 text-amber-300" />
                ) : (
                  <VolumeX className="w-4 h-4 text-emerald-200/50" />
                )}
                <div>
                  <div className="text-sm font-medium text-[#F7F4EB]">
                    Effets sonores hors ligne
                  </div>
                  <div className="text-xs text-emerald-100/65">
                    Sons discrets lors des plis et victoires
                  </div>
                </div>
              </div>
              <span
                className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 ${
                  settings.soundEffectsEnabled ? 'bg-amber-400 justify-end' : 'bg-white/20 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-[#062114]" />
              </span>
            </button>
          </div>
        </section>

        {/* Règles confirmées */}
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-[#F7F4EB]">
            Règles OW’Beloty confirmées
          </h2>
          <div className="flex flex-col divide-y divide-white/10">
            {confirmedRules.map((rule) => (
              <div key={rule.id} className="py-3 first:pt-0 last:pb-0 flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-[#F7F4EB]">
                    {rule.title}
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-100/75 mt-0.5 leading-relaxed">
                    {rule.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Règles à confirmer (affiché uniquement s'il reste des points ouverts) */}
        {unconfirmedRules.length > 0 && (
          <section className="rounded-2xl bg-amber-950/35 border border-amber-400/25 p-5 sm:p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-amber-200">
              Règles nécessitant une confirmation
            </h2>
            <div className="flex flex-col divide-y divide-amber-200/15">
              {unconfirmedRules.map((rule) => (
                <div key={rule.id} className="py-3 first:pt-0 last:pb-0 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-100">
                      {rule.title}
                    </div>
                    <p className="text-xs sm:text-sm text-amber-100/80 mt-0.5 leading-relaxed">
                      {rule.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Suite de tests automatiques du moteur de score */}
        <section className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#F7F4EB]">
                Vérification automatique du moteur de score
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100/70">
                Vérifie les 6 contrats, les capots et les exceptions de contre/surcontre.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunTests}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#062114] text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Exécuter les tests</span>
            </button>
          </div>

          {testResults && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="text-sm font-semibold text-emerald-300 tabular-nums">
                {passedCount} / {testResults.length} tests réussis
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/10 text-xs">
                {testResults.map((res, i) => (
                  <div
                    key={i}
                    className="py-2 flex items-center justify-between gap-3"
                  >
                    <span className="text-emerald-50/90">{res.name}</span>
                    <span
                      className={`font-mono font-semibold shrink-0 ${
                        res.passed ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {res.passed ? 'OK' : `ÉCHEC (${res.details})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
