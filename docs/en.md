# Lychee

Bring your [Lychee](https://lycheeorg.dev) photo gallery into Gladys,
over your local network: the number of photos, albums and users, the last
photo added, one device per album you want to follow, scenes that react when
new photos arrive or an album grows, a scene action that reads the last
photos, and a dashboard widget with the last photos.

The integration was tested against a real Lychee gallery (the
`lycheeorg/lychee` Docker image, Lychee 7.12, with MariaDB), not yet in a real
Gladys installation: feedback is welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-lychee/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Lychee** gallery (version 6 or later, with the `/api/v2` API) reachable
  from Gladys (same network).
- An account that is an **administrator**, or that is **allowed to upload**:
  Lychee shows the "Recent" album, where the integration finds the new photos,
  to those accounts only. An administrator also gives the number of users and
  the exact totals of the gallery.
- Best: an **API token** of this account: in Lychee, open your **profile**,
  then **API token**, create one and copy it (Lychee shows it once).
- Otherwise, the user name and password of the account.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Gallery URL** with its port and folder
   (for example `http://192.168.1.20:8000`; the official Docker image listens on
   port 8000, and a page of the gallery copied from the browser works too) and
   paste the **API token** in the password field, with the user name empty.
   With an account, fill in its user name and password instead.
3. Optionally, list the **Albums to follow**: names or ids separated by commas
   (`Holidays`); a sub-album by its path (`Holidays / Beach`). The id is the
   24 characters at the end of the album address (`/gallery/<id>`); use it for
   a name holding a comma.
4. Choose the **Refresh** (5 minutes by default) and the **Language of the
   names**, then save. **Test the connection** reads the gallery at once and
   tells the albums it did not find.
5. In **Discovery**, add the **Lychee** device and the album devices you want.

## Devices

The **Lychee** device shows the whole gallery (read-only):

| Feature          | What it shows                                                         |
| ---------------- | --------------------------------------------------------------------- |
| Photos           | Photos of the gallery (administrator), or of the albums you can see   |
| Albums           | Albums of the gallery (administrator), or the ones you can see        |
| Users            | Users of the gallery (administrator account only)                     |
| Last photo added | Its name, its album when known and the day: `Sunset · Beach · 25 Oct` |

Each followed album gives a device **Lychee – album path**:

| Feature       | What it shows                                                 |
| ------------- | ------------------------------------------------------------- |
| Photos        | Photos of the album itself, as Lychee counts them             |
| Last addition | Day and time of the last photo uploaded: `25 Oct 2026, 17:07` |

The integration reads the gallery itself (a few small requests per reading,
one more per album that has sub-albums and per followed album): nothing to set
on the Gladys side. The connection badge of the devices turns red when the
gallery stops answering.

## Dashboard

The **Last photos** widget shows the counters (photos, albums, users) and the
last photos uploaded: name, album when known, day; a tap shows the time it was
uploaded and the day it was taken. With the **Followed album** setting, it
shows one of your followed albums instead of the whole gallery.

Thumbnails are **off by default**: with the **Show thumbnails** setting, the
small square thumbnail of each photo is shown, which means your photos appear
on every screen that displays this dashboard (a shared tablet, a public
dashboard, Gladys Plus). The browser never loads Lychee directly: Gladys asks
the integration, which only serves the photos the widget lists.

## Scenes

### Triggers

- **New photos added**: photos were uploaded to the gallery, whatever the way
  (web upload, import, synchronization), seen at the next reading. Variables:
  number of photos added, name, album (empty for an unsorted photo), date added
  and page of the last one.
- **Photos added to an album**: an album holds more photos than at the
  previous reading (its sub-albums apart; a new album counts from zero).
  Filter: the album name, exactly as in Lychee, without its parent albums.
  Variables: album name, path and id, photos added, photos in the album, page
  of the album.

### Actions

- **Read the last photos**: reads the last photos uploaded now, to the whole
  gallery (the "Recent" album of Lychee) or to one album (name, path or id).
  Outputs for the next actions of the scene: photos added in 24 hours, photos
  in all, name, album, date added and page of the last one. Nothing changes in
  Lychee.

### Scene ideas

- On **New photos added**, send the family a message: "{{count}} new photos,
  the last one: {{name}} in {{album}}".
- Every evening at 9 p.m., **Read the last photos** of the album "Family", and
  when **Photos added in 24 hours** is above 0, show a message on the living
  room tablet.
- On **Photos added to an album** "Holidays 2026", light the hallway in blue.

## Troubleshooting

- **"API token, user name or password refused"**: the token was reset or not
  pasted whole; with an account, check the user name and the password.
- **"this account may not read the "Recent" album"**: give the account the
  right to upload in the user management of Lychee, or use an administrator.
  The "Recent" album must not be disabled in the settings of Lychee.
- **"too many login attempts"**: Lychee accepts 10 logins an hour. Check the
  password, or prefer an API token, which needs no login.
- **"the gallery does not answer"**: check the address and the port from the
  Gladys machine.
- **"no Lychee gallery at this address"**: the address leads to another page
  (a login page of a reverse proxy, another application): enter the address of
  the gallery itself.
- **"certificate refused"**: a self-signed certificate; use the `http://`
  address on your network.
- **New photos do not show**: the "Recent" album only holds the photos of the
  last days (setting "recent_age" of Lychee, 1 day by default); photos imported
  with an older upload date are not announced.
- **The number of users stays empty**: the account is not an administrator.
- `LOG_LEVEL=debug` in the logs of the integration shows each reading.

## Limits

- New photos are seen at the next reading (5 minutes by default), and only the
  photos the account can see.
- The count of an album does not include its sub-albums: Lychee counts each
  album on its own. The tree is read up to 300 albums.
- The integration only reads: it never changes, uploads or deletes anything
  in Lychee.
- No photo leaves your network through the integration unless you turn on the
  thumbnails of the widget.
- Dates are shown in the time zone of Gladys.
- Not affiliated with the Lychee project.
