// Écran Historique. Phase 0 : état vide. La liste arrive en phase 1.

export async function afficher(el) {
  el.innerHTML = `
    <h1>Historique</h1>
    <div class="vide">
      <i data-lucide="list"></i>
      <p>Aucune opération pour l'instant.</p>
      <p class="petit">La liste, les filtres et la recherche arrivent en phase 1.</p>
    </div>`;
}
