// Écran Budgets.
// Phase 0 : affiche les catégories enregistrées (pour vérifier les icônes et les couleurs).
// Les barres de progression arrivent en phase 3.

import { db } from '../db.js';
import { esc, pastille } from '../ui.js';

export async function afficher(el) {
  const cats = (await db.tous('categories')).sort((a, b) => a.ordre - b.ordre);
  const ligne = c => `<li>${pastille(c)}<span>${esc(c.nom)}</span></li>`;

  el.innerHTML = `
    <h1>Budgets</h1>
    <p class="muet petit">Les barres de progression arrivent en phase 3.</p>

    <h2>Dépenses (grille de saisie)</h2>
    <section class="carte"><ul class="liste">
      ${cats.filter(c => c.type === 'sortie' && !c.technique).map(ligne).join('')}
    </ul></section>

    <h2>Charges fixes (catégories techniques)</h2>
    <section class="carte"><ul class="liste">
      ${cats.filter(c => c.technique).map(ligne).join('')}
    </ul></section>

    <h2>Revenus</h2>
    <section class="carte"><ul class="liste">
      ${cats.filter(c => c.type === 'entree').map(ligne).join('')}
    </ul></section>`;
}
