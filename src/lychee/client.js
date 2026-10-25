// -----------------------------------------------------------------------------
// Lychee API client (/api/v2, JSON), checked against Lychee 7.12
// (test/fixtures/lychee/ holds its real answers).
//
// Authentication, never in the URL nor in the logs:
// - an API token (Lychee: your profile > API token), sent as
//   `Authorization: Bearer <token>` with every request, without a session;
// - a user name and password: `Auth::login` opens a session. Laravel then
//   wants its CSRF token on every request, reads included: the cookie
//   `XSRF-TOKEN` of a web page, sent back in the `X-XSRF-TOKEN` header.
//
// Pitfalls of the real server:
// - every API request needs `Content-Type: application/json`, GET included
//   (HTTP 406 otherwise);
// - without a token, a request without a valid session or CSRF token is an
//   HTTP 419 `Session expired`: the session is opened again once;
// - a refused token is an HTTP 400 `Invalid token`, a refused password an
//   HTTP 401. `Auth::login` allows 10 logins an hour, successful ones
//   included (HTTP 429 beyond): the session is kept, never opened per read;
// - `Admin/Stats` answers figures cached by Lychee: `force=1` counts again;
// - the "Recent" smart album needs the upload right (or an administrator):
//   HTTP 403 `Insufficient privileges` otherwise. `Admin/Stats` is for
//   administrators only;
// - the URLs of the answers carry the host of Lychee's APP_URL: behind a
//   reverse proxy they may not be reachable from here, so the thumbnails are
//   read again on the configured address.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // token, user name or password refused
  RIGHTS: 'rights', // the account may not read the "Recent" album
  THROTTLED: 'throttled', // too many logins: Lychee allows 10 an hour
  NOT_LYCHEE: 'not_lychee', // something answers, not the API of Lychee
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other error
});

export class LycheeError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'LycheeError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const AUTH_MODES = Object.freeze({ TOKEN: 'token', SESSION: 'session' });

/** A user name and its password open a session; a password alone is an API token. */
export const authOf = (username, password) =>
  username && password ? AUTH_MODES.SESSION : AUTH_MODES.TOKEN;

// Lychee ids: 24 characters, or a built-in smart album.
export const ID = /^[A-Za-z0-9_-]{24}$/;

// Smart album of the photos uploaded in the last days (setting `recent_age`).
export const RECENT = 'recent';

export class LycheeClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of Lychee (with its path, no trailing slash)
   * @param {string|null} [options.username]
   * @param {string} options.password API token, or the password of `username`
   * @param {Function} [options.request] HTTP seam (src/lychee/http.js)
   */
  constructor({ url, username = null, password, request = httpRequest }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.request = request;
    this.mode = authOf(username, password);
    /** Session cookies, by name. */
    this.cookies = new Map();
    this.login = null;
  }

  headers() {
    if (this.mode === AUTH_MODES.TOKEN) {
      return { authorization: `Bearer ${this.password}` };
    }
    const headers = {};
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    const xsrf = this.cookies.get('XSRF-TOKEN');
    if (xsrf) {
      headers['x-xsrf-token'] = safeDecode(xsrf);
    }
    return headers;
  }

  keepCookies(setCookie) {
    const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const line of list) {
      const [pair] = line.split(';');
      const at = pair.indexOf('=');
      if (at > 0) {
        this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
    }
  }

  async send(url, options) {
    try {
      return await this.request(url, options);
    } catch (err) {
      throw transportError(err);
    }
  }

  /** One API call; resolves the JSON answer (null for an empty one). */
  async call(path, { method = 'GET', json } = {}) {
    if (this.mode === AUTH_MODES.SESSION && this.cookies.size === 0) {
      await this.openSession();
    }
    let answer = await this.attempt(path, method, json);
    // A session Lychee forgot (expired, restarted): opened again, once.
    if (this.mode === AUTH_MODES.SESSION && [401, 419].includes(answer.status)) {
      this.cookies.clear();
      await this.openSession();
      answer = await this.attempt(path, method, json);
    }
    return decode(answer, path);
  }

  async attempt(path, method, json) {
    const answer = await this.send(`${this.url}/api/v2/${path}`, {
      method,
      json,
      headers: { 'content-type': 'application/json', ...this.headers() },
    });
    if (this.mode === AUTH_MODES.SESSION) {
      this.keepCookies(answer.headers?.['set-cookie']);
    }
    return answer;
  }

  /** Open a session with the user name and password (once for concurrent calls). */
  async openSession() {
    this.login ??= (async () => {
      this.cookies.clear();
      // A web page of Lychee sets the CSRF cookie the API wants.
      const page = await this.send(`${this.url}/gallery`, { headers: { accept: 'text/html' } });
      if (page.status >= 300 && page.status < 400) {
        throw new LycheeError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${page.status})`, {
          status: page.status,
        });
      }
      this.keepCookies(page.headers?.['set-cookie']);
      if (!this.cookies.has('XSRF-TOKEN')) {
        throw new LycheeError(ERROR_KINDS.NOT_LYCHEE, 'No CSRF cookie: not a Lychee gallery', {
          status: page.status,
        });
      }
      const answer = await this.attempt('Auth::login', 'POST', {
        username: this.username,
        password: this.password,
      });
      decode(answer, 'Auth::login');
    })()
      .catch((err) => {
        // A guest session must not pass for a logged-in one at the next call.
        this.cookies.clear();
        throw err;
      })
      .finally(() => {
        this.login = null;
      });
    await this.login;
  }

  /** The account Lychee sees: `{ id, username, may_administrate }`. */
  async user() {
    const user = await this.call('Auth::user');
    if (!user || typeof user !== 'object' || typeof user.username !== 'string') {
      // A token Lychee does not refuse but that is no user's (or no session).
      throw new LycheeError(ERROR_KINDS.AUTH, 'Not logged in');
    }
    return user;
  }

  /** Photos, albums and users of the whole gallery (administrators only). */
  stats() {
    return this.call('Admin/Stats?force=1');
  }

  /** The albums at the root: own, shared and pinned ones, and the smart albums. */
  rootAlbums() {
    return this.call('Albums');
  }

  /** One page of the sub-albums of an album. */
  children(id, page = 1) {
    return this.call(`Album::albums?album_id=${encodeURIComponent(id)}&page=${page}`);
  }

  /** One page of the photos of an album (or of a smart album such as `recent`). */
  photos(id, page = 1) {
    return this.call(`Album::photos?album_id=${encodeURIComponent(id)}&page=${page}`);
  }

  /** The albums holding a photo: `[{ id, title }]`. */
  photoAlbums(id) {
    return this.call(`Photo/${encodeURIComponent(id)}/albums`);
  }

  /** The page of an album, or of a photo in an album, in the web interface. */
  pageUrl(albumId, photoId = null) {
    const album = encodeURIComponent(albumId);
    return photoId === null
      ? `${this.url}/gallery/${album}`
      : `${this.url}/gallery/${album}/${encodeURIComponent(photoId)}`;
  }

  /**
   * The address of a picture URL of an answer, on the configured address:
   * null when it does not point to a picture of the gallery.
   */
  mediaUrl(raw) {
    let url;
    try {
      url = new URL(String(raw));
    } catch {
      return null;
    }
    const relative = `${url.pathname}${url.search}`;
    const at = relative.indexOf('/uploads/');
    if (at === -1 || relative.includes('..')) {
      return null;
    }
    return `${this.url}${relative.slice(at)}`;
  }

  /** The bytes of a picture (a thumbnail), with the credentials of the API. */
  async image(raw) {
    const url = this.mediaUrl(raw);
    if (!url) {
      throw new LycheeError(ERROR_KINDS.HTTP, 'Not a picture of the gallery');
    }
    const answer = await this.send(url, { binary: true, headers: this.headers() });
    if (answer.status !== 200) {
      throw new LycheeError(ERROR_KINDS.HTTP, `Thumbnail answered HTTP ${answer.status}`, {
        status: answer.status,
      });
    }
    return answer.body;
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The JSON of an answer, or the LycheeError it means. */
function decode({ status, body }, what) {
  if (status >= 300 && status < 400) {
    throw new LycheeError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
  }
  const text = typeof body === 'string' ? body : String(body ?? '');
  let json = null;
  if (text.trim() !== '') {
    try {
      json = JSON.parse(text);
    } catch {
      if (status === 404 || (status >= 200 && status < 300)) {
        // A reverse proxy's login page, another web application...
        throw new LycheeError(ERROR_KINDS.NOT_LYCHEE, `${what} did not answer JSON`, { status });
      }
      // A reverse proxy in front of a Lychee that is down.
      const kind = [502, 503, 504].includes(status) ? ERROR_KINDS.UNREACHABLE : ERROR_KINDS.HTTP;
      throw new LycheeError(kind, `${what} answered HTTP ${status}`, { status });
    }
  }
  if (status >= 200 && status < 300) {
    return json;
  }
  const exception = typeof json?.exception === 'string' ? json.exception.slice(0, 60) : '';
  if (status === 401 || status === 419 || (status === 400 && /token/i.test(json?.message ?? ''))) {
    throw new LycheeError(ERROR_KINDS.AUTH, `Credentials refused (HTTP ${status})`, { status });
  }
  if (status === 429) {
    throw new LycheeError(ERROR_KINDS.THROTTLED, `${what}: too many requests`, { status });
  }
  if (status === 403) {
    throw new LycheeError(ERROR_KINDS.RIGHTS, `${what}: insufficient privileges`, { status });
  }
  if (status === 404 && !exception) {
    throw new LycheeError(ERROR_KINDS.NOT_LYCHEE, `${what} answered HTTP 404`, { status });
  }
  throw new LycheeError(ERROR_KINDS.HTTP, `${what} answered HTTP ${status} ${exception}`.trim(), {
    status,
  });
}

function transportError(err) {
  if (err.code === 'ETOOLARGE') {
    return new LycheeError(ERROR_KINDS.HTTP, 'Answer too large');
  }
  if (TLS_CODES.has(err.code)) {
    return new LycheeError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new LycheeError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}
