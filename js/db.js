// Couche de stockage.
// Pour la maquette (navigateur / GitHub Pages) : IndexedDB.
// Pour l'application installée (phase 5) : on branchera SQLite derrière
// EXACTEMENT les mêmes fonctions, sans toucher au reste du code.

const NOM_BASE = 'budget';
const VERSION_BASE = 2;   // v2 : ajout de la table « journal »
export const TABLES = ['operations', 'categories', 'recurrents', 'budgets'];

let ouverture = null;

function ouvrir() {
  if (ouverture) return ouverture;
  ouverture = new Promise((ok, ko) => {
    const req = indexedDB.open(NOM_BASE, VERSION_BASE);
    req.onupgradeneeded = () => {
      const base = req.result;
      for (const t of TABLES) {
        if (!base.objectStoreNames.contains(t)) {
          const store = base.createObjectStore(t, { keyPath: 'id', autoIncrement: true });
          if (t === 'operations') {
            store.createIndex('date', 'date');
            store.createIndex('recurrent_id', 'recurrent_id');
          }
        }
      }
      if (!base.objectStoreNames.contains('parametres')) {
        base.createObjectStore('parametres', { keyPath: 'cle' });
      }
      if (!base.objectStoreNames.contains('journal')) {
        base.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  // Demande au navigateur de ne pas effacer les données (iOS/Safari)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  return ouverture;
}

// Exécute une action dans une transaction et renvoie son résultat
function transaction(tables, mode, action) {
  return ouvrir().then(base => new Promise((ok, ko) => {
    const tx = base.transaction(tables, mode);
    let resultat;
    const req = action(tx);
    if (req) req.onsuccess = () => { resultat = req.result; };
    tx.oncomplete = () => ok(resultat);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error);
  }));
}

function sansIdVide(obj) {
  const copie = { ...obj };
  if (copie.id == null) delete copie.id;
  return copie;
}

export const db = {
  /** Tous les enregistrements d'une table */
  tous: (table) => transaction(table, 'readonly', tx => tx.objectStore(table).getAll()),

  /** Un enregistrement par id */
  lire: (table, id) => transaction(table, 'readonly', tx => tx.objectStore(table).get(id)),

  /** Nombre d'enregistrements */
  compter: (table) => transaction(table, 'readonly', tx => tx.objectStore(table).count()),

  /** Ajoute et renvoie le nouvel id */
  ajouter: (table, obj) => transaction(table, 'readwrite', tx => tx.objectStore(table).add(sansIdVide(obj))),

  /** Ajoute plusieurs enregistrements en une seule transaction */
  ajouterPlusieurs: (table, liste) => transaction(table, 'readwrite', tx => {
    const store = tx.objectStore(table);
    liste.forEach(obj => store.add(sansIdVide(obj)));
  }),

  /** Remplace un enregistrement existant (doit avoir un id) */
  modifier: (table, obj) => transaction(table, 'readwrite', tx => tx.objectStore(table).put(obj)),

  /** Supprime par id */
  supprimer: (table, id) => transaction(table, 'readwrite', tx => tx.objectStore(table).delete(id)),

  /** Opérations entre deux dates incluses (« AAAA-MM-JJ ») */
  operationsEntre: (debut, fin) => transaction('operations', 'readonly', tx =>
    tx.objectStore('operations').index('date').getAll(IDBKeyRange.bound(debut, fin))),

  /** Paramètre (valeur par défaut si absent) */
  async parametre(cle, defaut = null) {
    const ligne = await transaction('parametres', 'readonly', tx => tx.objectStore('parametres').get(cle));
    return ligne ? ligne.valeur : defaut;
  },

  definirParametre: (cle, valeur) => transaction('parametres', 'readwrite', tx =>
    tx.objectStore('parametres').put({ cle, valeur })),

  // ----- Journal technique (jamais inclus dans les sauvegardes) -----
  journalAjouter: (entree) => transaction('journal', 'readwrite', tx => tx.objectStore('journal').add(entree)),
  journalTous: () => transaction('journal', 'readonly', tx => tx.objectStore('journal').getAll()),
  journalVider: () => transaction('journal', 'readwrite', tx => tx.objectStore('journal').clear()),

  /** Ne garde que les `max` entrées les plus récentes */
  async journalElaguer(max) {
    const base = await ouvrir();
    return new Promise((ok, ko) => {
      const tx = base.transaction('journal', 'readwrite');
      const store = tx.objectStore('journal');
      const compte = store.count();
      compte.onsuccess = () => {
        let aSupprimer = compte.result - max;
        if (aSupprimer <= 0) return;
        const curseur = store.openCursor();
        curseur.onsuccess = () => {
          const c = curseur.result;
          if (c && aSupprimer-- > 0) { c.delete(); c.continue(); }
        };
      };
      tx.oncomplete = () => ok();
      tx.onerror = tx.onabort = () => ko(tx.error);
    });
  },

  /** Efface toutes les données de l'application (pas le journal). Sert au « code oublié ». */
  viderTout: () => transaction([...TABLES, 'parametres'], 'readwrite', tx => {
    [...TABLES, 'parametres'].forEach(n => tx.objectStore(n).clear());
  }),

  /** Copie complète de la base (toutes les tables + les paramètres), pour la sauvegarde */
  async exporterTout() {
    const base = await ouvrir();
    const noms = [...TABLES, 'parametres'];
    return new Promise((ok, ko) => {
      const tx = base.transaction(noms, 'readonly');
      const resultat = {};
      noms.forEach(n => {
        const req = tx.objectStore(n).getAll();
        req.onsuccess = () => { resultat[n] = req.result; };
      });
      tx.oncomplete = () => ok(resultat);
      tx.onerror = tx.onabort = () => ko(tx.error);
    });
  },

  /**
   * Remplace TOUTES les données par celles d'une sauvegarde, en une seule transaction :
   * si quelque chose échoue, rien n'est modifié.
   * Les paramètres locaux qui ne sont pas dans la sauvegarde (compteurs…) sont conservés.
   */
  remplacerTout: (donnees, parametres) => transaction([...TABLES, 'parametres'], 'readwrite', tx => {
    for (const t of TABLES) {
      const store = tx.objectStore(t);
      store.clear();
      (donnees[t] || []).forEach(obj => store.put(obj));
    }
    const sp = tx.objectStore('parametres');
    Object.entries(parametres || {}).forEach(([cle, valeur]) => sp.put({ cle, valeur }));
  }),
};
