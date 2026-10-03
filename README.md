# DropToCal

Anything with a date in, calendar out. Point the camera at a poster, or share
a PDF, a link or some text, and the events in it go into your calendar — read
by an AI provider of your choice, with your own key. Nothing is stored.

It runs at **[droptocal.org](https://droptocal.org)** and as an Android app.

| Folder | What it is |
| --- | --- |
| [`web/`](web) | The app itself: camera, reading, editing, the calendar file. A static web app, published to droptocal.org. Also the two small Cloudflare Workers that help a browser: `relay/` (an API that refuses browsers, made callable) and `fetcher/` (reads a link). |
| [`app/`](app) | The Android shell around `web/`, for what a browser cannot do: the share sheet, the selection menu, handing an event to the calendar app, calling any API directly. |
| [`.github/workflows/`](.github/workflows) | The website on every change to `web/`, an APK on every change to either, and a release (APK and Play bundle) for every `v*` tag. |

Privacy: [droptocal.org/privacy](https://droptocal.org/privacy). Contact:
hello@droptocal.org.
