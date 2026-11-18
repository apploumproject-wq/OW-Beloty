import React, { useRef, useState } from 'react';
import { Camera, Check, Trash2, Upload } from 'lucide-react';
import {
  compressAvatarFile,
  createProfileSyncPayload,
} from '../engine/profiles';
import { PlayerProfile } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { SubPageHeader } from './SubPageHeader';

interface ProfileViewProps {
  profile: PlayerProfile;
  onSaveProfile: (next: PlayerProfile) => void;
  onBack: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  onSaveProfile,
  onBack,
}) => {
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(
    profile.avatarDataUrl,
  );
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setIsProcessingPhoto(true);
    try {
      const compressed = await compressAvatarFile(file, 256);
      setAvatarDataUrl(compressed);
      const updated: PlayerProfile = {
        ...profile,
        pseudo: pseudo.trim() || profile.pseudo,
        avatarDataUrl: compressed,
        updatedAt: Date.now(),
      };
      onSaveProfile(updated);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2200);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Impossible de charger cette photo.',
      );
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    setAvatarDataUrl(null);
    const updated: PlayerProfile = {
      ...profile,
      pseudo: pseudo.trim() || profile.pseudo,
      avatarDataUrl: null,
      updatedAt: Date.now(),
    };
    onSaveProfile(updated);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pseudo.trim();
    if (cleaned.length < 2) {
      setErrorMessage('Le pseudo doit contenir au moins 2 caractères.');
      return;
    }
    setErrorMessage(null);
    onSaveProfile({
      ...profile,
      pseudo: cleaned.slice(0, 20),
      avatarDataUrl,
      updatedAt: Date.now(),
    });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2200);
  };

  const previewProfile: PlayerProfile = {
    ...profile,
    pseudo: pseudo.trim() || profile.pseudo,
    avatarDataUrl,
  };
  const syncPayload = createProfileSyncPayload(previewProfile);

  return (
    <div className="min-h-dvh flex flex-col felt-surface">
      <SubPageHeader title="Mon profil" onBack={onBack} />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-safe flex flex-col gap-6">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-black/25 border border-white/10 p-5 sm:p-6 flex flex-col gap-6"
        >
          {/* Aperçu avatar et sélection depuis galerie */}
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <PlayerAvatar profile={previewProfile} size="lg" isActiveTurn />

            <div className="flex-1 flex flex-col items-center sm:items-start gap-2.5 text-center sm:text-left">
              <div>
                <h2 className="text-lg font-semibold text-[#F7F4EB]">
                  {previewProfile.pseudo}
                </h2>
                <p className="text-xs text-emerald-100/70">
                  Sauvegardé localement sur ce téléphone
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelectPhoto}
                  className="hidden"
                  id="avatar-gallery-input"
                />
                <button
                  type="button"
                  disabled={isProcessingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium text-[#F7F4EB] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {avatarDataUrl ? (
                    <Camera className="w-4 h-4 text-amber-300" />
                  ) : (
                    <Upload className="w-4 h-4 text-amber-300" />
                  )}
                  <span className="whitespace-nowrap">
                    {isProcessingPhoto
                      ? 'Traitement...'
                      : avatarDataUrl
                        ? 'Remplacer la photo'
                        : 'Ajouter depuis la galerie'}
                  </span>
                </button>

                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-400/25 text-sm font-medium text-red-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="whitespace-nowrap">Supprimer</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Champ pseudo */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="pseudo-input"
              className="text-sm font-medium text-emerald-100"
            >
              Votre pseudo (affiché autour de la table)
            </label>
            <input
              id="pseudo-input"
              type="text"
              maxLength={20}
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Ex. Olivier"
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#04190F] border border-white/15 text-base text-[#F7F4EB] placeholder:text-emerald-200/35 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex items-center justify-between text-xs text-emerald-100/65">
              <span>Entre 2 et 20 caractères</span>
              <span className="tabular-nums">{pseudo.trim().length} / 20</span>
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-300 font-medium" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-[#062114] font-bold text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {savedFeedback ? (
              <>
                <Check className="w-5 h-5" />
                <span>Profil enregistré</span>
              </>
            ) : (
              <span>Enregistrer mon profil</span>
            )}
          </button>
        </form>

        {/* Architecture prête pour la synchronisation Partie 2 */}
        <section className="rounded-2xl bg-black/20 border border-white/10 p-5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[#F7F4EB]">
            Synchronisation automatique (préparée pour la Partie 2)
          </h3>
          <p className="text-sm text-emerald-100/75 leading-relaxed">
            Votre pseudo et votre photo compressée sont conservés après
            fermeture de l’application et empaquetés dans une structure
            normalisée prête à être diffusée automatiquement entre les 4
            téléphones sur Hotspot Wi-Fi local.
          </p>
          <div className="pt-2 text-xs font-mono text-emerald-200/65 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>ID : {syncPayload.profile.id.slice(0, 12)}</span>
            <span aria-hidden="true">·</span>
            <span>Schéma v{syncPayload.schemaVersion}</span>
            <span aria-hidden="true">·</span>
            <span>
              Photo : {avatarDataUrl ? `${Math.round(avatarDataUrl.length / 1024)} Ko` : 'Initiales'}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
};
