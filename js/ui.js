// Petits outils d'interface partagés par tous les écrans.

/** Redessine les icônes Lucide présentes dans la page */
export function icones() {
  if (window.lucide) window.lucide.createIcons();
}

/** Échappe le texte saisi avant de l'insérer dans du HTML */
export function esc(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Pastille ronde d'une catégorie (icône + couleur) */
export function pastille(cat) {
  return `<span class="pastille" style="background:${esc(cat.couleur)}" aria-hidden="true">
            <i data-lucide="${esc(cat.icone)}"></i></span>`;
}

// ---- Panneau du bas ----
const voile = () => document.getElementById('voile');
const panneau = () => document.getElementById('panneau');

export function ouvrirPanneau(html) {
  panneau().innerHTML = `<div class="poignee" aria-hidden="true"></div>${html}`;
  voile().hidden = false;
  panneau().hidden = false;
  icones();
  voile().onclick = fermerPanneau;
}

export function fermerPanneau() {
  voile().hidden = true;
  panneau().hidden = true;
  panneau().innerHTML = '';
}

// ---- Message court, avec bouton d'action facultatif (ex. « Annuler ») ----
let minuterie = null;
export function toast(message, { action = null, surAction = null, duree = 3000 } = {}) {
  const el = document.getElementById('toast');
  clearTimeout(minuterie);
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; surAction && surAction(); };
  minuterie = setTimeout(() => { el.hidden = true; }, duree);
}
