# Méridien Banque — Application de gestion bancaire

Application complète : Node.js + Express côté serveur, HTML/CSS/JS vanilla côté client.
Aucune base de données : les utilisateurs sont stockés dans `users.txt`, les comptes/transactions/bénéficiaires dans `data.json` (fichier local, pas une base de données).

## 1. Installation

Prérequis : Node.js ≥ 16.

```bash
cd banque-app
npm install
```

Cela installe la seule dépendance nécessaire : `express`.

## 2. Lancement

```bash
node server.js
```

Puis ouvrez : http://localhost:3000

Au premier démarrage, `users.txt` et `data.json` sont créés automatiquement s'ils n'existent pas.

## 3. Format exact de `users.txt`

Une ligne par utilisateur, champs séparés par `:` :

```
identifiant:hashSHA256DuMotDePasse:dateCreationISO8601
```

Exemple réel généré par l'application :

```
jdupont:eb306e53d9259be049239f5954c007ebef182b35b86d09582729f8c418fffe:2026-08-08T18:53:06.382Z
```

- `identifiant` : tel que saisi à l'inscription (3-30 caractères, lettres/chiffres/`._-`)
- `hash` : `SHA-256(motDePasse + sel applicatif)`, généré via `crypto.createHash('sha256')`
- `date` : date de création du compte au format ISO 8601

Ce fichier n'est **jamais** servi par Express (il est hors du dossier `public/`), et toute tentative d'y accéder directement (`/users.txt`) renvoie une erreur `403`.

## 4. Comportement de connexion (tel que spécifié)

- Identifiant absent de `users.txt` → `"Identifiant introuvable"`
- Identifiant présent mais mot de passe erroné → `"Mot de passe incorrect"`
- Identifiant + mot de passe corrects → session créée (cookie `session_token`, HttpOnly)

## 5. Fonctionnalités incluses

- Inscription / connexion avec gestion d'erreurs claire
- Tableau de bord avec solde total et liste des comptes
- Comptes multiples (Courant, Épargne, créés par défaut à l'inscription)
- Historique des transactions avec filtres (compte, type, période)
- Virement entre comptes du même utilisateur
- Ajout / suppression de bénéficiaires (validation IBAN)
- Mode sombre / clair (persisté en `localStorage`)
- Interface responsive, sans dépendance externe

## 6. Sécurité mise en œuvre

- Mots de passe jamais stockés en clair (hash SHA-256 + sel applicatif)
- Validation stricte de toutes les entrées côté serveur (identifiant, mot de passe, montant, IBAN, libellés)
- Échappement systématique des textes libres avant stockage (protection XSS serveur)
- Rendu front exclusivement via `textContent` (jamais `innerHTML`) pour toute donnée venant du serveur
- Sessions par token aléatoire (`crypto.randomBytes`), cookie `HttpOnly`, `SameSite=Lax`
- Toutes les routes de données bancaires protégées par middleware d'authentification
- `users.txt` et `data.json` inaccessibles depuis le navigateur (hors dossier `public/`, routes bloquées explicitement)
- Gestion centralisée des erreurs (400/401/403/404/409/500 avec messages clairs, pas de fuite d'information technique)

## 7. Déploiement (Render, Railway, VPS…)

1. Poussez ce dossier sur un dépôt Git.
2. Sur Render/Railway : créez un service "Web Service" Node.js, commande de build `npm install`, commande de démarrage `node server.js`.
3. Le port est lu depuis `process.env.PORT` (fourni automatiquement par ces plateformes).
4. Pensez à monter `users.txt` et `data.json` sur un disque persistant si la plateforme utilise un système de fichiers éphémère (sinon les données seront réinitialisées à chaque redéploiement).
5. Sur un VPS classique : `npm install --production`, puis lancez avec un gestionnaire de process comme `pm2 start server.js`.

## 8. Limites connues (assumées, vu le cahier des charges)

- Hash SHA-256 + sel fixe : simple comme demandé, mais moins robuste que bcrypt/scrypt (pas de sel par utilisateur, pas de ralentissement volontaire du calcul).
- Sessions en mémoire : elles sont perdues si le serveur redémarre (pas de persistance des sessions, uniquement des comptes).
- Écriture concurrente sur `users.txt`/`data.json` : acceptable pour une démo ou un usage mono-instance, mais pas conçu pour une forte charge concurrente.
