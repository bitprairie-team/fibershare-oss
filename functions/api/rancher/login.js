// GET /api/rancher/login. Protect this path with a Cloudflare Access
// application. After Access signs the rancher in, this sends them to the map.
import { getLogin } from "../../../server/pages.js";

export const onRequestGet = (context) => getLogin(context);
