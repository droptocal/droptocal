# Plan: from calendar import to capture and routing

Status: proposal, October 2026. Nothing here is built yet.

## Goal

DropToCal reads events out of reality and puts them in a calendar. The next
step: read **events, tasks, contacts and notes** out of the same inputs, and
put each where the person keeps that kind of thing.

The core is open:

- items are kept in open formats: iCalendar for events and tasks, vCard for
  contacts, Markdown for notes;
- the open destinations come first: the phone's own calendar store, CalDAV
  and CardDAV, and a folder of Markdown files.

Proprietary services are opt-in connectors, the same way AI providers are
today: Microsoft, Google Tasks, Todoist.

## Scope

- **In:** extracting several kinds of item from one input; deriving tasks
  from an event on request ("plan the preparation"); writing items to
  destinations.
- **Out, decided separately later:** reading from destinations, an assistant
  over your own data ("what is coming up this week?"), any background or
  automatic behaviour. Writing only means fewer permissions, no Google
  restricted scopes, and nothing that runs unasked.

## Principles

1. **Capture stays one tap.** A destination is chosen once per kind of item,
   then the main button sends there. The ▾ menu holds the alternatives.
2. **Every connector is optional.** With none set up, the app does what it
   does today: calendar handover, `.ics` file, share sheet.
3. **The F-Droid build has no proprietary code.** Sign-in uses the system
   browser through Custom Tabs (`androidx.browser`, open source), never
   Google's sign-in SDK.
4. **The phone talks to the services itself.** No DropToCal server sits in
   between, and tokens are kept like API keys today (`SecureStore`).

## Corrections to the earlier discussion

- **Proton:** Proton Bridge serves mail only (IMAP and SMTP). Proton
  Calendar has no CalDAV access, so it is reachable only through the `.ics`
  file.
- **iCloud:** CalDAV works for events, with an app-specific password. Apple
  Reminders stopped being reachable through CalDAV when they were upgraded,
  so iCloud cannot receive tasks.
- **Google Keep:** its API is for business (Workspace) accounts only. Notes
  for Google users go through the share sheet.

---

## Phase 0 — Foundations (no visible change) · v1.3

**0.1 One item model.** In `web/src/lib/types.ts`:

```ts
type Kind = 'event' | 'task' | 'contact' | 'note';
interface Base { id: string; kind: Kind; title: string; sourceText: string; confidence: number; notes: string }
interface EventItem extends Base { kind: 'event'; /* today's EventDraft fields */ }
interface TaskItem extends Base { kind: 'task'; due: string; dueTime: string; description: string; relatedTo?: string /* event id */ }
interface ContactItem extends Base { kind: 'contact'; name: string; org: string; phones: string[]; emails: string[]; address: string; url: string }
interface NoteItem extends Base { kind: 'note'; body: string /* Markdown */ }
type Item = EventItem | TaskItem | ContactItem | NoteItem;
```

`EventDraft` stays as an alias of `EventItem`, so existing code keeps
compiling while it moves over.

**0.2 Formats, one module each, each with tests:**

- `ics.ts`: add VTODO (`DUE`, `RELATED-TO`, `STATUS:NEEDS-ACTION`) next to
  VEVENT.
- `vcard.ts`: vCard 4.0, with 3.0 written for CardDAV servers that want it.
- `markdown.ts`: a note as front matter (`source`, `created`) plus the body.

**0.3 Destinations.** New folder `web/src/lib/destinations/`:

```ts
interface Destination {
  id: string;                      // 'android-calendar', 'caldav:<account>', 'graph', …
  name: string;
  kinds: Kind[];
  where: 'app' | 'web' | 'both';   // browsers cannot reach CalDAV servers (no CORS)
  ready(): Promise<boolean>;       // permission granted, signed in, …
  send(items: Item[]): Promise<{ sent: number; undo?: () => Promise<void>; message: string }>;
}
```

- **Registry:** a list of destinations, filtered by `where` and `ready()`.
- **Built in, always present:** the current handovers become destinations
  too: calendar app (insert screen), `.ics` file, Google and Outlook links,
  and a new share-sheet destination (any kind of item, sent as text).

**0.4 Settings, shape 3.**

- New field `routes: Partial<Record<Kind, string>>`: a destination id per
  kind of item.
- Accounts: `accounts: { id, type, label, server?, user? }[]` in plain
  storage; their secrets (passwords, tokens) in `SecureStore` under
  `account:<id>`.
- `SECRETS` in `settings.ts` becomes dynamic. The upgrade from shape 2 keeps
  everything and adds empty `routes`.

**0.5 Interface.**

- `Destinations` in `EventRow.tsx` becomes `SendButton`, the same split
  button but chosen per kind of item: the main button goes to
  `routes[kind]`, falling back to today's behaviour.
- Cards per kind: `EventRow` keeps the editor. Task, contact and note cards
  get small editors.
- Settings gets a section, **Where things go**: per kind, a list of ready
  destinations, plus "Add account…".

**0.6 Lead-time work, started now:**

- **Google OAuth spike:** confirm which kind of Google OAuth client works
  without Play services (see the Phase 4 risk).
- **Google verification:** start the paperwork (privacy policy changes,
  homepage, domain proof, demo video).
- **Microsoft:** register the app in Entra, free.

**Done when:** all existing tests pass; new tests for VTODO, vCard and
Markdown; the app behaves exactly as v1.2.

## Phase 1 — Straight into the phone's calendar, and contacts · v1.3

**1.1 `CalendarStorePlugin.java`.** Asks for `READ_CALENDAR` and
`WRITE_CALENDAR` at runtime, using Capacitor's permission API.

- `calendars()`: lists the writable calendars (access level CONTRIBUTOR or
  above) with name, account and colour.
- `insert(event, calendarId)`: writes to `CalendarContract.Events` and
  returns the new event's id.
  - **A repeating event must have `DURATION`, not `DTEND`**, or Android
    rejects it.
  - The time zone is the event's zone, or the phone's for a floating time.
    An all-day event uses UTC midnight with `EVENT_TIMEZONE=UTC`.
  - A reminder goes in `CalendarContract.Reminders`, by default the
    calendar's own default.
- `delete(id)`: for **Undo** on the "Added to Work · Undo" message.

**1.2 Destination `android-calendar`.**

- It becomes the default for events once permission is granted. Settings
  remembers the chosen calendar.
- If permission is refused, the app falls back to today's insert screen.
- This removes the Samsung repeat-rule problem: the rule is written as data.

**1.3 Contacts.** `ContactsContract.Intents.Insert` opens the phone's own
"new contact" screen, filled in. No permission is needed. Contact
extraction is switched on in the prompt.

**1.4 Extraction of all kinds.**

- `SYSTEM_PROMPT` and `JSON_SHAPE` in `ai.ts` return `items[]`, each with a
  `kind`. `events[]` is still accepted from older models and servers.
- `toDraft` becomes a set of converters, one per kind.
- A setting **What to look for** (events only / everything), defaulting to
  everything. It doesn't add calls to the free API, but it does add output
  tokens.

**Done when:**

- The phone test (`app/scripts/phone-test.mjs`) inserts into a test
  calendar, checks the event through `CalendarContract`, then deletes it.
- A repeating event appears with its repeat rule on a Samsung phone and a
  Pixel.

## Phase 2 — Tasks, CalDAV and CardDAV · v1.4

**2.1 Preparation on request.**

- A **Plan preparation** button on an event card makes one model call with
  the event as input and returns `TaskItem[]` with due dates relative to
  the event and `relatedTo` set to it.
- It is never automatic. It costs one free-API read.

**2.2 DAV client** (`web/src/lib/dav/`):

- Discovery: `/.well-known/caldav` (and `/carddav`), then
  `current-user-principal`, then `calendar-home-set` (or
  `addressbook-home-set`), then a `PROPFIND` listing collections with their
  `supported-calendar-component-set` (VEVENT and/or VTODO).
- Writing: `PUT <collection>/<uid>.ics` (`.vcf`) with `If-None-Match: *`.
  Undo is `DELETE` with the ETag.
- Sign-in: basic auth with an app password.
- Transport: through the phone's own HTTP (`nativeFetch`), so app only.
  On the web: "use the app, or a server that allows this site", meaning
  CORS.
- Presets: Nextcloud (`https://host/remote.php/dav`), Fastmail,
  mailbox.org, Posteo, iCloud (`https://caldav.icloud.com`, events only),
  and Other.

**2.3 Destinations.** `caldav:<account>` takes events and tasks, per
collection. `carddav:<account>` takes contacts.

**2.4 Tasks with no account.**

- If an open task app is installed (OpenTasks, or Tasks.org through its
  provider), write there directly.
- Otherwise use the share sheet, as text: "Title — due Friday".
- The `.ics` file with VTODO stays in the menu for people who import files.

**Done when:**

- Tests against recorded `PROPFIND` replies from Nextcloud, Fastmail and
  iCloud.
- CI runs a real CalDAV server (Radicale, `pip install radicale`), writes an
  event, a task and a contact, and reads them back.

## Phase 3 — Microsoft (Outlook calendar, To Do, OneNote) · v1.5

**3.1 Sign-in, shared by every service.**

- `oauth.ts` (PKCE, token refresh) plus `OAuthPlugin.java`, which opens a
  Custom Tab and catches the redirect through an intent filter on
  `org.droptocal.app:/oauth`.
- On the web the redirect goes to `https://droptocal.org/oauth.html`.

**3.2 Microsoft Graph.**

- Tenant `common`, so personal and work accounts both work.
- Scopes: `Calendars.ReadWrite`, `Tasks.ReadWrite`, `Notes.Create`,
  `offline_access`.

| Item | Request |
|---|---|
| event | `POST /me/events` (repeat rule as Graph's `recurrence` object, converted from the iCalendar rule) |
| task | `POST /me/todo/lists/{id}/tasks` |
| note | `POST /me/onenote/pages` (Markdown converted to simple HTML) |

Microsoft allows browser calls, so this works on the website too. Work
accounts may need an admin's consent; the message says so.

## Phase 4 — Google Tasks, and Google Calendar on the web · v1.6

- **Scopes:** `tasks` and `calendar.events`, both "sensitive": Google
  verifies the app, but there is no paid security assessment. On Android,
  events already reach Google Calendar through Phase 1, so the API is used
  for tasks there.
- **Requests:** `POST tasks/v1/lists/{id}/tasks`. Google Tasks keeps only
  the due **date**, not a time; the card says so.
- **Biggest risk:** Google discourages custom-scheme redirects for Android
  clients and steers apps to Play-services sign-in, which F-Droid cannot
  accept. The Phase 0 spike decides between:
  - (a) an Android client with the custom scheme allowed;
  - (b) a web client with an https redirect to `droptocal.org`, caught by
    an Android App Link. It may need the client secret in the app, which
    Google tolerates for installed apps;
  - (c) Google only in the `full` build, F-Droid without it.

  If none works within the spike, Google Tasks is left out and its users
  get the share sheet.
- **Verification:** until it passes, the app runs in "testing" mode with
  100 users, and Settings marks Google as preview.

## Phase 5 — Todoist and Markdown notes · v1.7

- **Todoist:** a personal API token pasted in Settings, so no OAuth app is
  needed. Tasks go to the current REST endpoint; check whether that is
  `api/v1` or `rest/v2` at build time.
- **Notes folder:**
  - Android's folder picker (`ACTION_OPEN_DOCUMENT_TREE`, permission kept)
    writes `2026-10-15 Title.md`.
  - That folder can be Obsidian's, Syncthing's or a Nextcloud-synced one.
  - On the web: Chrome's File System Access API where it exists, otherwise
    a download.
- **Notion:** only if asked for. It needs a token and a database id.

---

## Cross-cutting work

| Area | Work |
|---|---|
| Privacy policy and Play data safety | Each destination receives what is sent to it, at the person's request; tokens stay on the phone; calendar permission is used to write only. Update `web/public/privacy.html` and `app/store/listing.md` in Phase 1. |
| Permissions | Calendar (Phase 1, runtime). Nothing for contacts (intent) or notes (folder picker). No `QUERY_ALL_PACKAGES`: add `<queries>` entries for the task providers. |
| F-Droid | No new proprietary libraries. NonFreeNet stays. The foss build is checked by the release workflow, which already fails if Google code appears. |
| Free API | Extracting everything grows each answer by about 20–40% in output tokens. Preparation is one extra read. Watch the neuron logs after 1.3; raise `MAX_OUTPUT_TOKENS` only if answers get cut off. |
| Tests | Unit tests per format and per destination with recorded replies; Radicale in CI; phone-test cases for calendar insert and undo. |
| Name | "DropToCal" is still right for 1.3. Decide before 1.4, when tasks become a headline feature. A new Play listing means a new package ID, so rename the listing, not the package. |

## Order and rough effort (one person with AI help)

| Version | Contents | Days |
|---|---|---|
| 1.3 | Phase 0 and Phase 1 | 7–10 |
| 1.4 | Phase 2 | 6–8 |
| 1.5 | Phase 3 | 4–5 |
| 1.6 | Phase 4 | 4–6, plus Google's verification, which takes weeks |
| 1.7 | Phase 5 | 3–4 |

Each version ships on its own and is useful without the next.

## Decisions needed

1. **Extraction default:** everything (recommended) or events only, with
   everything opt-in.
2. **Web scope:** connectors in the app only at first (recommended), with
   Microsoft and Google added to the website in their own phases.
3. **Google without Play services:** decided by the Phase 0 spike; option
   (c) is the fallback.
4. **Name:** decide before 1.4.
