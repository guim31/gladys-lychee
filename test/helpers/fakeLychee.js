// -----------------------------------------------------------------------------
// An in-memory Lychee gallery behind the `request` seam of the client
// (src/lychee/http.js). Answers are built on the real answers of Lychee 7.12
// (test/fixtures/lychee/), with the behaviors that matter: API tokens in the
// Authorization header, sessions of a user name and password guarded by the
// CSRF cookie of a web page (and a session Lychee forgets), the "Recent"
// album for the accounts allowed to upload only, Admin/Stats for
// administrators only, paginated photos sorted by another order than the
// upload date, a thumbnail, a gallery that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/lychee/${name}.json`, import.meta.url), 'utf8'));

// A real square thumbnail (200 × 200) of a test photo, as Lychee renders it.
export const THUMB = readFileSync(new URL('../fixtures/lychee/thumb.jpeg', import.meta.url));

export const TOKEN = 'AbCdEf0123456789xyzQ==';

export const VACANCES = 's9kf_6meFij0PbG7uoj4KKBm';
export const PLAGE = '21w8pDONX2UYITROfsR8RlxN';

const ORIGIN = 'http://192.0.2.10';

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? '' : JSON.stringify(body),
});
const error = (status, message, exception) => json(status, { message, exception });

/** A 24-character id of Lychee from a number. */
export const lycheeId = (n) => `photo${String(n).padStart(19, '0')}`;

/** A photo like the ones of Album::photos, added at `at` (ms). */
export function makePhoto(id, { title = `Photo ${id}`, at, album = null } = {}) {
  const [template] = fixture('photos-recent').photos;
  const thumb = `${ORIGIN}/uploads/thumb/00/00/${id}.jpeg`;
  return {
    album,
    raw: {
      ...template,
      id,
      title,
      created_at: new Date(at).toISOString().replace('.000Z', '+00:00'),
      size_variants: {
        ...template.size_variants,
        thumb: { ...template.size_variants.thumb, url: thumb },
      },
    },
  };
}

export class FakeLychee {
  constructor({
    token = TOKEN,
    users = { admin: 'secret-1', reader: 'secret-2' },
    perPage = 500,
  } = {}) {
    this.token = token;
    this.users = users;
    this.admins = new Set(['admin']);
    this.uploaders = new Set(['admin']);
    /** Session id -> { xsrf, user }. */
    this.sessions = new Map();
    this.online = true;
    this.perPage = perPage;
    this.userCount = 2;
    const [root] = fixture('albums').albums;
    const [child] = fixture('album-children').data;
    this.albums = [
      { raw: root, parent: null },
      { raw: child, parent: VACANCES },
    ];
    const albumOf = {
      U0jlrTNcLACgbAIPvD70WWVo: VACANCES,
      o6ixmQkGdZSjH1A9cq7H7Bqh: PLAGE,
      fDtpAzFa9_oFRZXc5afeJV1A: PLAGE,
    };
    this.photos = fixture('photos-recent').photos.map((raw) => ({
      raw,
      album: albumOf[raw.id] ?? null,
    }));
    this.requests = [];
    this.logins = 0;
    this.thumbRequests = [];
  }

  /** A photo uploaded outside Gladys. */
  add(photo) {
    this.photos.push(photo);
  }

  /** A new album (at the root, or below `parent`). */
  addAlbum(id, title, parent = null) {
    const [template] = fixture('albums').albums;
    this.albums.push({
      raw: { ...template, id, title, has_subalbum: false, num_subalbums: 0 },
      parent,
    });
  }

  /** Lychee forgets every session (expired, restarted). */
  forgetSessions() {
    this.sessions.clear();
  }

  async handle(path, { method = 'GET', headers = {}, json: body, binary = false } = {}) {
    if (!this.online) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    const url = new URL(path, ORIGIN);
    if (binary) {
      this.thumbRequests.push({ path, headers });
      return url.pathname.startsWith('/uploads/thumb/')
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: THUMB }
        : { status: 404, headers: {}, body: Buffer.alloc(0) };
    }
    if (url.pathname === '/gallery') {
      const id = `s${this.sessions.size + 1}${Math.random().toString(16).slice(2, 10)}`;
      const xsrf = `x${id}=`;
      this.sessions.set(id, { xsrf, user: null });
      return {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'set-cookie': [
            `XSRF-TOKEN=${encodeURIComponent(xsrf)}; path=/; samesite=lax`,
            `lychee_session=${id}; path=/; httponly; samesite=lax`,
          ],
        },
        body: '<html>Lychee</html>',
      };
    }
    if (!url.pathname.startsWith('/api/v2/')) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: '<html>404</html>' };
    }
    const route = decodeURIComponent(url.pathname.slice('/api/v2/'.length));
    this.requests.push({ route, method, headers, body });
    if (headers['content-type'] !== 'application/json') {
      return error(406, 'Content type unacceptable.', 'UnexpectedContentType');
    }
    let user;
    let session = null;
    const authorization = headers.authorization;
    if (authorization !== undefined) {
      if (authorization !== `Bearer ${this.token}`) {
        return error(400, 'Invalid token', 'BadRequestHeaderException');
      }
      user = 'admin';
    } else {
      const id = /lychee_session=([^;]+)/.exec(headers.cookie ?? '')?.[1];
      session = this.sessions.get(id) ?? null;
      if (!session || headers['x-xsrf-token'] !== session.xsrf) {
        return error(419, 'Session expired', 'SessionExpiredException');
      }
      user = session.user;
    }
    return this.answer(route, url.searchParams, { method, body, user, session });
  }

  answer(route, query, { method, body, user, session }) {
    const forbidden = () => error(403, 'Insufficient privileges', 'UnauthorizedException');
    if (route === 'Auth::login' && method === 'POST') {
      this.logins += 1;
      if (this.users[body?.username] === undefined || this.users[body.username] !== body.password) {
        return error(401, 'Unknown user or invalid password', 'UnauthenticatedException');
      }
      session.user = body.username;
      return json(204);
    }
    if (route === 'Auth::user') {
      if (!user) {
        return json(200, null);
      }
      return json(200, {
        ...fixture('auth-user'),
        id: Object.keys(this.users).indexOf(user) + 1,
        username: user,
        may_administrate: this.admins.has(user),
      });
    }
    if (!user) {
      return error(401, 'User is not authenticated', 'UnauthenticatedException');
    }
    switch (route) {
      case 'Admin/Stats':
        if (!this.admins.has(user)) {
          return forbidden();
        }
        return json(200, {
          ...fixture('stats'),
          photos_count: this.photos.length,
          albums_count: this.albums.length,
          users_count: this.userCount,
        });
      case 'Albums':
        return json(200, {
          ...fixture('albums'),
          albums: this.albums.filter((album) => album.parent === null).map((a) => this.albumRaw(a)),
        });
      case 'Album::albums': {
        const children = this.albums
          .filter((album) => album.parent === query.get('album_id'))
          .map((album) => this.albumRaw(album));
        return json(200, { data: children, current_page: 1, last_page: 1, per_page: 30 });
      }
      case 'Album::photos': {
        const id = query.get('album_id');
        if (id === 'recent' && !this.uploaders.has(user)) {
          return forbidden();
        }
        if (id !== 'recent' && !this.albums.some((album) => album.raw.id === id)) {
          return error(404, 'Album not found', 'ModelNotFoundException');
        }
        const list = this.photos.filter((photo) => id === 'recent' || photo.album === id);
        // Lychee sorts by the album setting (here: the title), not by the upload date.
        const sorted = [...list].sort((a, b) => a.raw.title.localeCompare(b.raw.title));
        const page = Number(query.get('page') ?? 1);
        const lastPage = Math.max(1, Math.ceil(sorted.length / this.perPage));
        return json(200, {
          photos: sorted
            .slice((page - 1) * this.perPage, page * this.perPage)
            .map((photo) => ({ ...photo.raw, album_id: id })),
          current_page: page,
          last_page: lastPage,
          per_page: this.perPage,
          total: sorted.length,
        });
      }
      default: {
        const match = /^Photo\/([^/]+)\/albums$/.exec(route);
        if (match) {
          const photo = this.photos.find((item) => item.raw.id === match[1]);
          const album = this.albums.find((item) => item.raw.id === photo?.album);
          return json(200, album ? [{ id: album.raw.id, title: album.raw.title }] : []);
        }
        return error(404, 'Not found', 'NotFoundHttpException');
      }
    }
  }

  albumRaw({ raw }) {
    const children = this.albums.filter((album) => album.parent === raw.id).length;
    return {
      ...raw,
      num_photos: this.photos.filter((photo) => photo.album === raw.id).length,
      num_subalbums: children,
      has_subalbum: children > 0,
    };
  }
}

/** A fake network: the servers by origin, every other address unreachable. */
export function createNetwork(servers) {
  return {
    async request(url, options) {
      const target = new URL(url);
      const entry = Object.entries(servers).find(([base]) => url.startsWith(`${base}/`));
      if (!entry) {
        throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
      }
      const [base, server] = entry;
      const path = `${target.pathname}${target.search}`.slice(new URL(base).pathname.length);
      return server.handle(path.startsWith('/') ? path : `/${path}`, options);
    },
  };
}
