# Lychee

Votre galerie photo [Lychee](https://lycheeorg.dev) dans Gladys, sur
votre réseau local : le nombre de photos, d'albums et d'utilisateurs, la
dernière photo ajoutée, un appareil par album que vous voulez suivre, des scènes
qui réagissent à l'arrivée de nouvelles photos ou à un album qui grandit, une
action de scène qui lit les dernières photos, et un widget de tableau de bord
avec les dernières photos.

L'intégration a été testée sur une vraie galerie Lychee (l'image Docker
`lycheeorg/lychee`, Lychee 7.12, avec MariaDB), pas encore dans une vraie
installation de Gladys : vos retours sont les bienvenus sur le
[forum Gladys](https://community.gladysassistant.com) ou dans les
[issues](https://github.com/guim31/gladys-lychee/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Une galerie **Lychee** (version 6 ou plus récente, avec l'API `/api/v2`)
  joignable depuis Gladys (même réseau).
- Un compte **administrateur**, ou **autorisé à téléverser** : Lychee ne montre
  l'album « Récents », où l'intégration trouve les nouvelles photos, qu'à ces
  comptes. Un administrateur donne aussi le nombre d'utilisateurs et les totaux
  exacts de la galerie.
- Le mieux : un **jeton d'API** de ce compte : dans Lychee, ouvrez votre
  **profil**, puis **jeton d'API**, créez-en un et copiez-le (Lychee ne
  l'affiche qu'une fois).
- Sinon, le nom d'utilisateur et le mot de passe du compte.

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse de la galerie** avec son port
   et son dossier (par exemple `http://192.168.1.20:8000` ; l'image Docker
   officielle écoute sur le port 8000, et une page de la galerie copiée depuis
   le navigateur convient aussi) et collez le **jeton d'API** dans le champ du
   mot de passe, sans nom d'utilisateur. Avec un compte, saisissez plutôt son
   nom d'utilisateur et son mot de passe.
3. Si vous le souhaitez, listez les **Albums à suivre** : noms ou identifiants
   séparés par des virgules (`Vacances`) ; un sous-album par son chemin
   (`Vacances / Plage`). L'identifiant, ce sont les 24 caractères à la fin de
   l'adresse de l'album (`/gallery/<identifiant>`) ; utilisez-le pour un nom
   qui contient une virgule.
4. Choisissez le **Rafraîchissement** (5 minutes par défaut) et la **Langue des
   noms**, puis enregistrez. **Tester la connexion** lit la galerie tout de
   suite et indique les albums introuvables.
5. Dans **Découverte**, ajoutez l'appareil **Lychee** et les appareils d'album
   que vous voulez.

## Appareils

L'appareil **Lychee** montre toute la galerie (lecture seule) :

| Fonctionnalité         | Ce qu'elle montre                                                          |
| ---------------------- | -------------------------------------------------------------------------- |
| Photos                 | Photos de la galerie (administrateur), ou des albums que vous voyez        |
| Albums                 | Albums de la galerie (administrateur), ou ceux que vous voyez              |
| Utilisateurs           | Utilisateurs de la galerie (compte administrateur seulement)               |
| Dernière photo ajoutée | Son nom, son album s'il est connu et le jour : `Coucher · Plage · 25 oct.` |

Chaque album suivi donne un appareil **Lychee – chemin de l'album** :

| Fonctionnalité | Ce qu'elle montre                                                     |
| -------------- | --------------------------------------------------------------------- |
| Photos         | Photos de l'album lui-même, comme Lychee les compte                   |
| Dernier ajout  | Jour et heure de la dernière photo téléversée : `25 oct. 2026, 17:07` |

L'intégration lit elle-même la galerie (quelques petites requêtes par lecture,
une de plus par album à sous-albums et par album suivi) : rien à régler du côté
de Gladys. Le badge de connexion des appareils passe au rouge quand la galerie
ne répond plus.

## Tableau de bord

Le widget **Dernières photos** affiche les compteurs (photos, albums,
utilisateurs) et les dernières photos téléversées : nom, album s'il est connu,
jour ; un appui montre l'heure du téléversement et le jour de la prise de vue.
Avec le réglage **Album suivi**, il montre l'un de vos albums suivis au lieu de
toute la galerie.

Les miniatures sont **désactivées par défaut** : avec le réglage **Afficher les
miniatures**, la petite miniature carrée de chaque photo s'affiche, et vos
photos apparaissent alors sur tout écran qui affiche ce tableau de bord (une
tablette partagée, un tableau de bord public, Gladys Plus). Le navigateur ne
charge jamais Lychee directement : Gladys le demande à l'intégration, qui ne
sert que les photos listées par le widget.

## Scènes

### Déclencheurs

- **Nouvelles photos ajoutées** : des photos ont été téléversées dans la
  galerie, quel que soit le moyen (envoi web, import, synchronisation), vues à
  la lecture suivante. Variables : nombre de photos ajoutées, nom, album (vide
  pour une photo non classée), date d'ajout et page de la dernière.
- **Photos ajoutées à un album** : un album contient plus de photos qu'à la
  lecture précédente (hors sous-albums ; un nouvel album compte depuis zéro).
  Filtre : le nom de l'album, exactement comme dans Lychee, sans ses albums
  parents. Variables : nom, chemin et identifiant de l'album, photos ajoutées,
  photos dans l'album, page de l'album.

### Actions

- **Lire les dernières photos** : lit tout de suite les dernières photos
  téléversées, dans toute la galerie (l'album « Récents » de Lychee) ou dans un
  album (nom, chemin ou identifiant). Sorties pour les actions suivantes de la
  scène : photos ajoutées en 24 heures, photos au total, nom, album, date
  d'ajout et page de la dernière. Rien ne change dans Lychee.

### Idées de scènes

- Sur **Nouvelles photos ajoutées**, envoyer un message à la famille :
  « {{count}} nouvelles photos, la dernière : {{name}} dans {{album}} ».
- Chaque soir à 21 h, **Lire les dernières photos** de l'album « Famille », et
  si **Photos ajoutées en 24 heures** est supérieur à 0, afficher un message sur
  la tablette du salon.
- Sur **Photos ajoutées à un album** « Vacances 2026 », allumer le couloir en
  bleu.

## Dépannage

- **« jeton d'API, nom d'utilisateur ou mot de passe refusé »** : le jeton a
  été réinitialisé ou mal collé ; avec un compte, vérifiez le nom d'utilisateur
  et le mot de passe.
- **« ce compte ne peut lire l'album « Récents » »** : donnez au compte le droit
  de téléverser dans la gestion des utilisateurs de Lychee, ou utilisez un
  administrateur. L'album « Récents » ne doit pas être désactivé dans les
  réglages de Lychee.
- **« trop de tentatives de connexion »** : Lychee accepte 10 connexions par
  heure. Vérifiez le mot de passe, ou préférez un jeton d'API, qui n'a pas
  besoin de connexion.
- **« la galerie ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys.
- **« aucune galerie Lychee à cette adresse »** : l'adresse mène à une autre
  page (page de connexion d'un proxy inverse, autre application) : saisissez
  l'adresse de la galerie elle-même.
- **« certificat refusé »** : un certificat auto-signé ; utilisez l'adresse en
  `http://` de votre réseau.
- **Les nouvelles photos ne remontent pas** : l'album « Récents » ne contient
  que les photos des derniers jours (réglage « recent_age » de Lychee, 1 jour
  par défaut) ; des photos importées avec une date de téléversement ancienne ne
  sont pas annoncées.
- **Le nombre d'utilisateurs reste vide** : le compte n'est pas
  administrateur.
- `LOG_LEVEL=debug` dans les logs de l'intégration montre chaque lecture.

## Limites

- Les nouvelles photos sont vues à la lecture suivante (5 minutes par défaut),
  et seulement celles que le compte peut voir.
- Le compte d'un album n'inclut pas ses sous-albums : Lychee compte chaque album
  à part. L'arborescence est lue jusqu'à 300 albums.
- L'intégration ne fait que lire : elle ne modifie, n'envoie ni ne supprime rien
  dans Lychee.
- Aucune photo ne quitte votre réseau par l'intégration, sauf si vous activez
  les miniatures du widget.
- Les dates s'affichent dans le fuseau horaire de Gladys.
- Sans lien avec le projet Lychee.
