# Carburant

Application web (React) qui permet de rechercher des stations-service en France et d'afficher les prix des carburants.

- Repo: https://github.com/wxcvbnlmjk/carburant

## Fonctionnalités

- **Recherche par ville avec autocomplétion**
  - Saisie du nom de ville.
  - Suggestions en temps réel.
  - Sélection d'une suggestion pour obtenir **latitude/longitude**.

- **Stations autour d'une ville (rayon 10km)**
  - Appel du endpoint: `/stations/around/{latitude},{longitude}`
  - Filtre types de stations: `R` et `A`.
  - Rayon: `10km` via le header `Range: m=1-10000`.

- **Prix carburants**
  - Récupération des prix via l'API Prix Carburants.
  - Affichage:
    - par station (cards)
    - et en **agrégation par carburant** ("totalité des prix" pour la ville)

- **Badges**
  - Badges GitHub et lien vers l'API affichés dans l'en-tête.

## APIs utilisées

- **API Prix Carburants (2aaz)**
  - Base URL: https://api.prix-carburants.2aaz.fr/
  - Swagger: https://api.prix-carburants.2aaz.fr/swagger.yaml

- **API Adresse (BAN)**
  - Base URL: https://api-adresse.data.gouv.fr/
  - Utilisée pour l'autocomplétion et la récupération des coordonnées.

## Techno

- **Vite**
- **React 19**
- **TypeScript**
- **TailwindCSS**
- **MUI**: The React component library

## Installation

```bash
npm install
```

## Lancer en développement

```bash
npm run dev
```

Puis ouvrir: http://localhost:5173/

## Build production

```bash
npm run build
```

## Aperçu du build

```bash
npm run preview
```
