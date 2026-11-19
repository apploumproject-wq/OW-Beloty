import { AppSettings, PlayerProfile } from '../types/game';
import { ProfileSyncPayload } from '../types/network';

const PROFILE_STORAGE_KEY = 'owbeloty_local_profile_v1';
const SETTINGS_STORAGE_KEY = 'owbeloty_app_settings_v1';

function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `owb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultProfile(): PlayerProfile {
  return {
    id: generateLocalId(),
    pseudo: 'Joueur 1',
    avatarDataUrl: null,
    updatedAt: Date.now(),
    deviceTag: 'Téléphone local',
  };
}

export function loadLocalProfile(): PlayerProfile {
  if (typeof window === 'undefined') {
    return createDefaultProfile();
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      const fresh = createDefaultProfile();
      saveLocalProfile(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    if (!parsed || typeof parsed.pseudo !== 'string') {
      return createDefaultProfile();
    }
    return {
      id: typeof parsed.id === 'string' && parsed.id ? parsed.id : generateLocalId(),
      pseudo: parsed.pseudo.trim() || 'Joueur 1',
      avatarDataUrl: typeof parsed.avatarDataUrl === 'string' ? parsed.avatarDataUrl : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      deviceTag: typeof parsed.deviceTag === 'string' ? parsed.deviceTag : 'Téléphone local',
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveLocalProfile(profile: PlayerProfile): PlayerProfile {
  const sanitized: PlayerProfile = {
    ...profile,
    pseudo: profile.pseudo.trim().slice(0, 20) || 'Joueur 1',
    updatedAt: Date.now(),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}

export function loadAppSettings(): AppSettings {
  const defaults: AppSettings = {
    turnDirection: 'ANTI_HORAIRE',
    soundEffectsEnabled: true,
    sortCardsBySuit: true,
    tableControlMode: 'TEST_AUTO_ADVERSAIRES',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      turnDirection:
        parsed.turnDirection === 'HORAIRE' || parsed.turnDirection === 'ANTI_HORAIRE'
          ? parsed.turnDirection
          : defaults.turnDirection,
      soundEffectsEnabled:
        typeof parsed.soundEffectsEnabled === 'boolean'
          ? parsed.soundEffectsEnabled
          : defaults.soundEffectsEnabled,
      sortCardsBySuit:
        typeof parsed.sortCardsBySuit === 'boolean'
          ? parsed.sortCardsBySuit
          : defaults.sortCardsBySuit,
      tableControlMode:
        parsed.tableControlMode === 'CONTROLE_4_MAINS' ||
        parsed.tableControlMode === 'TEST_AUTO_ADVERSAIRES'
          ? parsed.tableControlMode
          : defaults.tableControlMode,
    };
  } catch {
    return defaults;
  }
}

export function saveAppSettings(settings: AppSettings): AppSettings {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }
  return settings;
}

/**
 * Redimensionne et compresse une photo sélectionnée depuis la galerie Android
 * afin de garantir sa persistance dans localStorage et sa future diffusion
 * via Hotspot Wi-Fi local (Partie 2).
 */
export async function compressAvatarFile(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format d’image non pris en charge.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexte graphique indisponible.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function createProfileSyncPayload(profile: PlayerProfile): ProfileSyncPayload {
  return {
    schemaVersion: 1,
    senderId: profile.id,
    sentAt: Date.now(),
    profile,
  };
}

export function getPlayerInitials(pseudo: string): string {
  const cleaned = pseudo.trim();
  if (!cleaned) return 'OW';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}


export interface PlayerStatistics {
  solo: { played: number; wins: number; losses: number };
  team: { played: number; wins: number; losses: number; partners: Record<string, number> };
  recordedMatchIds: string[];
}

const STATS_STORAGE_PREFIX = 'owbeloty_stats_v1_';

export function loadPlayerStatistics(profileId: string): PlayerStatistics {
  const empty: PlayerStatistics = {
    solo: { played: 0, wins: 0, losses: 0 },
    team: { played: 0, wins: 0, losses: 0, partners: {} },
    recordedMatchIds: [],
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_PREFIX + profileId);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PlayerStatistics>;
    return {
      solo: { played: parsed.solo?.played ?? 0, wins: parsed.solo?.wins ?? 0, losses: parsed.solo?.losses ?? 0 },
      team: {
        played: parsed.team?.played ?? 0,
        wins: parsed.team?.wins ?? 0,
        losses: parsed.team?.losses ?? 0,
        partners: parsed.team?.partners ?? {},
      },
      recordedMatchIds: Array.isArray(parsed.recordedMatchIds) ? parsed.recordedMatchIds : [],
    };
  } catch {
    return empty;
  }
}

export function recordPlayerMatchResult(
  profileId: string,
  matchId: string,
  category: 'solo' | 'team',
  won: boolean,
  partnerPseudo?: string,
): void {
  if (typeof window === 'undefined' || !profileId || !matchId) return;
  const stats = loadPlayerStatistics(profileId);
  if (stats.recordedMatchIds.includes(matchId)) return;
  const target = stats[category];
  target.played += 1;
  if (won) target.wins += 1;
  else target.losses += 1;
  if (category === 'team' && partnerPseudo) {
    target.partners[partnerPseudo] = (target.partners[partnerPseudo] ?? 0) + 1;
  }
  stats.recordedMatchIds = [...stats.recordedMatchIds, matchId].slice(-500);
  window.localStorage.setItem(STATS_STORAGE_PREFIX + profileId, JSON.stringify(stats));
}
