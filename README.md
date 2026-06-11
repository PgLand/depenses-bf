# GestionDépenses BF

Application web de gestion personnelle des dépenses en **FCFA**, conçue pour le Burkina Faso. Fonctionne **100 % hors ligne** sur téléphone et ordinateur.

## Fonctionnalités

- Tableau de bord mensuel (budget, dépenses, reste, dettes)
- Repas du jour (petit-déj, déjeuner, dîner, snack)
- Dépenses par catégorie
- Suivi des dettes
- Budget mensuel
- Export / import JSON

## Utiliser sur téléphone (PWA)

### Option 1 — En ligne (GitHub Pages)

1. Ouvrez l’adresse de l’app dans Chrome (Android) ou Safari (iPhone).
2. **Android** : menu ⋮ → *Installer l’application* ou *Ajouter à l’écran d’accueil*.
3. **iPhone** : bouton Partager → *Sur l’écran d’accueil*.

L’app s’ouvre comme une application native, sans barre d’adresse, et fonctionne hors ligne.

### Option 2 — En local

Servez le dossier avec un petit serveur web (obligatoire pour la PWA) :

```bash
npx serve .
```

Puis ouvrez l’URL affichée sur votre téléphone (même réseau Wi‑Fi).

## Déploiement GitHub Pages

1. Créez un dépôt GitHub et poussez ce projet.
2. Allez dans **Settings → Pages**.
3. Source : **Deploy from a branch** → branche `main` → dossier `/ (root)`.
4. L’app sera disponible à : `https://VOTRE-USERNAME.github.io/depenses-bf/`

## Structure

```
index.html          Page principale
app.js              Logique et stockage local
styles.css          Styles
manifest.webmanifest Métadonnées PWA
sw.js               Service worker (hors ligne)
icons/icon.svg      Icône de l’app
```

## Données

Les données sont stockées dans le **localStorage** du navigateur. Pensez à exporter régulièrement depuis l’onglet **Paramètres**.

## Licence

Usage personnel libre.
