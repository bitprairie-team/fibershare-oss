# Rancher sign-in and the map

This demo can show your own trackers from ChirpStack (see [chirpstack.md](chirpstack.md)). Anyone who opens a copy of it gets the hidden view: aliases, no device IDs, no positions, and grid cells from a hash. A signed-in rancher gets the real data and a map with map layers.

The server decides which one you get. The page asks `/api/live`, and the server only sends the full file after it has checked your sign-in. Real data is never part of `npm run build`, so a copy of `dist/` holds none.

There are two ways to sign in. Use the one that matches where the demo runs.

| | Local, on your own hardware | Cloudflare Pages |
| --- | --- | --- |
| Sign-in | A passphrase you set | Cloudflare Access, with any login your Access app allows |
| Live data comes from | `.local/live.json` | A KV namespace, filled by `chirpstack:pull -- --push` |
| Runs with | `npm run dev`, `npm run preview`, `npm run serve:local` | The Pages Functions in `functions/api/` |

## Local, on your own hardware

1. Write a full file. Rancher sign-in needs real values in it:

   ```bash
   FIBERSHARE_HIDE_TRACKERS=0 npm run chirpstack:pull -- --watch=120
   ```

2. Set a passphrase, 12 characters or more:

   ```bash
   npm run rancher:passphrase
   ```

   It asks twice and stores only a scrypt hash in `.local/rancher.json`, which git ignores. Run it again to change the passphrase. That also signs out every open session. `npm run rancher:passphrase -- --remove` turns sign-in off.

3. Start a server and open the **Rancher** page:

   ```bash
   npm run dev            # http://localhost:5173
   npm run build && npm run serve:local   # http://127.0.0.1:4174
   ```

   `serve:local` serves the built site and the API with no dev tools. It listens on `127.0.0.1:4174` unless you set `FIBERSHARE_HOST` or `FIBERSHARE_PORT`.

How it works:

- Signing in sets a `fs_session` cookie that is HttpOnly and SameSite=Strict, and lasts 12 hours. It is signed with a secret kept in `.local/rancher.json`.
- Five wrong passphrases from one address lock sign-in for a minute.
- Sign-in and sign-out only accept requests from the same origin.
- Over plain `http` on your network, the cookie can be read by anyone watching that network. Keep the servers on localhost, or put them behind `https`.

## Cloudflare Pages, with Cloudflare Access

On Pages there is no file on disk. Your pull pushes the data into a KV namespace, and a Cloudflare Access app decides who the rancher is.

### 1. KV and the push token

```bash
npx wrangler kv namespace create FIBERSHARE_LIVE
```

Bind it to the Pages project as `FIBERSHARE_LIVE`, in the dashboard or in `wrangler.toml` (there is a commented example). Then make a long random push token and store it in two places:

```bash
mkdir -p ~/.config/fibershare
openssl rand -base64 32 > ~/.config/fibershare/push-token
chmod 600 ~/.config/fibershare/push-token
npx wrangler pages secret put PUSH_TOKEN --project-name=<your project>   # paste the same token
```

The token must be at least 24 characters. Without `PUSH_TOKEN` set, the push endpoint refuses everything.

### 2. Access

In Cloudflare Zero Trust, add a self-hosted Access application:

- Hostname: your Pages hostname. Path: `api/rancher/login`. You can protect the whole site instead, if only ranchers should see it at all.
- A policy that allows only you, such as your email address.
- Copy the application audience (AUD) tag.

Set two variables on the Pages project:

| Variable | Example | What it is |
| --- | --- | --- |
| `ACCESS_TEAM_DOMAIN` | `yourteam.cloudflareaccess.com` | Your Zero Trust team domain |
| `ACCESS_AUD` | the long AUD tag | The audience tag of the Access app |

The **Rancher** page then shows a **Sign in with Cloudflare Access** button. Access asks you to log in, then sends you back to the herd view.

On every `/api/live` request the Function checks the Access token from the `Cf-Access-Jwt-Assertion` header or the `CF_Authorization` cookie. It checks the RS256 signature against your team's public keys at `/cdn-cgi/access/certs`, the audience, the issuer, and the expiry. Anything else gets the hidden view. If `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is missing, nobody is a rancher.

To sign out, open `/cdn-cgi/access/logout` on your Pages hostname, or use the Access app launcher.

### 3. Push from your own hardware

```bash
export FIBERSHARE_PUSH_URL=https://<your project>.pages.dev
FIBERSHARE_HIDE_TRACKERS=0 npm run chirpstack:pull -- --push --watch=120
```

Each pull sends both copies to `/api/push` with the token in an `X-FiberShare-Push-Token` header. The script makes the hidden copy and checks it for real values first, and the Function checks it again, so the public copy in KV never holds a real name, DevEUI, or position. The full copy is only read for a signed-in rancher.

The push needs `https`, except to localhost. The token is never printed, and it is removed from any error reply before that is shown.

## The Hide tracker details setting

- For the public it is locked on. It cannot show more, because the server only sent hidden data.
- For a signed-in rancher it starts on, so real values stay off the screen until you turn it off. The choice is kept in your browser.

## Answers to alerts

The herd view raises an alert for a battery below 20% (unless the tracker is on outside power) and for a tracker with nothing heard for over 2 hours. The thresholds are in `src/alert-config.js`. You can confirm or dismiss each alert, with an optional note.

- Public live view and sample data: answers stay in your browser, under `fs-alerts-public` and `fs-alerts-demo`. Reset demo clears them.
- Signed-in rancher: answers go to `/api/alerts`. It has the same check as the full data. Without a valid sign-in, GET and POST get 401 and nothing is stored. A POST from another site gets 403. Local mode keeps the answers in `.local/alert-feedback.json`, owner-only. Pages keeps them in the `FIBERSHARE_LIVE` KV namespace under `alert-feedback`, and answers 503 if no namespace is bound.
- Each answer is a feedback record: the alert id, its kind, the answer, the note, the time, and the threshold that raised it. The newest 2,000 are kept. Tuning the rules from these records is planned.

## Map layers

Turn **Hide tracker details** off while signed in and the herd view shows a map. Each tracker is a pin with its alias. Click one for battery, last seen, position time, and sensors. The **Layers** panel picks a basemap and any overlays, and remembers your choice in your browser.

Every layer below was checked on the day it was added. `npm run layers:check` checks them again: it asks each service whether it answers, whether the popup fields still exist, and how deep each tile cache goes.

| Layer | Source | Needs a key | Terms |
| --- | --- | --- | --- |
| Imagery (default) | USGS The National Map, `basemap.nationalmap.gov` USGSImageryOnly | No | US government data, public domain |
| Topo | USGS The National Map, USGSTopo | No | US government data, public domain |
| Streets | OpenStreetMap, `tile.openstreetmap.org` | No | ODbL. Light use only, under the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| Imagery, Topo, Streets (Esri) | ArcGIS [static basemap tiles](https://developers.arcgis.com/rest/static-basemap-tiles/) | Yes | Esri terms. Keep the "Powered by Esri" attribution. No caching or bulk download |
| Wildfire perimeters (current) | NIFC WFIGS Interagency Perimeters, ArcGIS feature layer | No | US interagency fire data, public domain |
| Wildfire incidents (current) | NIFC WFIGS Incident Locations, ArcGIS feature layer | No | US interagency fire data, public domain |
| Weather watches and warnings | NOAA NWS `mapservices.weather.noaa.gov` watch_warn_adv | No | US government data, public domain |
| Fire weather outlook (day 1) | NOAA Storm Prediction Center, `SPC_firewx` map service | No | US government data, public domain |
| Smoke from satellite | NOAA NESDIS Hazard Mapping System smoke, ArcGIS feature layer | No | NOAA, not subject to copyright |
| Air quality, PM2.5 | US EPA AirNow latest PM2.5 contours, ArcGIS feature layer | No | US EPA data. Readings are preliminary |
| Federal surface land ownership | BLM Surface Management Agency, cached map service | No | US government data, public domain. Not a legal land survey |

The full service URLs are in `src/map-layers.js`. Wildfire perimeters and weather warnings are on by default.

### Your own layer

Paste an `https` address into **Add your own layer**:

- An ArcGIS feature layer, ending in `/FeatureServer/0` or `/MapServer/0`
- An ArcGIS map service, ending in `/MapServer`
- A GeoJSON file, ending in `.geojson` or `.json`, or with `f=geojson`

Addresses with a login, a token, or a key in them are refused, so a secret does not end up saved in your browser. Your layers are kept in your browser only. A GeoJSON file on another site only loads if that site allows it (CORS).

### ARCGIS_API_KEY (optional)

Without a key the map works. Only the three Esri basemaps are greyed out.

To use them, make an API key in your ArcGIS Location Platform or ArcGIS Online account:

- Give it the basemaps privilege only.
- Restrict it to your site's address (an HTTP referrer), such as `http://localhost:5173` or your Pages hostname.
- Set it as `ARCGIS_API_KEY`: in `.env` for local mode, or as a Pages secret.

The server sends the key only to a signed-in rancher, and it never goes into the build. The browser puts it in Esri tile URLs, so anyone who can sign in can see it. The referrer limit is what keeps it from being useful anywhere else.

## Planned

- Storing the full copy in R2 instead of KV, for a larger herd
- More than one rancher, each seeing only their own trackers
- Tuning the alert thresholds from the answers

## Not checked yet

- The Pages Functions pass their tests and run under `wrangler pages dev` with a local KV, but have not run on a real Pages project.
- Sign-in through a real Access app. The token check was tested with keys made in the tests.
- The Esri basemap style names. Without a key the service answers "Token Required" for any name.
