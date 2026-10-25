// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Lychee gallery on a fake
// network, a temporary /data and a manual clock, with the integration
// wired on top through registerHandlers. No timer runs unless
// `timers: true`: the tests read the server with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import {
  FakeLychee,
  PLAGE,
  THUMB,
  TOKEN,
  VACANCES,
  createNetwork,
  lycheeId,
  makePhoto,
} from './fakeLychee.js';

process.env.LOG_LEVEL ??= 'silent';
// Dates are shown in the time zone of the container: the tests read them in UTC.
process.env.TZ = 'UTC';

export const SERVER_URL = 'http://192.0.2.10:8000/lychee';

/** A manual clock: shortly after the real captures (16:05 to 16:07 UTC). */
export function createClock(start = Date.parse('2026-10-25T17:00:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { server_url: SERVER_URL, password: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeLychee} [options.server]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  server = new FakeLychee(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-lychee-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [SERVER_URL]: server });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, server, app, hub: app.hub, clock, dataDir };
}

export const galleryDevice = (gladys) => gladys.externalIds('gallery', 'main').device;
export const feature = (gladys, key) => gladys.externalIds('gallery', 'main').feature(key);
export const albumDevice = (gladys, id) => gladys.externalIds('album', String(id)).device;
export const albumFeature = (gladys, id, key) =>
  gladys.externalIds('album', String(id)).feature(key);

/** Resolves once `predicate()` holds (background work of the hub). */
export async function until(predicate, label = 'condition') {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export { FakeLychee, PLAGE, THUMB, TOKEN, VACANCES, lycheeId, makePhoto };
