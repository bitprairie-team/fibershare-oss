# One binary for the ranch machine. Build it, then serve the repo so
# .local and public/ stay on the host.
#
#   podman build -t fibershare -f Containerfile .
#   podman run --rm -p 127.0.0.1:4174:4174 -v "$PWD":/app:Z -w /app fibershare serve
#
# Pull, on the network server's compose network:
#
#   podman run --rm --network chirpstack-docker_default \
#     -v "$PWD":/app:Z -v "$HOME/.config/fibershare":/cfg:ro,Z -w /app \
#     --env-file "$HOME/.config/fibershare/mqtt.env" \
#     -e CHIRPSTACK_URL=http://chirpstack-rest-api:8090 \
#     -e CHIRPSTACK_API_TOKEN_FILE=/cfg/chirpstack-token \
#     -e CHIRPSTACK_MQTT_URL=mqtt://mosquitto:1883 \
#     fibershare pull

FROM rust:1.91-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release -p fibershare

FROM debian:bookworm-slim
RUN useradd --create-home --uid 10001 fibershare
COPY --from=build /src/target/release/fibershare /usr/local/bin/fibershare
USER fibershare
WORKDIR /app
EXPOSE 4174
CMD ["fibershare", "serve"]
