# Lychee for Gladys Assistant

External integration connecting a [Lychee](https://lycheeorg.dev) gallery
(self-hosted photo gallery) to
[Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface          | What you get                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Gallery device   | Photos, albums, users (administrator account), last photo added (name, album, day)                                   |
| Album devices    | One per followed album: photos (the album itself, as Lychee counts them), date of the last addition                  |
| Scene triggers   | `photos_added` (any upload), `album_photos_added` (filter: album name)                                               |
| Scene action     | `get_latest_photos`: reads the last photos of the gallery or of an album; outputs the count of 24 hours and the last |
| Dashboard widget | `latest_photos`: counters and the last photos, of the gallery or of a followed album; thumbnails only on demand      |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Lychee gallery (version 6 or later, `/api/v2`) on the local network.
- An account that is an administrator or allowed to upload (Lychee shows the
  "Recent" album to those accounts only), with an **API token** (profile → API
  token), or its user name and password.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-lychee` (or
   install **Lychee** from the catalog once it is listed).
2. In **Configuration**, enter the address of your gallery
   (`http://192.168.1.20:8000`) and the API token, and optionally the albums to
   follow (names, paths or ids). Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Lychee** device and the album
   devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Lychee API v2 (`/api/v2`, JSON) only, with the API token in the
  `Authorization: Bearer` header, or a session opened with `Auth::login` after
  reading the CSRF cookie of a web page, kept, and opened again when Lychee
  forgets it (Lychee allows 10 logins an hour).
- One reading every 1, 5 (default) or 15 minutes, on a timer of the container
  (`should_poll: false`): `Auth::user`, `Admin/Stats` (administrators only),
  `Albums` then `Album::albums` for the albums with sub-albums, the "Recent"
  smart album (`Album::photos?album_id=recent`, every page), and the photos of
  each followed album.
- Lychee photo ids are random: new photos are announced from the last upload
  date seen (with the ids seen in that second), album growth from the photo
  count of each album, both kept in `/data`: once, also across restarts.
- The widget thumbnails (the 200 px square `thumb` size, opt-in) are read on
  the configured address and go through the widget image proxy of Gladys, for
  the photos the widget lists only.
- Quiet logs: the lifecycle and the errors at info, once; photo names only at
  debug.

## Checked against a real gallery

The client, the parsers and the scenarios were checked against **Lychee 7.12**
(the `lycheeorg/lychee` image with MariaDB 11): albums and a sub-album, photos
uploaded through the API, an API token, an administrator session and a normal
account (refused the "Recent" album), refused tokens and passwords, the login
throttle. The answers in `test/fixtures/lychee/` are real (addresses
anonymized), and the integration ran against that gallery through the fake
Gladys of the SDK, then in its locked-down container. It has not yet run in a
real Gladys installation: feedback welcome.

## Limitations

- Polling, not push: new photos reach Gladys at the next reading.
- The account must be an administrator or allowed to upload, and the "Recent"
  album enabled (it holds the uploads of the last day by default).
- The count of an album does not include its sub-albums; the album tree is read
  up to 300 albums.
- One gallery per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake Lychee gallery built from real answers
(`test/fixtures/lychee/`) and the fake Gladys of the SDK; they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Lychee](https://github.com/LycheeOrg/Lychee) (MIT) by Tobias Reich, the
  LycheeOrg team and contributors. No code was copied from it.
- The cover shows the Lychee logo, taken from the official repository
  (`resources/img/logo4.svg`), on a dark background.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js), after
  [gladys-piwigo](https://github.com/guim31/gladys-piwigo).

## Disclaimer

Not affiliated with, nor endorsed by, the Lychee project.

## License

[Apache-2.0](LICENSE)
