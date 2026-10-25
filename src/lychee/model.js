// -----------------------------------------------------------------------------
// Parsing of the Lychee answers into the few values the integration uses.
// Tolerant: a missing or odd field gives a neutral value, never an exception
// (test/fixtures/lychee/ holds the real answers of Lychee 7.12).
// -----------------------------------------------------------------------------

import { ID } from './client.js';

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
};

const countOrNull = (value) =>
  value === undefined || value === null || !Number.isFinite(Number(value)) ? null : count(value);

/** A title of Lychee, trimmed (plain text, no markup). */
export const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Milliseconds of a Lychee date: ISO 8601 with its offset
 * ("2026-10-25T16:05:29+00:00"), a real instant. Null for none.
 */
export function timeOf(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.UTC(1900, 0, 1) ? time : null;
}

/** Auth::user: who Lychee sees. */
export function parseUser(user) {
  return {
    id: user?.id === undefined || user?.id === null ? null : String(user.id),
    username: text(user?.username),
    admin: user?.may_administrate === true,
  };
}

/** Admin/Stats: the figures of the whole gallery (null when unknown). */
export function parseStats(stats) {
  return {
    photos: countOrNull(stats?.photos_count),
    albums: countOrNull(stats?.albums_count),
    users: countOrNull(stats?.users_count),
  };
}

/**
 * An album of a list (Albums, Album::albums), below `parent` (null: at the
 * root). Smart, tag and person albums are not albums of the tree: null.
 */
export function parseAlbum(raw, parent = null) {
  if (!raw || typeof raw.id !== 'string' || !ID.test(raw.id)) {
    return null;
  }
  if (raw.is_tag_album === true || raw.is_person_album === true) {
    return null;
  }
  const name = text(raw.title) || raw.id;
  return {
    id: raw.id,
    name,
    path: parent ? `${parent.path} / ${name}` : name,
    // The photos of the album itself, as Lychee shows them (not its sub-albums).
    photos: count(raw.num_photos),
    children: raw.has_subalbum === true || count(raw.num_subalbums) > 0,
  };
}

/** Albums: every album at the root (own, pinned, shared), each once. */
export function rootEntries(result) {
  const lists = ['albums', 'pinned_albums', 'shared_albums'].map((key) =>
    Array.isArray(result?.[key]) ? result[key] : [],
  );
  const seen = new Set();
  return lists.flat().filter((raw) => {
    if (!raw || seen.has(raw.id)) {
      return false;
    }
    seen.add(raw.id);
    return true;
  });
}

/** One page of a paginated answer: `{ items, lastPage, total }`. */
export function pageOf(result, key) {
  const items = Array.isArray(result?.[key]) ? result[key] : [];
  return {
    items,
    lastPage: Math.max(1, count(result?.last_page ?? 1)),
    total: countOrNull(result?.total),
  };
}

/** A photo of Album::photos. */
export function parsePhoto(raw) {
  if (!raw || typeof raw.id !== 'string' || !ID.test(raw.id)) {
    return null;
  }
  const variants = raw.size_variants ?? {};
  return {
    id: raw.id,
    name: text(raw.title) || raw.id,
    addedAt: timeOf(raw.created_at),
    takenAt: timeOf(raw.taken_at),
    // 200 px square: a list row of the widget shows it under 64 px.
    thumbUrl: variants.thumb?.url ?? variants.thumb2x?.url ?? variants.small?.url ?? null,
  };
}

/** Photos, the newest addition first (Lychee sorts them by the album setting). */
export const byAddition = (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || (a.id < b.id ? 1 : -1);

/** "2026-10-25 18:05": a date in the time zone of the container (TZ of Gladys). */
export function stamp(time) {
  if (time === null || time === undefined) {
    return '';
  }
  const d = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
