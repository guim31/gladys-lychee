// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (answers of a real Lychee 7.12): idle, followed albums, after new
// photos, an account that is not admin, a session, a gallery that stops
// answering, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CONFIG,
  FakeLychee,
  PLAGE,
  SERVER_URL,
  VACANCES,
  createWorld,
  lycheeId,
  makePhoto,
} from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const FOLLOWED = { ...CONFIG, albums: `Vacances / Plage, ${VACANCES}` };

const scenarios = [
  { label: 'idle', config: CONFIG, devices: 1 },
  { label: 'followed albums', config: FOLLOWED, devices: 3 },
  { label: 'new photos', config: FOLLOWED, devices: 3, added: true },
  { label: 'French names', config: { ...FOLLOWED, language: 'fr' }, devices: 3, added: true },
  { label: 'German names', config: { ...FOLLOWED, language: 'de' }, devices: 3 },
  { label: 'Spanish names', config: { ...FOLLOWED, language: 'es' }, devices: 3 },
  {
    label: 'account that is not admin',
    config: { server_url: SERVER_URL, username: 'reader', password: 'secret-2', albums: 'Plage' },
    devices: 2,
    uploader: true,
  },
  {
    label: 'session of an admin',
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1', albums: 'Plage' },
    devices: 2,
  },
  { label: 'gallery down after a reading', config: FOLLOWED, devices: 3, down: true },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const fake = new FakeLychee();
    if (scenario.uploader) {
      fake.uploaders.add('reader');
    }
    const { gladys, app, hub, server, clock } = await createWorld({
      config: scenario.config,
      server: fake,
    });
    if (scenario.added) {
      server.add(makePhoto(lycheeId(6), { album: PLAGE, at: clock.now() }));
      server.add(makePhoto(lycheeId(7), { album: VACANCES, at: clock.now() }));
      await hub.refresh();
    }
    if (scenario.down) {
      server.online = false;
      await hub.refresh();
    }
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, scenario.devices, 'the gallery and the followed albums');

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds.
          const value = gladys.fake.lastState(feature.external_id);
          if (feature.category === 'text') {
            assert.ok(value === undefined || (typeof value === 'string' && value !== ''));
            continue;
          }
          assert.equal(typeof value, 'number', `${at}: no state published`);
          assert.ok(value >= feature.min && value <= feature.max, `${at}: ${value} out of bounds`);
          if (feature.type === 'integer' || feature.type === 'binary') {
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
