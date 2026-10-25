// -----------------------------------------------------------------------------
// Normalization of the configuration: the address typed by the user, the API
// token or the account, the albums to follow, the interval and the language;
// and the parsing of the real Lychee 7.12 answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  matchAlbums,
  normalizeConfig,
  parseAlbumList,
  parseServerUrl,
} from '../src/config.js';
import { AUTH_MODES, LycheeClient, authOf } from '../src/lychee/client.js';
import {
  byAddition,
  pageOf,
  parseAlbum,
  parsePhoto,
  parseStats,
  parseUser,
  rootEntries,
  stamp,
  timeOf,
} from '../src/lychee/model.js';
import { describePhoto } from '../src/texts.js';
import { PLAGE, TOKEN, VACANCES, fixture } from './helpers/fakeLychee.js';

// Dates are shown in the time zone of the container: read them in UTC here.
process.env.TZ = 'UTC';

test('the address: bare host, page of the gallery, sub-folder', () => {
  assert.equal(parseServerUrl('192.0.2.30:8000'), 'http://192.0.2.30:8000');
  assert.equal(
    parseServerUrl(`http://192.0.2.30/photos/gallery/${VACANCES}/x?y#z`),
    'http://192.0.2.30/photos',
  );
  assert.equal(parseServerUrl('https://example.org/lychee/'), 'https://example.org/lychee');
  assert.equal(parseServerUrl('https://example.org/api/v2/Albums'), 'https://example.org');
  assert.equal(parseServerUrl('ftp://192.0.2.30'), null);
  assert.equal(parseServerUrl('http://user:pass@192.0.2.30'), null, 'no credentials in the URL');
  assert.equal(parseServerUrl('  '), null);
  assert.equal(parseServerUrl(42), null);
});

test('defaults, API token, account, incomplete', () => {
  const empty = normalizeConfig({});
  assert.equal(empty.url, null);
  assert.equal(empty.incomplete, false);
  assert.equal(empty.pollIntervalMs, 300_000);
  assert.equal(empty.language, DEFAULT_CONFIG.language);
  assert.equal(empty.language, 'fr');

  const token = normalizeConfig({ server_url: '192.0.2.30', password: ` ${TOKEN} ` });
  assert.equal(token.url, 'http://192.0.2.30');
  assert.equal(token.password, TOKEN);
  assert.equal(token.username, null);

  const account = normalizeConfig({
    server_url: 'http://192.0.2.30',
    username: ' admin ',
    password: 'secret',
    albums: 'Vacances, Plage',
    poll_interval: '60',
    language: 'de',
  });
  assert.equal(account.username, 'admin');
  assert.deepEqual(account.albums, ['Vacances', 'Plage']);
  assert.equal(account.pollIntervalMs, 60_000);
  assert.equal(account.language, 'de');

  for (const raw of [
    { server_url: '192.0.2.30' },
    { server_url: '192.0.2.30', username: 'admin' },
    { password: TOKEN },
    { server_url: 'ftp://x', password: TOKEN },
  ]) {
    const config = normalizeConfig(raw);
    assert.equal(config.url, null, JSON.stringify(raw));
    assert.equal(config.incomplete, true, JSON.stringify(raw));
  }
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('how to authenticate: a token alone, or an account and its password', () => {
  assert.equal(authOf(null, TOKEN), AUTH_MODES.TOKEN);
  assert.equal(authOf('admin', 'secret'), AUTH_MODES.SESSION);
});

test('the albums to follow: list, ids, paths, names', () => {
  assert.deepEqual(parseAlbumList(' Vacances ;vacances,Vacances/Plage ,, '), [
    'Vacances',
    'Vacances / Plage',
  ]);
  assert.deepEqual(parseAlbumList(undefined), []);
  const vacances = parseAlbum(fixture('albums').albums[0]);
  const albums = [vacances, parseAlbum(fixture('album-children').data[0], vacances)];
  const { matched, missing } = matchAlbums(
    ['plage', VACANCES, 'Vacances / Plage', 'Nowhere', 'x'.repeat(24)],
    albums,
  );
  assert.deepEqual(
    matched.map((album) => album.id),
    [PLAGE, VACANCES],
  );
  assert.deepEqual(missing, ['Nowhere', 'x'.repeat(24)]);
});

test('the real answers: user, figures, albums, photos', () => {
  assert.deepEqual(parseUser(fixture('auth-user')), { id: '1', username: 'admin', admin: true });
  assert.equal(parseUser(null).admin, false);
  assert.deepEqual(parseStats(fixture('stats')), { photos: 3, albums: 2, users: 2 });
  assert.deepEqual(parseStats(null), { photos: null, albums: null, users: null });

  const root = rootEntries(fixture('albums'));
  assert.deepEqual(
    root.map((raw) => raw.id),
    [VACANCES],
    'the smart albums are not part of the tree',
  );
  const vacances = parseAlbum(root[0]);
  assert.deepEqual(vacances, {
    id: VACANCES,
    name: 'Vacances',
    path: 'Vacances',
    photos: 1,
    children: true,
  });
  const children = pageOf(fixture('album-children'), 'data');
  assert.equal(children.lastPage, 1);
  assert.deepEqual(parseAlbum(children.items[0], vacances), {
    id: PLAGE,
    name: 'Plage',
    path: 'Vacances / Plage',
    photos: 2,
    children: false,
  });
  assert.equal(parseAlbum(fixture('albums').smart_albums[0]), null);
  assert.equal(parseAlbum({ ...root[0], is_tag_album: true }), null);

  const page = pageOf(fixture('photos-recent'), 'photos');
  assert.equal(page.total, 4);
  const photos = page.items.map(parsePhoto).sort(byAddition);
  assert.deepEqual(
    photos.map(({ name, addedAt }) => [name, new Date(addedAt).toISOString()]),
    [
      ['p3.jpg', '2026-10-25T16:07:21.000Z'],
      ['p1.jpg', '2026-10-25T16:05:29.000Z'],
      ['p2.jpg', '2026-10-25T16:05:29.000Z'],
      ['Sunset & sea', '2026-10-25T16:05:28.000Z'],
    ],
  );
  assert.match(photos[0].thumbUrl, /\/uploads\/thumb\/.+\.jpeg$/);
  assert.equal(photos[0].takenAt, null, 'no EXIF date');
  assert.equal(parsePhoto({ id: 'short' }), null);
  assert.deepEqual(pageOf({ error: 'x' }, 'photos'), { items: [], lastPage: 1, total: null });
});

test('dates of Lychee', () => {
  assert.equal(timeOf('2026-10-25T16:05:29+00:00'), Date.parse('2026-10-25T16:05:29Z'));
  assert.equal(timeOf('2026-10-25T18:05:29+02:00'), Date.parse('2026-10-25T16:05:29Z'));
  assert.equal(timeOf('Oct 2026'), null);
  assert.equal(timeOf(null), null);
  assert.equal(stamp(Date.parse('2026-10-25T05:50:06Z')), '2026-10-25 05:50');
  assert.equal(stamp(null), '');
});

test('the "last photo added" text, in the four languages', () => {
  const image = { name: 'Sunset', addedAt: Date.parse('2026-05-14T21:30:00Z') };
  assert.equal(describePhoto(image, 'Beach', 'en'), 'Sunset · Beach · May 14, 2026');
  assert.equal(describePhoto(image, 'Plage', 'fr'), 'Sunset · Plage · 14 mai 2026');
  assert.equal(describePhoto(image, null, 'de'), 'Sunset · 14. Mai 2026');
  assert.equal(describePhoto({ ...image, addedAt: null }, null, 'es'), 'Sunset');
});

test('thumbnail URLs are read on the configured address, folder included', () => {
  const client = new LycheeClient({ url: 'http://192.0.2.30:8000/photos', password: TOKEN });
  assert.equal(
    client.mediaUrl('http://lychee.lan/photos/uploads/thumb/c1/83/a.jpeg'),
    'http://192.0.2.30:8000/photos/uploads/thumb/c1/83/a.jpeg',
  );
  assert.equal(
    client.mediaUrl('https://cdn.example/uploads/thumb/a.jpeg?sig=1'),
    'http://192.0.2.30:8000/photos/uploads/thumb/a.jpeg?sig=1',
  );
  assert.equal(client.mediaUrl('http://other/api/v2/Albums'), null);
  assert.equal(client.mediaUrl('http://other/uploads/../../etc/passwd'), null);
  assert.equal(client.mediaUrl('not a url'), null);
  assert.equal(
    client.pageUrl(VACANCES, 'IUjOldsao7jwx319mTd6OEjX'),
    `http://192.0.2.30:8000/photos/gallery/${VACANCES}/IUjOldsao7jwx319mTd6OEjX`,
  );
});
