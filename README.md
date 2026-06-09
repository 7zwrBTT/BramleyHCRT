# Bramley Control Terminal — GitHub Pages + Realtime Trains

This version runs on GitHub Pages and uses GitHub Actions to update JSON data from the Realtime Trains API.

## Files

- `index.html` — retro CRT app
- `app.js` — UI logic
- `fetch-data.js` — GitHub Actions data updater
- `.github/workflows/update-train-data.yml` — scheduled updater
- `data/line.json` — train positions/source data
- `data/departures.json` — station departures

## Route

Reading → Reading West → Reading Green Park → Mortimer → Bramley → Basingstoke

## GitHub Pages setup

1. Create a GitHub repo.
2. Upload all files from this ZIP.
3. Go to `Settings → Pages`.
4. Choose `Deploy from branch`.
5. Choose `main / root`.
6. Save.

## Realtime Trains credentials

Do not put credentials in the code.

Go to:

`Settings → Secrets and variables → Actions`

Then add whichever credentials your RTT account uses.

### Option A: Bearer token

Secret:

```txt
RTT_TOKEN
```

Optional repository variable:

```txt
RTT_AUTH_MODE=bearer
```

### Option B: Basic auth

Secrets:

```txt
RTT_USERNAME
RTT_PASSWORD
```

Optional repository variable:

```txt
RTT_AUTH_MODE=basic
```

Optional variable if RTT gives you a different base URL:

```txt
RTT_BASE
```

Default:

```txt
https://api.rtt.io
```

## Updating data

The Action runs every 5 minutes.

You can also run it manually:

`Actions → Update train data → Run workflow`

## API endpoint used

The updater uses the RTT v1-style location search endpoint:

```txt
/api/v1/json/search/{CRS}/{YYYYMMDD}
```

for:

```txt
RDG, RDW, RGP, MOR, BMY, BSK
```

## iPhone

Open the GitHub Pages URL in Safari, then:

`Share → Add to Home Screen`



## Data credit

This project includes visible attribution to Realtime Trains on the About page and footer:

Train data provided by Realtime Trains.
https://www.realtimetrains.co.uk

This project is independent and not affiliated with or endorsed by Realtime Trains, Network Rail, Great Western Railway, or any train operating company.
