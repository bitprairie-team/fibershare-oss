# Hardware

This page lists the hardware FiberShare runs on today, what is being tested, and what could do a job on a ranch next. It is a technical page, so it names device models. The app screens and the README pitch do not. Prices are left out on purpose.

Every product fact below comes from the maker's own page, listed under [Sources](#sources). Figures are the maker's figures, not FiberShare field results, unless a line says otherwise.

Status words:

- **In use:** running on a FiberShare ranch today.
- **Being tested:** on the bench or in a trial, not relied on.
- **Planned:** not built or not bought yet.

## In use today

| Job | Hardware | Notes |
| --- | --- | --- |
| Animal position, battery, SOS | Seeed SenseCAP T1000 card trackers | LoRaWAN 1.0.4 Class A. GNSS outdoors, Wi-Fi and Bluetooth scans as a fallback. 700 mAh battery, about 4 months at one GNSS fix an hour. Stores 1000+ readings when no gateway is in range and sends them later. IP65. |
| Receive tracker uplinks | A LoRaWAN gateway on the ranch | Forwards to the network server. |
| Network server | ChirpStack v4 on the rancher's own computer | The pull script and its setup are in [chirpstack.md](chirpstack.md). The rest of this page says "network server". |

Things to know about the T1000 line on a ranch:

- Seeed rates it for -20 to 60 °C, and it only charges between 0 and 45 °C. Charge it indoors in winter.
- Range to a gateway is 2 to 5 km, depending on the gateway antenna and terrain.
- The T1000-A has the temperature, light and motion sensors. The T1000-B leaves them out. The motion sensor is what makes a not-moving or distress alert possible.

## Being tested

| Job | Hardware | Status |
| --- | --- | --- |
| Paddock camera with live video | Seeed XIAO ESP32-S3 Sense running moqXAIO | Being tested. See [paddock-cameras.md](paddock-cameras.md). |

## Hardware by ranch job

| Job | Fits today | Worth testing next |
| --- | --- | --- |
| Collar or tag tracker | SenseCAP T1000-A | SenseCAP T1000-E for LoRaWAN, for its open firmware |
| Live paddock video | XIAO ESP32-S3 Sense with moqXAIO (being tested) | reCamera Pro or reCamera HQ PoE at a powered site |
| On-device detection, battery site | None yet | SenseCAP A1102, or the Seeed Grove vision module (V2) beside the XIAO camera |
| On-device detection, powered site | None yet | reCamera Pro |
| Gateway at a far paddock | One LoRaWAN gateway | SenseCAP Outdoor Gateway with 4G |
| Link where there is no cell signal | None | RockBLOCK 9704 satellite modem, for alerts and small files |
| Direct-to-satellite LoRa | None | Wio-LR2021 evaluation kit, research only |

## Seeed hardware, as of November 2026

### Trackers

**SenseCAP T1000-A and T1000-B (in use).** Described above. Seeed's comparison table puts the T1000-E in the same family with the same sensors.

**SenseCAP T1000-E for LoRaWAN (worth testing).** Same card size and network as the T1000-A, with full firmware source published by Seeed. That lets FiberShare change the uplink format, the motion rules and the power profile, which the closed firmware does not. Seeed sells a separate Meshtastic version under the same name. Only the LoRaWAN version works with a LoRaWAN network server, and each version has to keep its own firmware.

**SenseCAP MeshTracker X1 (not a fit for collars).** A Meshtastic device, not LoRaWAN, with up to 5 days of battery. It could serve as a handheld for people on horseback, but not as an animal tracker.

### Cameras and on-device detection

**XIAO ESP32-S3 Sense (being tested with moqXAIO).** ESP32-S3 with 8 MB of PSRAM and 8 MB of flash, a camera, a digital microphone and an SD slot. Seeed has changed the camera: the OV2640 is discontinued, and new boards ship with an OV5640 with autofocus or an OV3660. On a 3.8 V battery Seeed measures about 155 mA on average while serving video and about 3 mA in deep sleep with the camera board attached, so a battery camera needs a schedule or a wake trigger, not an always-on stream.

**Seeed Grove vision module, V2 (worth testing).** A small vision board built on the Himax WiseEye2 HX6538 (two Arm Cortex-M55 cores and an Ethos-U55 neural unit). It runs MobileNet, EfficientNet-Lite and YOLOv5 or YOLOv8 models and connects to a XIAO board. When a XIAO is attached it reports detection results, not the live picture, at the same time. That split suits FiberShare: the detector says what it saw, and the camera board handles video.

**SenseCAP A1102 (worth testing).** An IP66 outdoor camera built on the same HX6538. It runs detection on the device at 480 by 480 at about 10 frames a second and sends only the results over LoRaWAN, 2 to 10 km depending on terrain. It runs on a replaceable 19 Ah D-size battery in cycles, or on 12 V DC. Limits to check before a trial: Seeed rates it for 0 to 70 °C, so it is not rated below freezing, and Seeed's own human-detection test reached 70% confidence at 1 to 5 m. Treat it as a close-range sensor at a gate, trough or pen, not a long-range predator camera.

**reCamera 2002 and reCamera HQ PoE.** A Linux camera on the SG2002 chip with a 1 TOPS (INT8) neural unit, 5 MP video at 30 frames a second, Ethernet and Wi-Fi, powered at 5 V 1 A. The HQ PoE version swaps in a 2 MP sensor with an M12 lens mount, takes power and data over one Ethernet cable (802.3af), drops Wi-Fi, and is rated -20 to 50 °C.

**reCamera Pro (worth testing).** A Linux camera on the Rockchip RV1126B with a 3 TOPS neural unit, an 8 MP low-light sensor, interchangeable lenses, two microphones, PoE and Wi-Fi. It has an H.264 and H.265 encoder and speaks RTSP, ONVIF, MQTT and HTTP. Seeed reports YOLO11 at 43 frames a second at 640 by 640. Because it runs Linux, the MoQ publisher could run on the camera itself instead of on a separate computer (see [paddock-cameras.md](paddock-cameras.md)). It needs mains or PoE power. Its operating temperature range was not on the product page.

### Radio modules

**Wio-SX1262 with XIAO ESP32-S3.** A LoRa board for the XIAO. Seeed documents it as a LoRaWAN sensor node, a Meshtastic node, or a single-channel LoRaWAN gateway. A single-channel gateway is fine for a bench test but does not replace a full gateway.

**Wio-LR2021 and the LR2021 evaluation kit (research).** Semtech's fourth-generation LoRa chip. It covers sub-GHz and 2.4 GHz, adds FLRC links up to 2.6 Mbps, and has LR-FHSS for direct-to-satellite IoT. Seeed lists -141.1 dBm sensitivity at SF12/125 kHz and 583 nA in deep sleep. The module needs a host microcontroller. Seeed's evaluation kit pairs it with a XIAO nRF54L15. FLRC could carry a still picture over a short radio hop. Satellite use depends on a satellite service, so this is research only.

### Small boards

**XIAO nRF54L15 and nRF54L15 Sense.** Nordic nRF54L15 with Bluetooth LE 6.0, including channel sounding, rated -40 to 105 °C. The Sense version adds an IMU and a microphone. A candidate for a low-power ear tag or a gate sensor.

**XIAO nRF54LM20A and nRF54LM20A Sense.** Newer Nordic board (shipping from July 2026) with Nordic's nPM1300 power chip. The Sense version wakes on motion from its IMU. A candidate for a tag that sleeps until the animal moves.

### Gateways

**SenseCAP Outdoor Gateway (worth testing).** IP66, -40 to 70 °C, 4G and Ethernet backhaul, SX1302 radio, 12 V at 3.6 W, pole or wall mount. Seeed's range figure is 10 km line of sight. The low power draw makes a small solar setup practical.

**SenseCAP M2 Multi-Platform Gateway.** Indoor gateway with an SX1302 radio, Ethernet, Wi-Fi, PoE, and optional 4G. It works with any standard network server and has a built-in one. Seeed also sells an outdoor enclosure for it.

## Outside Seeed, only where clearly better

**Satellite backhaul: RockBLOCK 9704 (worth testing).** Seeed does not sell a satellite modem. The RockBLOCK 9704 uses the Iridium Certus 9704 module and sends two-way messages of 25 bytes to 100 KB, with delivery in as little as 10 seconds under good conditions. It draws under 5 mW asleep, about 60 mW idle and about 1.4 W while sending, and is rated -40 to 70 °C. It has no enclosure of its own. On a ranch it would sit at a gateway or camera site with no cell signal and send alerts, tracker summaries and an occasional small picture. It is not for video.

No tracker or low-power camera outside Seeed was clearly better for FiberShare's jobs in this review, so none is listed.

## What the hardware does not change

- Video never travels over LoRa. LoRa carries short readings and alerts. Video uses Wi-Fi, Ethernet or cell.
- A detection is a suggestion. It goes to the rancher with Confirm and Dismiss, like every other alert.
- Camera and gateway sites stay private. Do not add them, device IDs, or pictures of a real ranch to this repository.

## Sources

Checked November 2026.

- SenseCAP T1000 introduction: https://wiki.seeedstudio.com/SenseCAP_T1000_tracker/Introduction/
- T1000 family table: https://www.seeedstudio.com/blog/2026/08/27/seeed-fusion-turn-a-proven-sensecap-tracker-into-your-own-product/
- T1000-E for LoRaWAN firmware release: https://www.seeedstudio.com/blog/2025/05/15/weve-open-sourced-sensecap-t1000-e-for-lorawan-and-sensecap-m2-lorawan-gateway-unlocking-full-control-and-customization/
- SenseCAP MeshTracker X1: https://wiki.seeedstudio.com/meshtracker_x1_intro/
- XIAO ESP32-S3 series: https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/
- Seeed Grove vision module (V2): https://wiki.seeedstudio.com/grove_vision_ai_v2/
- SenseCAP A1102: https://wiki.seeedstudio.com/sensecap_a1102/
- reCamera 2002: https://wiki.seeedstudio.com/recamera_2002_series_hardware_and_specs/
- reCamera HQ PoE: https://wiki.seeedstudio.com/reCamera_hq_poe_hardware_and_specs/
- reCamera Pro: https://www.seeedstudio.com/reCamera-Pro-2GB.html
- Wio-SX1262 with XIAO ESP32-S3: https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit_class/
- Wio-LR2021: https://wiki.seeedstudio.com/wio_lr2021_introduction/
- LR2021 evaluation kit: https://wiki.seeedstudio.com/semtech_lr2021_evk_getting_started/
- XIAO nRF54L15: https://wiki.seeedstudio.com/xiao_nrf54l15_sense_getting_started/
- XIAO nRF54LM20A: https://www.seeedstudio.com/blog/2026/06/30/meet-xiao-nrf54lm20a-sense-motion-wake-up-always-connected-built-for-ultra-low-power/
- SenseCAP Outdoor Gateway: https://sensecap.org/product/sensecap-outdoor-gateway-lorawan-us915mhz/
- SenseCAP M2 Multi-Platform Gateway: https://wiki.seeedstudio.com/Network/SenseCAP_Network/SenseCAP_M2_Multi_Platform/SenseCAP_M2_Multi_Platform_Overview/
- RockBLOCK 9704: https://www.groundcontrol.com/product/rockblock-9704/
