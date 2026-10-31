// GET /api/live. Hidden tracker data for everyone. Full data only when the
// request carries a valid Cloudflare Access token for this app.
import { getLive } from "../../server/pages.js";

export const onRequestGet = (context) => getLive(context);
