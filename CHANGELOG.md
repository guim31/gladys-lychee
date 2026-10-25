# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version of the Lychee integration: a **Lychee** device for the whole
  gallery (photos, albums, users for an administrator, last photo added), read
  by the container every 1, 5 or 15 minutes, with an API token or an account
  (the session and its CSRF token handled by the integration).
- One device per followed album (by name, path or id): its photos and the date
  of its last addition.
- Scene triggers **New photos added** (count, name, album, date, page of the
  last one) and **Photos added to an album** (filter on the album name),
  announced once, also across restarts.
- Scene action **Read the last photos**: photos added in 24 hours, total, the
  last one, of the gallery or of an album.
- **Last photos** widget: counters and the last photos of the gallery or of a
  followed album, with opt-in thumbnails served through Gladys.
- Texts, feature names and documentation in English, French, German and
  Spanish.
