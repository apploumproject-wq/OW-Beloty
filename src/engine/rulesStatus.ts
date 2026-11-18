export interface RuleItem {
  id: string;
  title: string;
  description: string;
  status: 'CONFIRMEE' | 'A_CONFIRMER';
}

export const OWBELOTY_RULES_SPEC: RuleItem[] = [
  {
    id: 'distribution-3-2-3',
    title: 'Distribution en deux étapes (3 + 2 puis 3)',
    description:
      'Chaque joueur reçoit 3 cartes puis 2 cartes (5 cartes visibles uniquement pour soi). Après validation du contrat, les 3 cartes restantes sont distribuées à chaque joueur pour atteindre 8 cartes.',
    status: 'CONFIRMEE',
  },
  {
    id: 'premier-annonceur',
    title: 'Premier annonceur aléatoire et rotation antihoraire',
    description:
      'Le premier annonceur est tiré au sort au début de la partie, puis avance d’un siège dans le sens inverse des aiguilles d’une montre (SUD → EST → NORD → OUEST) à chaque manche. Il doit obligatoirement choisir un contrat.',
    status: 'CONFIRMEE',
  },
  {
    id: 'hierarchie-encheres',
    title: 'Hiérarchie officielle des six contrats',
    description:
      'Du plus faible au plus fort : 1. Trèfle · 2. Carreau · 3. Cœur · 4. Pique · 5. Sans Atout · 6. Tout Atout. Toute surenchère doit être strictement supérieure au contrat précédent.',
    status: 'CONFIRMEE',
  },
  {
    id: 'contre-surcontre-restrictions',
    title: 'Contre, surcontre et exceptions',
    description:
      'Un joueur ne peut pas contrer son partenaire ; le premier annonceur garde le droit de contrer un contrat adverse. Le déclarant et son partenaire peuvent surcontrer lorsque leur contrat est contré. Contré = × 2, surcontré = × 4, sauf Trèfle et Sans Atout (pas de multiplicateur supplémentaire au surcontre).',
    status: 'CONFIRMEE',
  },
  {
    id: 'reussite-contrat-points-cartes',
    title: 'Réussite du contrat aux points des cartes + 10 de der',
    description:
      'Après les 8 plis, les points de cartes + 10 de der départagent les équipes : le déclarant réussit uniquement s’il a strictement plus de points internes que l’adversaire. En cas d’infériorité ou d’égalité exacte, l’adversaire reçoit les points du contrat OW’Beloty. Ces points internes ne sont jamais ajoutés au cumul.',
    status: 'CONFIRMEE',
  },
  {
    id: 'bareme-simple',
    title: 'Barème OW’Beloty et objectif 150 points',
    description:
      'Trèfle 32 · Carreau 16 · Cœur 16 · Pique 16 · Sans Atout 52 · Tout Atout 26. Victoire immédiate à 150 points. Aucun partage de points et aucun bonus belote/rebelote.',
    status: 'CONFIRMEE',
  },
  {
    id: 'capot',
    title: 'Priorité absolue du capot (8 plis)',
    description:
      'Capot détecté avant le calcul normal : victoire immédiate en contrat couleur ; 90 pts en Sans Atout ; 35 pts (déclarante) ou 45 pts (adverse) en Tout Atout (× 2 si contré, × 2 encore si surcontré).',
    status: 'CONFIRMEE',
  },
  {
    id: 'obligations-jeu-atout',
    title: 'Obligations classiques de belote',
    description:
      'Obligation de fournir à la couleur demandée ; couper et surcouper si l’adversaire est maître (en contrat couleur) ; monter à l’atout en contrat couleur ou Tout Atout ; aucune obligation d’atout en Sans Atout.',
    status: 'CONFIRMEE',
  },
];
