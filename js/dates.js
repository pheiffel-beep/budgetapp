// Outils de dates et de périodes (mois budgétaires).
// Toutes les dates sont des textes « AAAA-MM-JJ » en heure locale.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const p2 = n => String(n).padStart(2, '0');
export const dateDe = (a, m, j) => `${a}-${p2(m)}-${p2(j)}`;
export const joursDansMois = (a, m) => new Date(a, m, 0).getDate();
const morceaux = iso => iso.split('-').map(Number);

/** Ajoute n jours à une date ISO */
export function ajouterJours(iso, n) {
  const [a, m, j] = morceaux(iso);
  const d = new Date(a, m - 1, j + n);
  return dateDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Début de période d'un mois donné (jour de début ramené au dernier jour si besoin) */
function debutDuMois(a, m, jourDebut) {
  return dateDe(a, m, Math.min(jourDebut, joursDansMois(a, m)));
}

/**
 * Période budgétaire qui contient la date.
 * Avec jourDebut = 1 : du 1er au dernier jour du mois.
 * Avec jourDebut = 25 : du 25 au 24 du mois suivant.
 */
export function periodeContenant(iso, jourDebut = 1) {
  let [a, m] = morceaux(iso);
  if (iso < debutDuMois(a, m, jourDebut)) { m--; if (m < 1) { m = 12; a--; } }
  return periodeDuMois(a, m, jourDebut);
}

/** Période qui commence dans le mois (a, m) */
export function periodeDuMois(a, m, jourDebut = 1) {
  const debut = debutDuMois(a, m, jourDebut);
  let a2 = a, m2 = m + 1; if (m2 > 12) { m2 = 1; a2++; }
  const fin = ajouterJours(debutDuMois(a2, m2, jourDebut), -1);
  return { annee: a, mois: m, debut, fin };
}

/** Période décalée de n mois (n = -1 : précédente, +1 : suivante) */
export function decalerPeriode(per, n, jourDebut = 1) {
  let a = per.annee, m = per.mois + n;
  while (m < 1) { m += 12; a--; }
  while (m > 12) { m -= 12; a++; }
  return periodeDuMois(a, m, jourDebut);
}

/** « Octobre 2026 » ou « Période du 25/10 au 24/11 » */
export function libellePeriode(per, jourDebut = 1) {
  if (jourDebut === 1) return `${majuscule(MOIS[per.mois - 1])} ${per.annee}`;
  const c = iso => { const [, m, j] = iso.split('-'); return `${j}/${m}`; };
  return `Période du ${c(per.debut)} au ${c(per.fin)}`;
}

/** « Samedi 31 octobre » */
export function libelleJour(iso) {
  const [a, m, j] = morceaux(iso);
  const d = new Date(a, m - 1, j);
  return `${majuscule(JOURS[d.getDay()])} ${j} ${MOIS[m - 1]}`;
}

export const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Nombre de jours entre deux dates « AAAA-MM-JJ » */
export function ecartJours(de, a) {
  const t = iso => { const [y, m, j] = iso.split('-').map(Number); return Date.UTC(y, m - 1, j); };
  return Math.round((t(a) - t(de)) / 86400000);
}

/** « Période du 01/10 au 31/10 » */
export function libelleDates(per) {
  const c = iso => { const [, m, j] = iso.split('-'); return `${j}/${m}`; };
  return `Période du ${c(per.debut)} au ${c(per.fin)}`;
}
