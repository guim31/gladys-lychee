// -----------------------------------------------------------------------------
// The hub: reads the Lychee gallery on a timer of the container, publishes
// the states of the gallery and of the followed albums when they change,
// fires the scene events, and answers the scene action and the widget.
//
// One reading (every `pollIntervalMs`, 1 to 15 min, configuration): who
// Lychee sees (Auth::user), the figures of the gallery (Admin/Stats,
// administrators only), the album tree (Albums, then Album::albums for the
// albums that have sub-albums), the "Recent" smart album, and the photos of
// each followed album. Photo ids of Lychee are random: the photos uploaded
// after the last upload date seen (and not seen at that very second) fire
// `photos_added`; an album holding more photos than at the previous reading
// fires `album_photos_added`. The cursor and the album counts live under
// /data: an addition is announced once, also across restarts.
//
// Gladys never polls the devices (should_poll: false): the scene events must
// fire even before a device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { matchAlbums } from './config.js';
import {
  albumIds,
  albumValues,
  buildAlbumDevice,
  buildGalleryDevice,
  galleryIds,
  galleryValues,
} from './devices.js';
import { ERROR_KINDS, LycheeClient, RECENT } from './lychee/client.js';
import {
  byAddition,
  pageOf,
  parseAlbum,
  parsePhoto,
  parseStats,
  parseUser,
  rootEntries,
  stamp,
} from './lychee/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  describePhoto,
  everyLanguage,
  labelled,
  momentOf,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'lychee-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  LATEST_PHOTOS: 'latest_photos',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PHOTOS_ADDED: 'photos_added',
  ALBUM_PHOTOS_ADDED: 'album_photos_added',
});

export const HUB_TIMINGS = {
  // Pages of photos read at most per album (Lychee pages hold 500 by default).
  maxPages: 4,
  // Albums of the tree read at most.
  maxAlbums: 300,
  // Followed albums read at most (one more request each).
  maxFollowed: 20,
  // Photos kept for the widget.
  shownCount: 8,
  // At most this many album events per reading.
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

const DAY_MS = 24 * 60 * 60_000;

const signature = (config) => JSON.stringify([config.url, config.username, config.password]);

/**
 * The gallery and the account reading it (never a secret: the user id of
 * Lychee). Another account sees other photos and albums: its additions are
 * counted again from now.
 */
export const identityOf = (url, user) => `${url}|user:${user.id ?? user.username}`;

const freshSaved = (source) => ({ source, lastAt: null, lastIds: [], albums: null });

const emptySnapshot = () => ({
  photos: null,
  albums: null,
  users: null,
  admin: false,
  latest: null,
});

export class LycheeHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/lychee/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.reachable = null;
    this.error = null;
    /** Auth::user, parsed (parseUser); null before the first reading. */
    this.status = null;
    this.snapshot = emptySnapshot();
    /** The last photos added, the newest first (parsePhoto). */
    this.recent = [];
    /** Every album the account sees (parseAlbum). */
    this.albums = [];
    /** The followed albums found in the gallery, and the entries not found. */
    this.followed = [];
    this.missing = [];
    /** The last photos of each followed album, the newest first: id -> photos. */
    this.albumPhotos = new Map();
    /** Albums of the photos announced: photo id -> { id, name }. */
    this.photoAlbum = new Map();
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transportsKey = null;
    this.connection = null;
    this.devicesKey = null;
    /** Kept under /data: whose additions, last upload date and its ids, album counts. */
    this.saved = freshSaved(null);
    this.timer = null;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      source: typeof saved.source === 'string' ? saved.source : null,
      lastAt: Number.isInteger(saved.lastAt) && saved.lastAt >= 0 ? saved.lastAt : null,
      lastIds: Array.isArray(saved.lastIds)
        ? saved.lastIds.filter((id) => typeof id === 'string')
        : [],
      albums: saved.albums && typeof saved.albums === 'object' ? saved.albums : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transportsKey = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new LycheeClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
    }
    try {
      if (this.status) {
        // Only the albums or the language changed: no need to wait for the reading.
        this.followAlbums();
        await this.publishDevices();
      }
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
    }
  }

  reset() {
    this.published.clear();
    this.reachable = null;
    this.error = null;
    this.status = null;
    this.snapshot = emptySnapshot();
    this.recent = [];
    this.albums = [];
    this.followed = [];
    this.missing = [];
    this.albumPhotos.clear();
    this.photoAlbum.clear();
    this.transportsKey = null;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  // --- Reading the gallery -------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    const client = this.client;
    if (!client) {
      await this.publishDevices();
      await this.afterChanges(false);
      return;
    }
    let changed;
    try {
      const status = parseUser(await client.user());
      const stats = status.admin
        ? await client.stats().then(parseStats, (err) => {
            if (![ERROR_KINDS.HTTP, ERROR_KINDS.RIGHTS].includes(err.kind)) {
              throw err;
            }
            return parseStats(null);
          })
        : parseStats(null);
      const albums = await this.readAlbums(client);
      const recent = await this.readPhotos(client, RECENT);
      const { matched } = matchAlbums(this.config.albums, albums);
      const albumPhotos = new Map();
      for (const album of matched.slice(0, this.timings.maxFollowed)) {
        albumPhotos.set(album.id, await this.readPhotos(client, album.id, 1));
      }
      if (client !== this.client) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (this.error) {
        logger.info('Lychee: connection restored');
      } else if (this.reachable === null) {
        logger.info(`Lychee: connected as ${status.username}`);
      }
      // Another gallery or another account: its additions are counted again from now.
      const source = identityOf(this.config.url, status);
      if (this.saved.source !== source) {
        this.saved = freshSaved(source);
      }
      const saved = this.saved;
      const before = this.widgetKey();
      const wasReachable = this.reachable;
      this.error = null;
      this.reachable = true;
      this.status = status;
      this.albums = albums;
      this.albumPhotos = albumPhotos;
      this.recent = recent.slice(0, this.timings.shownCount);
      this.followAlbums();
      const fresh = this.freshPhotos(recent, saved);
      if (fresh.length > 0) {
        await this.learnAlbum(client, fresh[0]);
      }
      this.snapshot = {
        photos: stats.photos ?? albums.reduce((sum, album) => sum + album.photos, 0),
        albums: stats.albums ?? albums.length,
        users: stats.users,
        admin: status.admin,
        latest: recent[0]
          ? describePhoto(recent[0], this.albumName(recent[0]), this.config.language)
          : null,
      };
      await this.publishDevices();
      if (client !== this.client) {
        return;
      }
      await this.announcePhotos(fresh);
      await this.announceAlbums(albums, saved);
      await this.publishStates();
      changed = wasReachable !== true || before !== this.widgetKey();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      changed = this.reachable !== false;
      this.applyFailure(err);
    }
    await this.afterChanges(changed);
  }

  /**
   * Every album the account sees: the root, then the sub-albums of the
   * albums that have some, breadth first, `maxAlbums` at most.
   */
  async readAlbums(client) {
    const albums = [];
    const queue = rootEntries(await client.rootAlbums())
      .map((raw) => parseAlbum(raw))
      .filter(Boolean);
    const seen = new Set();
    while (queue.length > 0 && albums.length < this.timings.maxAlbums) {
      const album = queue.shift();
      if (seen.has(album.id)) {
        continue;
      }
      seen.add(album.id);
      albums.push(album);
      if (!album.children) {
        continue;
      }
      for (let page = 1; page <= this.timings.maxPages; page += 1) {
        const { items, lastPage } = pageOf(await client.children(album.id, page), 'data');
        queue.push(...items.map((raw) => parseAlbum(raw, album)).filter(Boolean));
        if (page >= lastPage) {
          break;
        }
      }
    }
    return albums;
  }

  /** The photos of an album (or of "Recent"), the newest addition first. */
  async readPhotos(client, id, pages = this.timings.maxPages) {
    const photos = [];
    for (let page = 1; page <= pages; page += 1) {
      const { items, lastPage } = pageOf(await client.photos(id, page), 'photos');
      photos.push(...items.map(parsePhoto).filter(Boolean));
      if (page >= lastPage) {
        break;
      }
    }
    return photos.sort(byAddition);
  }

  /** What the widget shows of the gallery: it is refreshed when this changes. */
  widgetKey() {
    return JSON.stringify([
      this.snapshot,
      this.recent.map((photo) => photo.id),
      this.followed.map((album) => [album.id, album.photos]),
    ]);
  }

  /** The followed albums of the configuration, among the albums of the gallery. */
  followAlbums() {
    const { matched, missing } = matchAlbums(this.config.albums, this.albums);
    this.followed = matched.slice(0, this.timings.maxFollowed);
    const key = `albums:${missing.join('|')}`;
    if (missing.join('|') !== this.missing.join('|')) {
      for (const old of this.warned) {
        if (old.startsWith('albums:')) {
          this.warned.delete(old);
        }
      }
      if (missing.length > 0) {
        this.problem(key, `Albums to follow not found: ${missing.join(', ')}`);
      }
    }
    this.missing = missing;
  }

  /** The name of the album of a photo, null when unknown. */
  albumName(photo) {
    if (this.photoAlbum.has(photo.id)) {
      return this.photoAlbum.get(photo.id).name;
    }
    for (const [id, photos] of this.albumPhotos) {
      if (photos.some((item) => item.id === photo.id)) {
        return this.albums.find((album) => album.id === id)?.name ?? null;
      }
    }
    return null;
  }

  /** "Recent" does not tell the album of a photo: ask Lychee (one request). */
  async learnAlbum(client, photo) {
    try {
      const list = await client.photoAlbums(photo.id);
      const first = Array.isArray(list)
        ? list.find((item) => typeof item?.title === 'string')
        : null;
      if (first) {
        this.photoAlbum.set(photo.id, { id: String(first.id), name: first.title.trim() });
      }
    } catch (err) {
      logger.debug(`Album of photo ${photo.id} unknown: ${err.message}`);
    }
    // Keep the cache small: the widget shows a handful of photos.
    while (this.photoAlbum.size > 50) {
      this.photoAlbum.delete(this.photoAlbum.keys().next().value);
    }
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Lychee: ${err.message}`);
    } else {
      logger.debug(`Lychee: ${err.message} (again)`);
    }
  }

  /**
   * The photos uploaded since the previous reading, the newest first, and the
   * cursor moved past them: uploaded after the last date seen, or at that
   * very second and not seen yet. The first reading of a gallery is the
   * starting point, not news.
   */
  freshPhotos(recent, saved) {
    const dated = recent.filter((photo) => photo.addedAt !== null);
    const { lastAt, lastIds } = saved;
    const fresh =
      lastAt === null
        ? []
        : dated.filter(
            (photo) =>
              photo.addedAt > lastAt || (photo.addedAt === lastAt && !lastIds.includes(photo.id)),
          );
    const newest = Math.max(lastAt ?? 0, ...dated.map((photo) => photo.addedAt));
    saved.lastIds = [
      ...new Set([
        ...(newest === lastAt ? lastIds : []),
        ...dated.filter((photo) => photo.addedAt === newest).map((photo) => photo.id),
      ]),
    ].slice(-200);
    // Nothing recent at the first reading: any photo seen later is new (lastAt 0).
    saved.lastAt = newest;
    this.save(saved);
    return fresh;
  }

  /** Announce the photos uploaded since the previous reading. */
  async announcePhotos(fresh) {
    if (fresh.length === 0) {
      return;
    }
    const [latest] = fresh;
    logger.debug(`New photos: ${fresh.length}`);
    await this.fire(TRIGGERS.PHOTOS_ADDED, galleryIds(this.gladys).device, {
      count: fresh.length,
      name: latest.name,
      album: this.albumName(latest) ?? '',
      added_at: stamp(latest.addedAt),
      url: this.client.pageUrl(this.photoAlbum.get(latest.id)?.id ?? RECENT, latest.id),
    });
  }

  /**
   * Announce the albums holding more photos than at the previous reading. An
   * album seen for the first time after the first reading counts from zero
   * (a new album). Albums no longer seen keep their count.
   */
  async announceAlbums(albums, saved) {
    const previous = saved.albums;
    const current = { ...previous };
    const grown = [];
    for (const album of albums) {
      const before = previous?.[album.id] ?? 0;
      current[album.id] = album.photos;
      // The first reading of the albums is the starting point.
      if (previous && album.photos > before) {
        grown.push({ album, added: album.photos - before, before });
      }
    }
    // Past the cap, an album keeps its previous count: announced at the next reading.
    for (const { album, before } of grown.slice(this.timings.maxEventsPerRead)) {
      current[album.id] = before;
    }
    saved.albums = current;
    this.save(saved);
    for (const { album, added } of grown.slice(0, this.timings.maxEventsPerRead)) {
      logger.debug(`Album ${album.id}: ${added} new photo(s)`);
      const followed = this.followed.some((item) => item.id === album.id);
      await this.fire(
        TRIGGERS.ALBUM_PHOTOS_ADDED,
        followed ? albumIds(this.gladys, album.id).device : galleryIds(this.gladys).device,
        {
          album: album.name,
          album_id: album.id,
          path: album.path,
          count: added,
          total: album.photos,
          url: this.client.pageUrl(album.id),
        },
      );
    }
  }

  /** Write the state, unless a reconfiguration replaced it meanwhile. */
  save(saved) {
    if (saved === this.saved) {
      this.store.save(saved);
    }
  }

  /** Fire a scene event. */
  async fire(key, device, data) {
    try {
      await this.gladys.publishSceneEvent(key, { device, ...data });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    if (this.config?.url && !this.status) {
      return; // the users counter depends on the account: wait for the first reading
    }
    const language = this.config?.language;
    const devices = this.config?.url
      ? [
          buildGalleryDevice(
            this.gladys,
            { url: this.config.url, admin: this.status.admin },
            language,
          ),
          ...this.followed.map((album) => buildAlbumDevice(this.gladys, album, language)),
        ]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the devices again, read the gallery. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const ours = [
      galleryIds(this.gladys).device,
      ...this.followed.map((album) => albumIds(this.gladys, album.id).device),
    ];
    if (!ours.includes(device.external_id)) {
      return;
    }
    this.transportsKey = null;
    await this.publishStates({ force: true });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEYS.LATEST_PHOTOS);
  }

  /** Every feature value of the gallery and of the followed albums. */
  values() {
    const language = this.config?.language;
    return [
      ...galleryValues(this.gladys, this.snapshot),
      ...this.followed.flatMap((album) =>
        albumValues(this.gladys, album.id, {
          photos: album.photos,
          lastAdded: this.lastAddedOf(album, language),
        }),
      ),
    ];
  }

  /** One publication at a time: a late answer never records an older value. */
  publishStates(options) {
    const run = (this.publishing ?? Promise.resolve()).then(() => this.publishNow(options));
    this.publishing = run;
    return run;
  }

  async publishNow({ force = false } = {}) {
    // While the gallery is down, the last counts are not republished as fresh.
    if (this.reachable !== true && !force) {
      return;
    }
    const now = this.now();
    const states = [];
    for (const { externalId, value, text } of this.values()) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      if (!force && last && last.value === value && now - last.at < this.timings.heartbeatMs) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (changed) {
      this.gladys.requestWidgetRefresh(WIDGET_KEYS.LATEST_PHOTOS);
    }
  }

  async publishTransports() {
    if (this.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    const list = [
      galleryIds(this.gladys).device,
      ...this.followed.map((album) => albumIds(this.gladys, album.id).device),
    ].map((externalId) => ({ external_id: externalId, transport }));
    const key = JSON.stringify(list);
    if (key === this.transportsKey) {
      return;
    }
    try {
      await this.gladys.publishTransports(list);
      this.transportsKey = key;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('Lychee', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Scene action and widget -----------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('Lychee', text, this.config.language));
  }

  /** The date of the last addition to a followed album, as text (null: none). */
  lastAddedOf(album, language) {
    const at = this.albumPhotos.get(album.id)?.[0]?.addedAt ?? null;
    return at === null ? null : momentOf(at, language);
  }

  /**
   * Read the last photos now, of the gallery or of an album (`entry`: name,
   * full path or id). Answers the outputs of the scene action.
   */
  async latestPhotos(entry) {
    const client = this.requireClient();
    try {
      let album = null;
      if (entry) {
        [album] = matchAlbums([entry], this.albums).matched;
        if (!album) {
          // An album created since the last reading.
          this.albums = await this.readAlbums(client);
          [album] = matchAlbums([entry], this.albums).matched;
        }
        if (!album) {
          throw new Error(pick(ACTION_TEXT.unknownAlbum, this.config.language));
        }
      }
      const photos = await this.readPhotos(client, album ? album.id : RECENT);
      const [last] = photos;
      if (last && !album && !this.photoAlbum.has(last.id)) {
        await this.learnAlbum(client, last);
      }
      const now = this.now();
      return {
        count_24h: photos.filter((photo) => photo.addedAt !== null && now - photo.addedAt <= DAY_MS)
          .length,
        total: album ? album.photos : (this.snapshot.photos ?? photos.length),
        name: last?.name ?? '',
        album: album?.name ?? (last && this.albumName(last)) ?? '',
        added_at: stamp(last?.addedAt ?? null),
        url: last
          ? client.pageUrl(album?.id ?? this.photoAlbum.get(last.id)?.id ?? RECENT, last.id)
          : '',
      };
    } catch (err) {
      throw this.actionError(err);
    }
  }

  /** The followed album of a device external id, null for the gallery or another one. */
  followedAlbum(externalId) {
    return (
      this.followed.find((album) => albumIds(this.gladys, album.id).device === externalId) ?? null
    );
  }

  /** The last photos of a followed album, for the widget (read at each reading). */
  albumRecent(album) {
    return this.albumPhotos.get(album.id) ?? [];
  }

  /** The thumbnail URL of a photo the widget shows, null for any other photo. */
  thumbUrlOf(id) {
    const lists = [
      this.recent,
      ...[...this.albumPhotos.values()].map((photos) => photos.slice(0, this.timings.shownCount)),
    ];
    for (const list of lists) {
      const photo = list.find((item) => item.id === id);
      if (photo) {
        return photo.thumbUrl;
      }
    }
    return null;
  }

  /** "Test the connection": read the gallery now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        text.ok(this.status.username),
        text.gallery(this.snapshot.photos, this.snapshot.albums),
        ...(this.config.albums.length > 0 ? [text.followed(this.followed.length)] : []),
        ...(this.missing.length > 0 ? [text.missing(this.missing.join(', '))] : []),
      ]
        .join(', ')
        .slice(0, 500),
    );
  }
}
