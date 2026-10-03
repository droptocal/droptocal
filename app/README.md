# DropToCal, as an app

The native shell around DropToCal. It holds no copy of the app: `npm run web`
builds the real thing from [`../web`](../web) and ships the result inside an
Android and an iOS project.

That is the whole design. There is one implementation of the camera, the
extraction, the editing and the calendar file, and it is the web one — this
folder exists for the three things a browser cannot do.

It was called CalDrop until October 2026. Its package ID became
`org.droptocal.app` before the first release, the last moment a new one cost
nothing (to Android and to Play a new ID is a new app, which an installed one
cannot update to). The names nobody sees stay as they were, because changing
them costs more than it says: the signing key's alias and folder, and the
encrypted store on the phone.

## What the shell adds

- **The bundle is on the device.** A poster can be read on a train with no
  signal up to the point where the model has to answer. No page load, no
  address bar eating the top of the viewfinder.
- **A launcher icon and the share sheet**, so DropToCal is somewhere to send a
  photo from, rather than a URL to remember.
- **The calendar handover Android forbids on the web.** A web page cannot
  launch `ACTION_INSERT`: Chromium adds `CATEGORY_BROWSABLE` to every intent a
  page fires, and a calendar's insert filter does not declare it, so the
  intent matches nothing and a browser can only hand over an `.ics` file. An
  app has no such restriction, and `CalendarInsertPlugin` uses it: whichever
  calendar this person keeps opens with the event filled in, repeat rule and
  all. This is the reason the repository is worth having.
- **Requests that no origin has to allow.** Capacitor registers its own HTTP
  plugin on every native build, and it goes through the platform's stack
  rather than the WebView's, so nothing here is subject to CORS. The web app
  uses it for the one thing a browser needs a service for — fetching an
  event page — so in the app links are read on the phone, by nobody else.
  The same absence of a preflight is why an API that refuses
  browsers, which most hosted ones do, can be used directly from the app.

  Left as a plugin call rather than switched on. Capacitor offers to patch
  `window.fetch` so that every request takes this route, which would quietly
  break the extraction: it reads the model's answer as it arrives, and the
  native path returns the body whole. `plugins.CapacitorHttp.enabled` stays
  off for that reason.

## Everything the phone can hand over

The app is registered for the ways Android offers to send something somewhere:

| From | Intent | Arrives as |
| --- | --- | --- |
| Share sheet: a link, a chat message | `SEND` `text/plain` | text — a link is fetched, anything else is read as a poster |
| Share sheet: a photo, a PDF | `SEND` `image/*`, `application/pdf` | bytes |
| Share sheet: several photos | `SEND_MULTIPLE` | bytes |
| A file manager's "open with" | `VIEW` on `content:`/`file:` | bytes |
| The menu over selected text | `PROCESS_TEXT` | text, without a share sheet in between |

`ShareTargetPlugin` reads the intent and hands it to the page as text or as
base64 — base64 rather than a path, because the WebView has nothing to do
with the filesystem and the read grant on a `content://` URI belongs to the
app. Anything over 12MB is dropped: an API refuses a body past that,
and a photo is downscaled long before it.

There are two moments and both are covered. An intent that *started* the app
is waiting when the page loads, and `consume()` hands it over once — a reload
does not read the same poster again. An intent arriving while the app is
already open is announced as a `shared` event, which is the second poster in
a row.

## The clipboard plugin

`ClipboardReadPlugin` registers as `ClipboardRead`. In a browser, Paste asks
once and then reads `navigator.clipboard`; a WebView has no such prompt and
refuses the read outright, so inside the app that button found nothing every
time. An app may read its own clipboard while it is in front, which is
exactly when the button is pressed.

Only on request, never to preview: every native read shows Android's "pasted
from your clipboard" notice, and a preview that announces itself is worse
than no preview.

## The calendar plugin

`android/app/src/main/java/org/droptocal/app/CalendarInsertPlugin.java`
registers as `CalendarInsert` and answers two calls:

| Call | Answers |
| --- | --- |
| `available()` | whether any app on this phone answers an event insert |
| `insert(event)` | opens it, `{ opened: false }` if nothing did |

The page asks the first before offering the button, so a phone with no
calendar is never shown a door to nowhere — which is why the manifest's
`<queries>` element matters: from Android 11 a package that has not been
asked about is invisible, and the answer would be "nobody" on a phone full of
calendars.

The event's instants are computed in the web app, not here, because that is
where the venue's timezone is known: a poster read abroad still says 20:00
where the event is. All-day events arrive at midnight UTC, which is what
`CalendarContract` expects.

Nothing in the plugin names a vendor. Asking for *an event* rather than for
*something that opens .ics files* is what makes the phone offer the calendar
the person actually uses — the whole lesson of the ICSx5 detour in the web
app's history.

## Build it

```bash
npm install
npm run web      # builds ../web into www/
npx cap sync     # copies www/ into both native projects
```

Nothing about the API is built in. Whoever installs it enters an
OpenAI-compatible API, its key and a model in Settings, and the key stays on
the device, encrypted.

### Android

GitHub's build is the one the phone runs. Every push to `main` that changes
`web/` or `app/` builds the APK and stamps it with the commit.

```bash
npm run install:latest   # GitHub's newest APK onto the connected phone
npm run apk              # build here and install, to try a change before pushing
npm run android          # builds, syncs, opens Android Studio
```

Both are signed with the same release key, so either installs over the other
and the app keeps its data (the API key among it). The key lives outside
the repository, in `~/.caldrop-signing/` (`release.jks` and a
`signing.properties` naming it and its password), and in the repository's
secrets `CALDROP_KEYSTORE_BASE64` and `CALDROP_KEYSTORE_PASSWORD` for GitHub.
**Keep a backup of that folder**: an app signed with a lost key can only be
replaced by uninstalling it, and it is the key to register as the app signing
key if DropToCal goes on Google Play. A machine without it builds with its own
debug key, which works but will not install over GitHub's.

Without a machine to build on, run the **Build Android APK** workflow in
Actions and download the APK from the run's artifacts.

### Releases

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The tag runs the **Release** workflow: the web app — whoever installs it
brings their own API, as with every build —
then `droptocal-1.0.0.apk` signed with the release key, for installing directly,
and `droptocal-1.0.0-play.aab` signed with the **upload key**, for Google Play.
Both are attached to a GitHub Release of the same name.

The upload key is the second keystore in `~/.caldrop-signing/` (`upload.jks`,
`upload.properties`; secrets `CALDROP_UPLOAD_KEYSTORE_BASE64` and
`_PASSWORD`). Play accepts uploads signed with it and re-signs what it
distributes with the app signing key, which is the release key, registered
with Play once (Play Console → App integrity → use your own key, via PEPK).
That keeps a Play install and a direct install interchangeable. The
certificates Play asks for are `caldrop-release-certificate.pem` and
`caldrop-upload-certificate.pem` in the same folder.

Version codes are minutes since 2026-01-01, so every build, from either
workflow, is newer than the one before it.

### iOS

```bash
npm run ios       # builds, syncs, opens Xcode
```

Needs macOS and Xcode; everything before that step works anywhere. Signing and
a developer account are yours to set up.

## Permissions

| Where | What | Why |
| --- | --- | --- |
| `AndroidManifest.xml` | `CAMERA` | the viewfinder is the first screen |
| `AndroidManifest.xml` | `<queries>` for `ACTION_INSERT` | to find the calendar apps |
| `Info.plist` | `NSCameraUsageDescription` | same, in Apple's words |
| `Info.plist` | `NSPhotoLibraryUsageDescription` | choosing a poster already on the phone |

The camera is declared `required="false"`, so a device without one can still
install the app and read a link, a file or the clipboard.

## What is committed and what is not

Both native projects are committed, because they carry configuration that is
edited by hand — the manifest above, the usage descriptions, the app name.
`www/` is not: it is built, and building it is one command.

## Testing on a phone

```bash
npm run test:phone            # every case
npm run test:phone -- share   # only the cases whose name contains "share"
```

Runs every way into the app on a phone plugged in over USB — typed text, a
share from another app, the selection menu, an image, a PDF opened with the
app, "Add a page", the list controls — and checks the dates, times and places
that come out. It needs a debug build installed with an API set up in Settings,
and `rsvg-convert` (`brew install librsvg`) to draw its test posters. It puts
its files on the phone, removes them afterwards, and never opens a calendar
or a browser, so a run leaves nothing behind.

One way in is checked by hand: **several photos shared at once** (a gallery's
Share with two or more selected). Android's shell can send one file but not a
list of them, on any version, so no script can. Select two posters in the
gallery, share them to DropToCal, and both should be read together.
