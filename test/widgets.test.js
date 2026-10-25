// -----------------------------------------------------------------------------
// The "Last photos" widget: content validated by the SDK's own validator
// (what the core accepts), the gallery or a followed album, the opt-in
// thumbnails served through onWidgetGetImage.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { photoKey } from '../src/widgets.js';
import {
  CONFIG,
  SERVER_URL,
  THUMB,
  PLAGE,
  VACANCES,
  albumDevice,
  createWorld,
  galleryDevice,
  lycheeId,
  makePhoto,
} from './helpers/world.js';

const ADDED_AT = Date.parse('2026-10-25T16:30:00Z');

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEYS.LATEST_PHOTOS, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const body = ack.data.content;
  assert.deepEqual(validateWidgetContent(body), [], JSON.stringify(body));
  assert.ok(body.components.length <= 8, 'the budget of the core');
  assert.ok(body.components.filter((c) => c.type === 'text').length <= 2, 'two texts at most');
  return body;
}

const ofType = (body, type) => body.components.filter((component) => component.type === type);

test('the gallery: counters and the last photos, without thumbnails', async (t) => {
  const w = await world(t);
  const body = await content(w, {}, 'fr');
  assert.deepEqual(
    ofType(body, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Photos', 4],
      ['Albums', 2],
      ['Utilisateurs', 2],
    ],
  );
  const [list] = ofType(body, 'card-list');
  assert.equal(list.items.length, 4);
  assert.deepEqual(list.items[0], {
    title: 'p3.jpg',
    subtitle: '25 oct. 2026',
    description: 'p3.jpg\nAjoutée le 25 oct. 2026, 16:07',
  });
  assert.ok(
    list.items.every((item) => item.image === undefined),
    'no thumbnail by default',
  );
});

test('thumbnails on demand, served from the gallery, only for the photos shown', async (t) => {
  const w = await world(t);
  const body = await content(w, { thumbnails: true });
  const [list] = ofType(body, 'card-list');
  const id = 'fDtpAzFa9_oFRZXc5afeJV1A';
  assert.equal(list.items[0].image, photoKey(id));
  assert.match(list.items[0].image, /^photo-[0-9a-f]{48}$/, 'a lowercase key, as the core wants');
  const ack = await w.fake.widgetGetImage(photoKey(id));
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, THUMB.toString('base64'));
  // Read on the configured address, not the host written in the answer.
  assert.equal(
    w.server.thumbRequests[0].path,
    '/uploads/thumb/ab/8c/384c50c11576d1f0c84042647b57.jpeg',
  );
  for (const key of [photoKey(lycheeId(99)), `thumb-${id}`, '../etc/passwd']) {
    const refused = await w.fake.widgetGetImage(key);
    assert.equal(refused.success, false, key);
  }
});

test('a followed album: its name, its photos, its last photos', async (t) => {
  const w = await world(t, { config: { ...CONFIG, albums: 'Plage' } });
  w.server.add(makePhoto(lycheeId(6), { album: PLAGE, at: ADDED_AT }));
  await w.hub.refresh();
  const body = await content(w, { album: albumDevice(w.gladys, PLAGE), thumbnails: true });
  assert.deepEqual(ofType(body, 'text')[0].text, 'Plage');
  assert.deepEqual(
    ofType(body, 'value').map((tile) => tile.value),
    [3],
  );
  const [list] = ofType(body, 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    [`Photo ${lycheeId(6)}`, 'p3.jpg', 'p1.jpg'],
  );
  assert.equal(list.items[0].subtitle, 'Plage · Oct 25, 2026');
  const ack = await w.fake.widgetGetImage(photoKey(lycheeId(6)));
  assert.equal(ack.success, true, ack.error);
  // The gallery device, or an album no longer followed: the whole gallery.
  for (const album of [galleryDevice(w.gladys), albumDevice(w.gladys, VACANCES)]) {
    const gallery = await content(w, { album });
    assert.equal(ofType(gallery, 'value').length, 3);
  }
});

test('not configured, unreachable, empty', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const down = await world(t, { config: { ...CONFIG, server_url: 'http://192.0.2.99' } });
  assert.match((await content(down)).components[0].text, /does not answer/);

  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  const stale = await content(w);
  assert.equal(ofType(stale, 'value').length, 3, 'the last counters stay');
  assert.match(ofType(stale, 'text')[0].text, /does not answer/);

  const nothing = await world(t, { config: { server_url: SERVER_URL, password: CONFIG.password } });
  nothing.server.photos = [];
  await nothing.hub.refresh();
  assert.match(ofType(await content(nothing), 'text')[0].text, /No photo yet/);
});

test('a new photo asks Gladys to refresh the widget', async (t) => {
  const w = await world(t);
  const before = w.fake.widgetRefreshes.length;
  await w.hub.refresh();
  assert.equal(w.fake.widgetRefreshes.length, before, 'nothing changed');
  w.server.add(makePhoto(lycheeId(6), { at: ADDED_AT }));
  await w.hub.refresh();
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});
