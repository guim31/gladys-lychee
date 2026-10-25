// -----------------------------------------------------------------------------
// The hub against the fake Lychee gallery: the devices and their states, the
// new photos and album events (once, also across restarts), the followed
// albums, the API token, the sessions and their CSRF cookie, the error
// statuses, the scene action, the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS } from '../src/hub.js';
import {
  CONFIG,
  FakeLychee,
  PLAGE,
  SERVER_URL,
  TOKEN,
  VACANCES,
  albumDevice,
  albumFeature,
  createClock,
  createWorld,
  feature,
  galleryDevice,
  lycheeId,
  makePhoto,
  until,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const state = (w, key) => w.fake.lastState(feature(w.gladys, key));
const ADDED_AT = Date.parse('2026-10-25T16:30:00Z');
const photo = (n, options) => makePhoto(lycheeId(n), { at: ADDED_AT, ...options });

test('discovers the gallery, read by the container, with the users of an admin token', async (t) => {
  const w = await world(t);
  const [device, ...others] = w.fake.discoveredDevices;
  assert.deepEqual(others, [], 'no album followed');
  assert.equal(device.name, 'Lychee');
  assert.equal(device.external_id, galleryDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'LYCHEE_URL', value: SERVER_URL }]);
  assert.deepEqual(
    device.features.map((item) => item.name),
    ['Photos', 'Albums', 'Users', 'Last photo added'],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: galleryDevice(w.gladys),
    transport: 'local',
  });
  // The token goes in its header, never in a URL; the figures are counted again.
  const [first] = w.server.requests;
  assert.equal(first.route, 'Auth::user');
  assert.equal(first.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(w.server.requests.every((request) => !request.route.includes(TOKEN)));
  assert.ok(w.server.requests.some((request) => request.route === 'Admin/Stats'));
});

test('publishes the counters of the real gallery at the first reading', async (t) => {
  const w = await world(t);
  assert.equal(state(w, 'photos'), 4);
  assert.equal(state(w, 'albums'), 2);
  assert.equal(state(w, 'users'), 2);
  // The last upload, although Lychee sorts "Recent" by another order.
  assert.equal(state(w, 'latest'), 'p3.jpg · Plage · Oct 25, 2026');
  assert.deepEqual(w.fake.sceneEvents, [], 'the first reading announces nothing');
});

test('new photos fire photos_added once, with the last one and its album', async (t) => {
  const clock = createClock();
  const dataDir = (await createWorld({ connect: false })).dataDir;
  const w = await world(t, { clock, dataDir });
  w.server.add(photo(1, { album: VACANCES }));
  w.server.add(photo(2, { album: PLAGE, at: ADDED_AT + 1000, title: 'A' }));
  await w.hub.refresh();
  await w.hub.refresh();
  const [event, ...more] = events(w, TRIGGERS.PHOTOS_ADDED);
  assert.deepEqual(more, [], 'announced once');
  assert.deepEqual(event.data, {
    device: galleryDevice(w.gladys),
    count: 2,
    name: 'A',
    album: 'Plage',
    added_at: '2026-10-25 16:30',
    url: `${SERVER_URL}/gallery/${PLAGE}/${lycheeId(2)}`,
  });
  assert.equal(state(w, 'photos'), 6);
  assert.equal(state(w, 'latest'), 'A · Plage · Oct 25, 2026');

  // A restart (same /data) announces nothing twice.
  await w.app.stop();
  const again = await world(t, { clock, dataDir, server: w.server });
  await again.hub.refresh();
  assert.equal(events(again, TRIGGERS.PHOTOS_ADDED).length, 0);
  again.server.add(photo(3, { at: ADDED_AT + 2000 }));
  await again.hub.refresh();
  const [late] = events(again, TRIGGERS.PHOTOS_ADDED);
  assert.equal(late.data.count, 1);
  assert.equal(late.data.album, '', 'an unsorted photo has no album');
  assert.equal(late.data.url, `${SERVER_URL}/gallery/recent/${lycheeId(3)}`);
});

test('a photo uploaded in the same second as the last one seen is still new', async (t) => {
  const w = await world(t);
  w.server.add(photo(1));
  await w.hub.refresh();
  w.server.add(photo(2));
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.PHOTOS_ADDED).map((event) => event.data.count),
    [1, 1],
  );
});

test('every page of "Recent" is read: more photos than one page', async (t) => {
  const server = new FakeLychee({ perPage: 2 });
  const w = await world(t, { server });
  for (let n = 1; n <= 5; n += 1) {
    w.server.add(photo(n, { at: ADDED_AT + n * 1000 }));
  }
  await w.hub.refresh();
  const [event] = events(w, TRIGGERS.PHOTOS_ADDED);
  assert.equal(event.data.count, 5);
  assert.equal(event.data.name, 'Photo photo0000000000000000005');
});

test('nothing recent at the first reading: the next upload is news', async (t) => {
  const server = new FakeLychee();
  server.photos = [];
  const w = await world(t, { server });
  w.server.add(photo(1));
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED).length, 1);
});

test('an album that grows fires album_photos_added, once', async (t) => {
  const w = await world(t);
  w.server.add(photo(1, { album: PLAGE }));
  w.server.add(photo(2, { album: PLAGE }));
  await w.hub.refresh();
  const fired = events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => event.data);
  assert.deepEqual(
    fired.map(({ album, path, album_id: id, count, total }) => [album, path, id, count, total]),
    [['Plage', 'Vacances / Plage', PLAGE, 2, 4]],
  );
  assert.equal(fired[0].device, galleryDevice(w.gladys), 'an album not followed: the gallery');
  assert.equal(fired[0].url, `${SERVER_URL}/gallery/${PLAGE}`);
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).length, 1, 'once');
});

test('a new album counts from zero', async (t) => {
  const w = await world(t);
  const id = 'newalbum0000000000000000';
  w.server.addAlbum(id, 'Nouvel album');
  w.server.add(photo(1, { album: id }));
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => [event.data.album, event.data.count]),
    [['Nouvel album', 1]],
  );
});

test('followed albums are devices with their photos and last addition', async (t) => {
  const w = await world(t, {
    config: { ...CONFIG, albums: `Plage, ${VACANCES}, Nowhere`, language: 'fr' },
  });
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Lychee', 'Lychee – Vacances / Plage', 'Lychee – Vacances'],
  );
  const plage = devices[1];
  assert.equal(plage.external_id, albumDevice(w.gladys, PLAGE));
  assert.deepEqual(plage.params, [{ name: 'LYCHEE_ALBUM_ID', value: PLAGE }]);
  assert.deepEqual(
    plage.features.map((item) => item.name),
    ['Photos', 'Dernier ajout'],
  );
  const lastAdded = (at) =>
    new Intl.DateTimeFormat('fr', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(at));
  assert.equal(w.fake.lastState(albumFeature(w.gladys, PLAGE, 'photos')), 2);
  assert.equal(
    w.fake.lastState(albumFeature(w.gladys, PLAGE, 'last_added')),
    lastAdded('2026-10-25T16:07:21Z'),
  );
  assert.equal(w.fake.lastState(albumFeature(w.gladys, VACANCES, 'photos')), 1);
  assert.deepEqual(w.hub.missing, ['Nowhere']);

  w.server.add(photo(1, { album: PLAGE }));
  await w.hub.refresh();
  assert.equal(w.fake.lastState(albumFeature(w.gladys, PLAGE, 'photos')), 3);
  assert.equal(w.fake.lastState(albumFeature(w.gladys, PLAGE, 'last_added')), lastAdded(ADDED_AT));
  const plageEvent = events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).find(
    (event) => event.data.album_id === PLAGE,
  );
  assert.equal(plageEvent.data.device, albumDevice(w.gladys, PLAGE));

  const report = await w.fake.action('test_connection', {});
  assert.equal(
    report.data.message.fr,
    'Lychee : connecté en tant que admin, 5 photo(s) dans 2 album(s), 2 album(s) suivi(s), introuvable(s) : Nowhere',
  );
});

test('changing the followed albums republishes the devices at once', async (t) => {
  const w = await world(t);
  const requests = w.server.requests.length;
  await w.fake.configUpdated({ ...CONFIG, albums: 'Vacances' });
  await until(() => w.fake.discoveredDevices.length === 2, 'the album device');
  assert.ok(w.server.requests.length > requests);
});

test('states are published on change only, again on device creation', async (t) => {
  const w = await world(t);
  const published = () => w.fake.states.length;
  const before = published();
  await w.hub.refresh();
  assert.equal(published(), before, 'nothing changed: nothing published');
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  await until(() => published() >= before + 4, 'every state again');
  assert.ok(w.fake.widgetRefreshes.includes('latest_photos'));
});

test('an unchanged value is republished after 12 hours', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const before = w.fake.states.length;
  clock.advance(12 * 60 * 60_000 + 1);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before + 4);
});

test('an account and password: one session with its CSRF token, opened again when Lychee forgets it', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  assert.equal(w.server.logins, 1);
  assert.equal(w.fake.connectionStatus.connected, true);
  await w.hub.refresh();
  assert.equal(w.server.logins, 1, 'the session is kept (Lychee allows 10 logins an hour)');
  w.server.forgetSessions();
  await w.hub.refresh();
  assert.equal(w.server.logins, 2);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, 'photos'), 4);
  // The password only goes in the login body.
  const carrying = w.server.requests.filter((r) => JSON.stringify(r).includes('secret-1'));
  assert.deepEqual(
    carrying.map((r) => r.route),
    ['Auth::login', 'Auth::login'],
  );
});

test('an account that is not admin but may upload: no users counter, counts of its albums', async (t) => {
  const server = new FakeLychee();
  server.uploaders.add('reader');
  const w = await world(t, {
    server,
    config: { server_url: SERVER_URL, username: 'reader', password: 'secret-2', language: 'en' },
  });
  assert.deepEqual(
    w.fake.discoveredDevices[0].features.map((item) => item.name),
    ['Photos', 'Albums', 'Last photo added'],
  );
  assert.ok(!w.server.requests.some((r) => r.route === 'Admin/Stats'));
  assert.equal(state(w, 'photos'), 3, 'the photos of its albums');
  assert.equal(state(w, 'albums'), 2);
});

test('an account that may not upload: the status says why', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'reader', password: 'secret-2' },
  });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /may not read the "Recent" album/);
});

test('refused credentials, a wrong address, a gallery that stops answering', async (t) => {
  const wrong = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'nope' },
  });
  assert.equal(wrong.fake.connectionStatus.connected, false);
  assert.equal(
    wrong.fake.connectionStatus.message.fr,
    "Lychee : jeton d'API, nom d'utilisateur ou mot de passe refusé",
  );
  assert.deepEqual(wrong.fake.discoveredDevices, [], 'no device before a first reading');
  await wrong.hub.refresh();
  assert.equal(wrong.server.logins, 1, 'no new attempt for 15 minutes (10 logins an hour)');
  assert.match(wrong.fake.connectionStatus.message.en, /user name or password refused/);
  wrong.clock.advance(15 * 60_000);
  await wrong.hub.refresh();
  assert.equal(wrong.server.logins, 2, 'a failed login leaves no guest session behind');

  const token = await world(t, { config: { ...CONFIG, password: 'nope' } });
  assert.match(token.fake.connectionStatus.message.en, /API token, user name or password refused/);

  const elsewhere = await world(t, { config: { ...CONFIG, server_url: 'http://192.0.2.99' } });
  assert.match(elsewhere.fake.connectionStatus.message.en, /does not answer/);

  const page = await world(t, { config: { ...CONFIG, server_url: 'http://192.0.2.10:8000' } });
  assert.equal(page.fake.connectionStatus.connected, false);

  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  const states = w.fake.states.length;
  await w.hub.refresh();
  assert.equal(w.fake.states.length, states, 'the last counts are not republished as fresh');
  w.server.online = true;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
});

test('too many logins: Lychee throttles, the status says so', async (t) => {
  const server = new FakeLychee();
  server.answer = () => ({
    status: 429,
    headers: {},
    body: JSON.stringify({ message: 'Too Many Attempts.', exception: 'ThrottleRequestsException' }),
  });
  const w = await world(t, {
    server,
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  assert.match(w.fake.connectionStatus.message.en, /too many login attempts/);
});

test('not a Lychee: an HTML page, or no CSRF cookie', async (t) => {
  const server = new FakeLychee();
  server.answer = () => ({ status: 200, headers: {}, body: '<html>login</html>' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /no Lychee gallery at this address/);

  const other = new FakeLychee();
  other.handle = async () => ({ status: 200, headers: {}, body: '<html>other</html>' });
  const session = await world(t, {
    server: other,
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  assert.match(session.fake.connectionStatus.message.en, /no Lychee gallery at this address/);
});

test('incomplete or empty configuration: a status, no device, no request', async (t) => {
  const empty = await world(t, { config: {} });
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.match(empty.fake.connectionStatus.message.en, /Enter the address/);
  assert.deepEqual(empty.fake.discoveredDevices, []);
  const half = await world(t, { config: { server_url: SERVER_URL, username: 'admin' } });
  assert.match(half.fake.connectionStatus.message.en, /incomplete/);
  assert.equal(half.server.requests.length, 0);
});

test('read the last photos: gallery or album, count of 24 hours, outputs', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  w.server.add(photo(1, { album: PLAGE, title: 'Zz' }));
  const gallery = await w.fake.sceneAction('get_latest_photos', {});
  assert.equal(gallery.success, true, gallery.error);
  assert.deepEqual(gallery.data.outputs, {
    count_24h: 5,
    total: 4,
    name: 'Zz',
    album: 'Plage',
    added_at: '2026-10-25 16:30',
    url: `${SERVER_URL}/gallery/${PLAGE}/${lycheeId(1)}`,
  });
  const album = await w.fake.sceneAction('get_latest_photos', { album: 'Vacances / Plage' });
  assert.equal(album.data.outputs.name, 'Zz');
  assert.equal(album.data.outputs.album, 'Plage');
  const old = await world(t, { clock: createClock(Date.parse('2026-10-27T08:00:00Z')) });
  const stale = await old.fake.sceneAction('get_latest_photos', { album: VACANCES });
  assert.equal(stale.success, true, stale.error);
  assert.equal(stale.data.outputs.count_24h, 0);
  assert.equal(stale.data.outputs.name, 'Sunset & sea');
  const unknown = await w.fake.sceneAction('get_latest_photos', { album: 'Nowhere' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Aucun album de ce nom/);
  w.server.online = false;
  const down = await w.fake.sceneAction('get_latest_photos', {});
  assert.equal(down.error, 'Lychee : la galerie ne répond pas');
  // A scene action never fires a trigger.
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('the scene action finds an album created since the last reading', async (t) => {
  const w = await world(t);
  w.server.addAlbum('newalbum0000000000000000', 'Fresh');
  w.server.add(photo(1, { album: 'newalbum0000000000000000' }));
  const ack = await w.fake.sceneAction('get_latest_photos', { album: 'fresh' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.total, 1);
});

test('the container reads the gallery on its own timer', async (t) => {
  const w = await world(t, {
    timers: true,
    config: { ...CONFIG, poll_interval: '60' },
  });
  // The real timer of the start, replaced by a mocked one.
  clearTimeout(w.hub.timer);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  w.hub.schedule();
  const before = w.server.requests.length;
  w.server.add(photo(1));
  t.mock.timers.tick(60_000);
  await w.hub.running;
  t.mock.timers.reset();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED).length, 1, 'a reading by the timer');
  assert.ok(w.server.requests.length > before);
});

test('another account on the same gallery is a starting point, not news', async (t) => {
  const clock = createClock();
  const dataDir = (await createWorld({ connect: false })).dataDir;
  const server = new FakeLychee();
  server.uploaders.add('reader');
  const reader = await world(t, {
    clock,
    dataDir,
    server,
    config: { server_url: SERVER_URL, username: 'reader', password: 'secret-2' },
  });
  await reader.app.stop();
  server.add(photo(1, { album: PLAGE }));
  const w = await world(t, { clock, dataDir, server });
  await w.hub.refresh();
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a reconfiguration during a reading keeps the state of the new gallery clean', async (t) => {
  const w = await world(t);
  w.server.add(photo(1));
  const publish = w.gladys.publishDiscoveredDevices.bind(w.gladys);
  let reconfigured;
  w.gladys.publishDiscoveredDevices = async (devices) => {
    w.gladys.publishDiscoveredDevices = publish;
    reconfigured = w.hub.reconfigure({ ...w.hub.config, url: 'http://192.0.2.99' });
    return publish(devices);
  };
  w.hub.devicesKey = null;
  await w.hub.refresh();
  await reconfigured;
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED).length, 0, 'the old reading is dropped');
  assert.equal(w.hub.status, null);
});

test('a reverse proxy answering 503 means the gallery does not answer', async (t) => {
  const server = new FakeLychee();
  server.answer = () => ({ status: 503, headers: {}, body: '<html>503</html>' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /the gallery does not answer/);
});

test('a session logged out by Lychee logs in again', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  for (const session of w.server.sessions.values()) {
    session.user = null; // password changed elsewhere: the cookies stay valid
  }
  await w.hub.refresh();
  assert.equal(w.server.logins, 2);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a scene action during a login waits for it', async (t) => {
  const w = await world(t, {
    connect: false,
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  await w.gladys.connect();
  await w.app.ready;
  w.server.forgetSessions();
  const [reading, ack] = await Promise.all([
    w.hub.refresh(),
    w.fake.sceneAction('get_latest_photos', {}),
  ]);
  assert.equal(reading, undefined);
  assert.equal(ack.success, true, ack.error);
  assert.equal(w.server.logins, 2, 'one login for both');
});

test('a big followed album is read page by page, and again only when it grows', async (t) => {
  const server = new FakeLychee({ perPage: 2 });
  for (let n = 1; n <= 5; n += 1) {
    server.add(photo(n, { album: PLAGE, at: ADDED_AT - n * 60_000, title: `a${n}` }));
  }
  const w = await world(t, { server, config: { ...CONFIG, albums: 'Plage' } });
  // Sorted by title, the newest upload ("a1") is not on page 1.
  assert.equal(w.hub.albumRecent(w.hub.followed[0])[0].name, 'a1');
  const reads = () =>
    w.server.requests.filter((r) => r.route === 'Album::photos' && r.body === undefined).length;
  const before = reads();
  await w.hub.refresh();
  const recentPages = 5; // "Recent": 9 photos, 2 a page
  assert.equal(reads() - before, recentPages, 'the album was not read again');
});
