# Paddock cameras and moqXAIO

moqXAIO is BitPrairie's paddock camera project. It sends live pictures from a small camera board over Media over QUIC (MoQ), so many viewers can watch one camera through a relay without each one connecting to the board. Its code is not public yet. This page covers what it does today, what is planned, and how it would fit FiberShare. Device models are on [hardware.md](hardware.md).

Nothing on this page is in the FiberShare demo yet. Every FiberShare use below is **Planned**.

## How it works

```
Camera board (XIAO ESP32-S3 Sense)
  serves JPEG pictures on its own Wi-Fi access point, behind a viewer token
        │ local HTTP
        ▼
Bridge program on a ranch computer
  pulls each picture and publishes it as a MoQ broadcast
        │ QUIC
        ▼
MoQ relay (on the ranch computer, or a separate ESP32-S3 relay board)
        │
        ▼
Viewers subscribe to the broadcast
```

Each camera publishes a few named tracks:

| Track | What it carries | Status |
| --- | --- | --- |
| `jpeg` | One picture per group | Working with a test camera |
| `status` | Replies to commands sent to the camera | Working with a test camera |
| `catalog` | A list of what the camera offers | Working with a test camera |
| `audio` | Opus sound from the board microphone | Planned |
| `detections` | One JSON record per detection run: boxes, labels, scores, model name | Reserved. It is always empty today |

Commands reach a camera on its own command track, or on one shared by every camera.

## What works today

- The bridge publishes pictures to a MoQ relay, and a viewer receives them. Automated tests prove this with a stand-in camera.
- A camera board ran an earlier build and returned pictures. The current build has not yet been checked on a board, and every picture record says so (`device_verified` is false).
- Relay timing was measured with a moving test pattern, not the camera. On the ESP32-S3 relay board, the median delay end to end was about a third of a second. Camera numbers are not measured yet.

## What is not built yet

- **Publishing from the board itself.** A QUIC client does not fit in the board's firmware space today, so a ranch computer runs the bridge.
- **Sound.** The track exists. The board does not record from its microphone yet.
- **Watching in a browser.** Today a viewer is a command-line program. A browser page needs a relay that speaks WebTransport.
- **Detection.** No model runs on the board. The project's own notes say detection should run on the second processor core, a few times slower than the picture rate, with results sent on the `detections` track. A separate vision board (see [hardware.md](hardware.md)) would take that load off the camera board.
- **Measured camera numbers.** Delay, frame rate, bitrate and dropped pictures are all still to be measured.

## Hardware change to check

The project was built for the Sense board's original OV2640 camera. Seeed has discontinued that camera, and new boards ship with an OV5640 or an OV3660. Check the camera driver on a new board before buying more.

## How it fits FiberShare (Planned)

| FiberShare part | What a camera adds |
| --- | --- |
| Herd view | A signed-in rancher can open the live picture for a paddock or water point. The public never sees a camera, its picture or where it is. |
| Predator Watch | A detection from a camera becomes a candidate report. The rancher sees the picture, the model's label and score, and why it was raised, then confirms or dismisses it. Nothing goes to neighbors without the rancher's OK. |
| Wildfire Watch | A camera with a view of the horizon sends a still on a schedule, or when a smoke sensor reading rises, for a smoke check. |
| Trackers | A tracker alert, such as SOS or not moving, can ask the nearest camera for a picture. A tracker reading near a camera does not prove which animal is in the frame, and FiberShare will not claim it does. |
| Gateways | The ranch computer that runs the network server can also run the bridge and the relay. LoRa carries the alert. Wi-Fi, Ethernet or cell carries the pictures. Where there is no cell signal, a satellite modem can send the alert and a small still, not video. |

The same rules as every other FiberShare job apply. Each camera job has an on and off switch, says what it did and why, and every alert can still be handled by hand.

## What stays private

- Camera and relay sites, and camera views of a real ranch
- Viewer tokens, Wi-Fi passphrases and relay certificate files
- Device IDs and network addresses

Do not add any of these to this repository.
