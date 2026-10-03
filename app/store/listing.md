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

BRING YOUR OWN AI
DropToCal reads with an AI model of your choice, using your own API key. It works with OpenAI, Anthropic (Claude), OpenRouter, Groq, Mistral and any other OpenAI-compatible service. Pick a provider, paste your key, choose a model — the app lists the ones your key can use and tests the connection for you. You pay your provider directly, usually a fraction of a cent per poster.

PRIVATE BY DESIGN
• No account, no ads, no analytics, no tracking
• What you read goes from your phone straight to the provider you chose — never through a server of ours
• Your API key stays on your phone, encrypted
• Photos are not saved to your gallery, and nothing you read is kept
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
- Target age group: **18 and over** (the app needs a paid API key; choosing only 18+ keeps it outside Play's Families requirements)
- Could it unintentionally appeal to children? **No**

### News app
No.

### Data safety
Play counts anything an app sends off the device as *collected*, even when it goes to a service the user chose rather than to the developer. So:

**Does your app collect or share any of the required user data types?** Yes.

**Is all of the user data collected by your app encrypted in transit?** Yes. *(Every listed provider is HTTPS; an address the user types is their choice.)*

**Do you provide a way for users to request that their data is deleted?** No — nothing is kept to delete. *(Answer "No"; the policy explains that the app keeps nothing and providers hold their own data.)*

Data types — mark each as **Collected**, **not shared**, **processed ephemerally: Yes**, **required** (the app cannot read anything without it), purpose **App functionality**:

| Category | Type | Why |
|---|---|---|
| Photos and videos | Photos | a poster photographed or shared is sent to the user's AI provider to be read |
| Files and docs | Files and docs | a shared PDF's text or pages are sent to the user's AI provider |
| App activity | Other user-generated content | text and the text of web pages the user shares or pastes are sent to the user's AI provider |

Not collected: location, personal info, contacts, calendar, financial info, health, messages, audio, device or other IDs, web browsing history, app info and performance (no crash reporting).

**Not shared:** sending content to the provider the user configured is a transfer the user initiates themselves, which Play does not count as sharing.

### Government apps, financial features, health
None of them.

## Release notes for 1.0

```
First release. Read posters, PDFs, links and text into your calendar with the AI provider of your choice.
```
