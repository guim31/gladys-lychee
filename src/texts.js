// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, the errors of
// the scene action, and the "last photo added" features. Four languages, the
// four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './lychee/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Lychee gallery in the configuration.',
    fr: "Saisissez l'adresse de votre galerie Lychee dans la configuration.",
    de: 'Gib die Adresse deiner Lychee-Galerie in der Konfiguration ein.',
    es: 'Introduzca la dirección de su galería Lychee en la configuración.',
  },
  invalid: {
    en: 'The configuration is incomplete: address (e.g. http://192.168.1.2:8000) and an API token, or a user name and its password.',
    fr: "La configuration est incomplète : adresse (ex. http://192.168.1.2:8000) et jeton d'API, ou nom d'utilisateur et mot de passe.",
    de: 'Die Konfiguration ist unvollständig: Adresse (z. B. http://192.168.1.2:8000) und API-Token oder Benutzername und Passwort.',
    es: 'La configuración está incompleta: dirección (p. ej. http://192.168.1.2:8000) y token de API, o usuario y contraseña.',
  },
};

// One short explanation per error kind (src/lychee/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the gallery does not answer',
    fr: 'la galerie ne répond pas',
    de: 'die Galerie antwortet nicht',
    es: 'la galería no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token, user name or password refused',
    fr: "jeton d'API, nom d'utilisateur ou mot de passe refusé",
    de: 'API-Token, Benutzername oder Passwort abgelehnt',
    es: 'token de API, usuario o contraseña rechazados',
  },
  [ERROR_KINDS.RIGHTS]: {
    en: 'this account may not read the "Recent" album: use an admin or an account allowed to upload',
    fr: "ce compte ne peut lire l'album « Récents » : prenez un admin ou un compte qui peut téléverser",
    de: 'dieses Konto darf „Zuletzt hinzugefügt“ nicht lesen: Nimm einen Admin oder ein Upload-Konto',
    es: 'esta cuenta no puede leer «Reciente»: use un admin o una cuenta que pueda subir fotos',
  },
  [ERROR_KINDS.THROTTLED]: {
    en: 'too many login attempts, Lychee refuses them for up to an hour: check the password',
    fr: "trop de tentatives de connexion, Lychee les refuse jusqu'à une heure : vérifiez le mot de passe",
    de: 'zu viele Anmeldeversuche, Lychee lehnt sie bis zu einer Stunde ab: Prüfe das Passwort',
    es: 'demasiados intentos de conexión, Lychee los rechaza hasta una hora: compruebe la contraseña',
  },
  [ERROR_KINDS.NOT_LYCHEE]: {
    en: 'no Lychee gallery at this address',
    fr: 'aucune galerie Lychee à cette adresse',
    de: 'keine Lychee-Galerie unter dieser Adresse',
    es: 'no hay ninguna galería Lychee en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its path',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec son chemin",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrem Pfad ein',
    es: 'la dirección redirige: introduzca la dirección final, con su ruta',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (user) => `Lychee: connected as ${user}`,
    gallery: (photos, albums) => `${photos} photo(s) in ${albums} album(s)`,
    followed: (count) => `${count} followed album(s)`,
    missing: (list) => `not found: ${list}`,
  },
  fr: {
    ok: (user) => `Lychee : connecté en tant que ${user}`,
    gallery: (photos, albums) => `${photos} photo(s) dans ${albums} album(s)`,
    followed: (count) => `${count} album(s) suivi(s)`,
    missing: (list) => `introuvable(s) : ${list}`,
  },
  de: {
    ok: (user) => `Lychee: verbunden als ${user}`,
    gallery: (photos, albums) => `${photos} Foto(s) in ${albums} Album/Alben`,
    followed: (count) => `${count} verfolgte(s) Album/Alben`,
    missing: (list) => `nicht gefunden: ${list}`,
  },
  es: {
    ok: (user) => `Lychee: conectado como ${user}`,
    gallery: (photos, albums) => `${photos} foto(s) en ${albums} álbum(es)`,
    followed: (count) => `${count} álbum(es) seguido(s)`,
    missing: (list) => `no encontrado(s): ${list}`,
  },
};

// Errors of the scene action (shown in the scene logs of Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Lychee gallery is configured.',
    fr: "Aucune galerie Lychee n'est configurée.",
    de: 'Keine Lychee-Galerie ist konfiguriert.',
    es: 'No hay ninguna galería Lychee configurada.',
  },
  unknownAlbum: {
    en: 'No album of this name or id in the gallery.',
    fr: 'Aucun album de ce nom ou de cet identifiant dans la galerie.',
    de: 'Kein Album mit diesem Namen oder dieser ID in der Galerie.',
    es: 'No hay ningún álbum con este nombre o identificador en la galería.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Every language of a table, rendered by `render(table[language], language)`. */
export const everyLanguage = (table, render) =>
  Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text, language)]),
  );

// Dates in the time zone of the container: the supervisor sets TZ to the one of Gladys.

/** "25 Oct 2026": the day of a date. */
export function dayOf(time, language) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(time));
}

/** "25 Oct 2026, 07:50": a date with its time. */
export function momentOf(time, language) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** "Beach sunset · Holidays / Beach · 25 Oct 2026": the "last photo added" feature. */
export function describePhoto(image, albumName, language) {
  return [image.name, albumName, image.addedAt === null ? null : dayOf(image.addedAt, language)]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 200);
}
