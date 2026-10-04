# Google Play listing — DropToCal 1.0 (English)

Everything Play Console asks for, in the order it asks. Limits are Play's.

## Main store listing

**App name** (30 max, this is 29)

```
DropToCal: AI Calendar Import
```

Not only posters: PDFs, links and text too. ("AI Calendar Importer" would be 31.)

**Short description** (80 max, this is 73)

```
Snap a poster, share a PDF or a link, and get the event in your calendar.
```

**Full description** (4000 max)

```
DropToCal turns what you see into calendar events. Point the camera at a poster, share a flyer, a PDF, a web page or a chat message to it — and the dates, times and places are read for you and handed to your own calendar app, ready to save.

WHAT IT READS
• Posters and flyers, straight from the camera — several pages in a row if the programme spans more than one
• Photos and screenshots you already have
• PDFs: programmes, schedules, rehearsal plans
• Links to event pages, and text shared from any app or selected on screen
• Whatever is on the clipboard

WHAT YOU GET
• Every event on the page, not just the first: a festival programme becomes a list you can tick through
• Repeating events understood: "every Tuesday", "first Friday of the month", "until 19 December"
• The words each date was read from, shown beside it, so checking takes a glance
• Times as printed — 20:00 on the poster is 20:00 in your calendar
• One tap to your calendar app, with title, time, place and repeat filled in. Also as a calendar file, or for Google Calendar and Outlook

FREE, NOTHING TO SET UP
Install it and point the camera: DropToCal reads with a free AI model, about 20 reads a day per phone. It is a non-profit project, and the free model is shared fairly by everyone.

OR BRING YOUR OWN AI
For more, or a model of your choice, use your own API key with OpenAI, Anthropic (Claude), OpenRouter, Mistral or any other OpenAI-compatible service. The app lists the models your key can use and tests the connection for you. You pay your provider directly, usually a fraction of a cent per poster.

PRIVATE BY DESIGN
• No account, no ads, no analytics, no tracking
• Nothing you read is kept — not by us, and not by the free model, which is never trained on it
• With your own provider, what you read goes straight from your phone to them, and your key stays on your phone, encrypted
• Photos are not saved to your gallery
• Open source: github.com/droptocal/droptocal

DropToCal also runs in the browser at droptocal.org.

Questions or ideas: hello@droptocal.org
```

**App icon:** `graphics/icon-512.png` (512 × 512)

**Feature graphic:** `graphics/feature-1024x500.png` (1024 × 500)

**Phone screenshots:** `screenshots/` (1080 × 2160, in order)

## Store settings

| Field | Value |
|---|---|
| App or game | App |
| Category | Productivity |
| Tags | Calendar, Productivity tools (pick what Play offers closest) |
| Email | hello@droptocal.org |
| Website | https://droptocal.org |
| Phone | leave empty |
| Privacy policy | https://droptocal.org/privacy |

## App content

### Privacy policy
`https://droptocal.org/privacy`

### Ads
No, the app does not contain ads.

### App access
*All or some functionality is restricted* — reading anything needs an AI provider and an API key, which the user brings. Add one set of instructions:

```
Name: Reading posters (needs an API key)

DropToCal reads posters with an AI provider the user chooses, using their own API key. To test it:
1. Open the app. Settings opens on first start.
2. Provider: choose "Anthropic (Claude)".
3. API key: paste the key below.
4. Model: choose "claude-haiku-4-5" from the list.
5. Tap Save, then point the camera at any event poster, or tap Text and paste:
   "Jazz night at Moods, Zürich, Friday 16 October 2026, 20:00".
API key: <a key made for review, with a small spending limit>
```

(The key goes only into Play Console's private App access field, which only Google's reviewers see. Make a separate key for it with a spending limit, and revoke it after review.)

### Content rating (IARC questionnaire)
- Category: **Utility, Productivity, Communication, or Other**
- Violence, sexuality, language, controlled substances, gambling, horror: **No** to all
- Does the app allow users to interact or exchange content with other users? **No**
- Does the app share the user's current physical location with other users? **No**
- Does the app allow users to purchase digital goods? **No**
- Is this a web browser or search engine? **No**
- Expected rating: Everyone / PEGI 3 / USK 0

### Target audience and content
- Target age group: **18 and over** (choosing only 18+ keeps it outside Play's Families requirements)
- Could it unintentionally appeal to children? **No**

### News app
No.

### Data safety
With the free model (the default) what a user reads goes to our server on Cloudflare to be read, so it is
*collected* in Play's sense, though only for the moment it is read. Answers:

**Does your app collect or share any of the required user data types?** Yes.

**Is all of the user data collected by your app encrypted in transit?** Yes. *(api.droptocal.org and every listed provider are HTTPS; an address the user types is their choice.)*

**Do you provide a way for users to request that their data is deleted?** No. *(Content is never kept; the installation number and counts delete themselves within a day, sessions within a week, and Clear in Settings starts a new number. The policy says so.)*

Data types:

| Category | Type | Collected | Shared | Ephemeral | Required | Purpose | Why |
|---|---|---|---|---|---|---|---|
| Photos and videos | Photos | Yes | No | **Yes** | Yes | App functionality | a photographed or shared poster is sent to the AI model to be read |
| Files and docs | Files and docs | Yes | No | **Yes** | Yes | App functionality | a shared PDF's text or pages are sent to the AI model |
| App activity | Other user-generated content | Yes | No | **Yes** | Yes | App functionality | shared or pasted text, and the text of web pages, is sent to the AI model |
| Device or other IDs | Device or other IDs | Yes | No | No | Yes | App functionality, Fraud prevention, security and compliance | the random installation number the free model's daily limit is counted under, kept up to a week |

*Required:* the app cannot read anything without sending it. The installation number is only created when the free model is used, but it is the default, so answer Yes.

Not collected: location (IP addresses are counted only as a one-way hash, never stored), personal info, contacts, calendar, financial info, health, messages, audio, web browsing history, app info and performance (no crash reporting).

**Not shared:** Cloudflare runs the free model and our server on our behalf, as a service provider, which Play does not count as sharing. Content sent to a provider the user configured themselves is a transfer the user initiates, which Play does not count as sharing either.

### Government apps, financial features, health
None of them.

## Release notes for 1.1

```
Free to use with nothing to set up: DropToCal now reads with a free AI model, about 20 reads a day per phone. Your own API key still works, for more or a model of your choice.
```

## Release notes for 1.0

```
First release. Read posters, PDFs, links and text into your calendar with the AI provider of your choice.
```
