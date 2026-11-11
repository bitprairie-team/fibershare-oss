---
name: moq-camera-bench-via-fanout
description: >-
  Use when benchmarking real ESP32 cameras end to end through an already-running
  MoQ relay fan-out and desk (e.g. moqXAIO), grading against a targets.toml
  without opening serial ports or taking a new relay subscriber session.
---
# Real-camera bench through a live fan-out

Goal: grade each camera feed against the repo's bench gates using only read-only polling of the live stack, then file the results via a cloud-agent PR.

## Hard rules
- Never open the relay/camera USB serial ports (`/dev/cu.usbmodem*`, `/dev/tty.*`). On these boards an open resets the board and rotates its TLS pin. That also rules out console `rate N` changes, so a 5 fps burst can't run without explicit owner approval.
- Each ESP relay accepts one subscriber, and the fan-out already holds it. Don't start a second fan-out, point a viewer at the ESP addresses, or kill or restart the fan-out without the owner's OK. Doing that is the only way to get a true "direct" row or a recovery test.
- Never flash anything without the owner's OK. Leave any device that's being flashed alone.
- Strip pins (`locals`, `pin`, `tls_sha256`) and private addresses from anything you save or post.
- Before the run, tell any other bench agent sharing the relays the exact window, so it can leave your traffic out of its grades. Tell it again when you're done.

## Steps
1. **Snapshot (read-only).** Curl the fan-out status (e.g. `:4461/status`) and the desk state (e.g. `:43127/api/state`). Record per-upstream `connected`, `reconnects`, `last_error`, `rtt_ms`, `age_ms` and frames, plus per-feed `fps`, `lat_p50/p95`, `rtt_ms` and `age_ms`, and desk `picture`/`banner`/`source_label`. `picture == live` means real camera; `bars` or a testsrc2 banner means color bars, so never grade those as hardware.
2. **Record ≥5 min (≥60 samples).** Build the repo's desk stats tools in release mode. Run the 1 Hz desk recorder against the desk URL (always pass the URL explicitly), plus a parallel 1 Hz pin-stripped fan-out status log. Write to a scratch dir outside the repo tree and use `timeout` to bound it. Run it in the background and check on it.
3. **Summarize and grade.** Run the desk summary and the desk grade with `--targets bench/targets.toml --minutes 5`. Exit 0 is PASS and exit 1 is FAIL with the failing checks listed.
4. **Sanity-check metrics before calling a fail real.** Through a fan-out, the desk's `lat_p95` should be about the loopback hop (a few ms, matching `rtt_ms`). If it's hundreds of ms while `rtt_ms` is about 2 ms, the desk is probably using a device capture stamp (CAPTS) instead of the hop. Treat that as a likely false fail and hand it to the dev agent as a bug. Fan-out `/status` `age_ms` is capture-stamp age, not the desk age gate.
5. **Report per feed.** Give each feed's grade against each gate, live vs bars, and what was not run and why (direct, recovery, 5 fps).
6. **File.** Package the raw files, summary and grade, copy them to the box, and launch a cloud agent on the repo to place them under `bench/results/<date>/<window>/` following the existing layout (`raw/`, `summaries/`, `grades/`, plain-language README in local time). It should open a PR and merge only with the owner's explicit yes. Never commit locally.
7. **Hand off bugs** to the dev agent with the numbers, the window, file and line pointers, and "PR only, no merge without the owner's yes".
