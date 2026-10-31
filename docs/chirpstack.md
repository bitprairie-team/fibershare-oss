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

Open the herd view. It shows **Live from your ChirpStack** when `.local/live.json` exists, and how long ago it was pulled. **Show sample data** switches back for this browser tab.

## Keep the file fresh

One pull is a snapshot. The herd view counts "checked in, last hour" from the time you look at it, so an old file shows zero. When the file is more than 15 minutes old the page says so.

Run the pull with `--watch` to pull again on a timer:

```bash
npm run chirpstack:pull -- --watch=120
```

That pulls every 120 seconds until you stop it with Ctrl-C. With MQTT on, each pull listens for `--mqtt-seconds` first, so keep the watch time longer than that.

## Run it with podman, on the compose network

In the chirpstack-docker stack the REST gateway and Mosquitto are only reachable inside the compose network. This runs the pull in a throwaway Node container on that network. The token file and the MQTT login stay in `~/.config/fibershare/`, mounted read-only:

```bash
podman run --rm --network chirpstack-docker_default -v $PWD:/app:Z -v ~/.config/fibershare:/cfg:ro,Z -w /app --env-file ~/.config/fibershare/mqtt.env -e CHIRPSTACK_URL=http://chirpstack-rest-api:8090 -e CHIRPSTACK_API_TOKEN_FILE=/cfg/chirpstack-token -e CHIRPSTACK_MQTT_URL=mqtt://mosquitto:1883 node:22-alpine node scripts/chirpstack/pull.js
```

- `chirpstack-docker_default` is the network compose makes for a folder named `chirpstack-docker`. Check yours with `podman network ls`.
- `chirpstack-rest-api` and `mosquitto` are the service names from the official compose file.
- `~/.config/fibershare/mqtt.env` holds `CHIRPSTACK_MQTT_USERNAME=` and `CHIRPSTACK_MQTT_PASSWORD=` lines, if your broker needs a login. Make it `chmod 600`.
- Add flags at the end, such as `--watch=120` or `--no-hide`. With docker, use the same command with `docker` in place of `podman`.

Plain `http` and `mqtt` are fine here: a host name with no dot, such as `chirpstack-rest-api`, is a container on the same network, so the script does not warn about it.

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
| `FIBERSHARE_HIDE_TRACKERS` | `1` | `1` hides tracker details before writing. `0` keeps real values, which rancher sign-in needs |
| `CHIRPSTACK_ALLOW_HTTP` | | `1` turns off the plain-`http` warning, for a private network you trust |
| `FIBERSHARE_PUSH_URL` | | For `--push`: your Pages copy, such as `https://example.pages.dev` |
| `FIBERSHARE_PUSH_TOKEN` | | For `--push`. Or leave blank and use `FIBERSHARE_PUSH_TOKEN_FILE` (default `~/.config/fibershare/push-token`) |

Flags: `--hide` and `--no-hide` (override `FIBERSHARE_HIDE_TRACKERS`), `--hours=24`, `--mqtt-seconds=60`, `--out=.local/live.json`, `--watch=60` (pull again every 60 seconds), `--push` (send to your Cloudflare Pages copy, see [rancher-access.md](rancher-access.md)), `--dry-run`, `--help`. Pass flags after `--`, for example `npm run chirpstack:pull -- --no-hide`.

The token is sent as `Grpc-Metadata-Authorization: Bearer <token>`. Use `https` if the gateway is on another machine. The script warns about plain `http` unless the host is localhost, a name with no dot (a container on the same compose network), or `CHIRPSTACK_ALLOW_HTTP=1` is set.

## Hide tracker details

There are two layers, and both start on.

**In the file.** With `FIBERSHARE_HIDE_TRACKERS=1` (the default) or `--hide`, the script strips real values before it writes. Each tracker gets an alias such as Tracker 3. DevEUIs, names, tags, descriptions, profile names, and positions are left out. Signal becomes good, fair, or weak. Each tracker gets a grid cell from a hash of its DevEUI, so it lands in the same cell every time. The script then checks the output for any real value, DevEUI-like string, or coordinate, and writes nothing if it finds one.

**On the server.** The page never reads the file itself. It asks `/api/live`, and the server sends the hidden copy to everyone except a signed-in rancher. See [rancher-access.md](rancher-access.md) for sign-in.

**In the page.** The herd view has a **Hide tracker details** setting next to the live badge. For the public it is locked on, and it could not show more anyway, because the server only sent hidden data. For a signed-in rancher it starts on, so real values are not on screen until you turn it off. Turned off, with a file written using `FIBERSHARE_HIDE_TRACKERS=0`, the page shows real names, DevEUIs, tags, raw SNR and RSSI, and a map with each tracker's position, its alias as the label, and a popup with battery, last seen, and sensors. The map has map layers you can turn on, listed in [rancher-access.md](rancher-access.md#map-layers).

A full file (`FIBERSHARE_HIDE_TRACKERS=0`) is written with owner-only permissions. Aliases are kept in `.local/aliases.json`, so adding a tracker does not renumber the others.

## Keep it on your own hardware

- `.local/` is ignored by git. Do not move the live file into `public/`.
- `npm run dev`, `npm run preview`, and `npm run serve:local` answer `/api/live` from `.local/live.json`. There is no direct URL for the file, and `npm run build` never copies it into `dist/`.
- The full file only goes to a browser signed in as the rancher. Everyone else gets the hidden copy, made on the server for each request.
- These servers listen on localhost unless you pass `--host` (or set `FIBERSHARE_HOST`). Sign-in still guards the full data then, but the cookie is sent over plain `http` on your network, so use it only on a network you trust.
- Fixtures in `test/fixtures/` are made up. Tests check every committed file for DevEUI-like hex strings and coordinates.

## Checked, and not checked yet

The REST and MQTT sources have run against a real chirpstack-docker stack with SenseCAP T1000 trackers: 4 MQTT uplinks in 20 minutes, each with a position. Other ChirpStack versions or marshaler settings may differ.

These parts were built from the ChirpStack v4 API definitions and tested with made-up replies:

- The `start` and `end` query format for link metrics (RFC 3339 timestamps), and whether `rxPackets` counts each uplink once when several radio receivers hear it.
- Listing tenants with a key that is not an admin key. If it fails, set `CHIRPSTACK_TENANT_ID`.
- The names of the decoded T1000 fields. The script looks for plain keys (`latitude`, `temperature`, ...) and for lists of `{ type, measurementValue }` readings, which is how the SenseCAP T1000 codec reports them. SOS, light, and motion names may differ by codec version.
- What a battery level of 0 means for a T1000. ChirpStack uses -1 or a missing value for no reading, and those show as not reported.
