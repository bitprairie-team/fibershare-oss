# Live data from your own ChirpStack

The herd view can show your own LoRa trackers instead of the sample goats. This is optional. Without it, the demo uses the bundled sample data and works offline.

Run all of this on your own hardware, next to ChirpStack. Nothing here sends tracker data to BitPrairie or anywhere else.

## What you need

- ChirpStack v4, for example the official chirpstack-docker stack.
- The ChirpStack REST API gateway, which the stack runs on port 8090.
- An API token. Make one in the ChirpStack web UI under API keys.
- Node 20 or newer. The pull script has no dependencies.
- For decoded uplinks: ChirpStack's MQTT integration with the JSON marshaler, which is the default.

## Two sources

**REST (always).** The script reads `/api/tenants`, `/api/applications?tenantId=`, and `/api/devices?applicationId=&limit=`, then `/api/devices/{devEui}/link-metrics` for each device. From these it gets each tracker's name, DevEUI, description, tags, profile name, battery, last-seen time, uplinks per hour, and signal (SNR and RSSI). The REST gateway does not hand out uplink payloads, so there are no positions or sensor readings from this source.

**MQTT (optional).** Set `CHIRPSTACK_MQTT_URL` and the script also listens to the broker for a while (60 seconds by default). ChirpStack publishes each uplink on `application/<applicationId>/device/<devEui>/event/up` as JSON, with the decoded values in its `object` field. From these the script takes position, temperature, light, motion, battery, and SOS when your codec reports them. It keeps the best SNR and RSSI of each uplink. It does not keep radio receiver IDs or receiver positions.

In the chirpstack-docker stack, Mosquitto listens on port 1883 inside the compose network only. Either run the pull in a container on that network, or publish 1883 to localhost only (`127.0.0.1:1883:1883`) and use `mqtt://localhost:1883`. Use `mqtts://` if your broker has TLS. The MQTT client is built in, so nothing extra is installed.

## Run it

```bash
mkdir -p ~/.config/fibershare
# paste the token into this file, then:
chmod 600 ~/.config/fibershare/chirpstack-token

npm run chirpstack:pull
npm run dev
```

Open the herd view. It shows **Live from your ChirpStack** when `.local/live.json` exists. **Show sample data** switches back for this browser tab.

The script prints counts only, such as `8 tracker(s), 7 online, 1 low battery`. It never prints the token, names, DevEUIs, or values.

## Settings

Set these in your shell, or in a `.env` file in the repo folder (copy `.env.example`). `.env` is ignored by git.

| Setting | Default | What it does |
| --- | --- | --- |
| `CHIRPSTACK_URL` | `http://localhost:8090` | The REST API gateway |
| `CHIRPSTACK_API_TOKEN` | | Your API token |
| `CHIRPSTACK_API_TOKEN_FILE` | `~/.config/fibershare/chirpstack-token` | Used when `CHIRPSTACK_API_TOKEN` is not set |
| `CHIRPSTACK_TENANT_ID` | all tenants the token can list | Comma-separated tenant IDs |
| `CHIRPSTACK_APPLICATION_ID` | all applications in those tenants | Comma-separated application IDs. Also limits the MQTT topics |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | | Only if the REST gateway sits behind Cloudflare Access. Set both or neither |
| `CHIRPSTACK_MQTT_URL` | | Turns on the MQTT source, such as `mqtt://localhost:1883` |
| `CHIRPSTACK_MQTT_USERNAME`, `CHIRPSTACK_MQTT_PASSWORD` | | If your broker needs a login |
| `FIBERSHARE_HIDE_TRACKERS` | `1` | `1` hides tracker details before writing. `0` keeps real values |

Flags: `--hide` and `--no-hide` (override `FIBERSHARE_HIDE_TRACKERS`), `--hours=24`, `--mqtt-seconds=60`, `--out=.local/live.json`, `--watch=60` (pull again every 60 seconds), `--dry-run`, `--help`. Pass flags after `--`, for example `npm run chirpstack:pull -- --no-hide`.

The token is sent as `Grpc-Metadata-Authorization: Bearer <token>`. Use `https` if the gateway is on another machine. The script warns about plain `http` to anything but localhost.

## Hide tracker details

There are two layers, and both start on.

**In the file.** With `FIBERSHARE_HIDE_TRACKERS=1` (the default) or `--hide`, the script strips real values before it writes. Each tracker gets an alias such as Tracker 3. DevEUIs, names, tags, descriptions, profile names, and positions are left out. Signal becomes good, fair, or weak. Each tracker gets a grid cell from a hash of its DevEUI, so it lands in the same cell every time. The script then checks the output for any real value, DevEUI-like string, or coordinate, and writes nothing if it finds one.

**In the page.** The herd view has a **Hide tracker details** setting next to the live badge. It is on by default and kept in your browser's local storage. Turned off, and with a file written using `FIBERSHARE_HIDE_TRACKERS=0`, the page shows real names, DevEUIs, tags, raw SNR and RSSI, and positions as plain coordinates and on a small local map (metres from the middle of the group, no map tiles, no outside requests). That view is marked **Private: only on your own hardware**. If the file was written hidden, turning the setting off has nothing more to show.

A full file (`FIBERSHARE_HIDE_TRACKERS=0`) is written with owner-only permissions. Aliases are kept in `.local/aliases.json`, so adding a tracker does not renumber the others.

## Keep it on your own hardware

- `.local/` is ignored by git. Do not move the live file into `public/`.
- `npm run dev` and `npm run preview` serve the live file at `/live/live.json`. `npm run build` never copies it into `dist/`.
- The page only asks for the live file when you open it at `localhost`, so a hosted copy of the demo never does.
- Vite listens on localhost unless you pass `--host`. With `--host`, anyone on your network can fetch `/live/live.json`, so do not use `--host` with a full file.
- Fixtures in `test/fixtures/` are made up. Tests check every committed file for DevEUI-like hex strings and coordinates.

## Not checked against a real server yet

These parts were built from the ChirpStack v4 API definitions and tested with made-up replies:

- The `start` and `end` query format for link metrics (RFC 3339 timestamps), and whether `rxPackets` counts each uplink once when several radio receivers hear it.
- Listing tenants with a key that is not an admin key. If it fails, set `CHIRPSTACK_TENANT_ID`.
- The MQTT topic and JSON fields with your ChirpStack version and marshaler setting.
- The names of the decoded T1000 fields. The script looks for plain keys (`latitude`, `temperature`, ...) and for lists of `{ type, measurementValue }` readings, which is how the SenseCAP T1000 codec reports them. SOS, light, and motion names may differ by codec version.
- What a battery level of 0 means for a T1000. ChirpStack uses -1 or a missing value for no reading, and those show as not reported.
