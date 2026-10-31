// Formats belges : « 1 234,56 € », dates JJ/MM/AAAA.
// Les montants sont TOUJOURS manipulés en centimes entiers.
// Les dates sont stockées en texte « AAAA-MM-JJ » (heure locale, pas de fuseau).

const ESPACE_MILLIERS = ' '; // espace fine insécable
const ESPACE_EURO = ' ';     // espace insécable avant €

/** 123456 → « 1 234,56 € » ; -1250 → « -12,50 € » */
export function euros(centimes) {
  const negatif = centimes < 0;
  const abs = Math.abs(Math.round(centimes));
  const entiers = Math.floor(abs / 100).toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLIERS);
  const decimales = String(abs % 100).padStart(2, '0');
  return (negatif ? '-' : '') + entiers + ',' + decimales + ESPACE_EURO + '€';
}

/** « 12,5 » / « 12.50 » / « 1 234,56 » → centimes (entier), ou null si invalide */
export function versCentimes(texte) {
  if (texte == null) return null;
  const propre = String(texte).replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(propre)) return null;
  const [ent, dec = ''] = propre.split('.');
  return Number(ent) * 100 + Number(dec.padEnd(2, '0'));
}

/** Date du jour en « AAAA-MM-JJ » (heure locale) */
export function aujourdhui() {
  return isoLocal(new Date());
}

/** Objet Date → « AAAA-MM-JJ » (heure locale) */
export function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** « 2026-10-31 » → « 31/10/2026 » */
export function dateFR(iso) {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/** « 2026-10-31 » → « 31/10 » */
export function jjmm(iso) {
  const [, m, j] = iso.split('-');
  return `${j}/${m}`;
}
