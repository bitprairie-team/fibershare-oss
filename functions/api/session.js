// GET /api/session. Says how a rancher signs in on this copy.
import { getSession } from "../../server/pages.js";

export const onRequestGet = (context) => getSession(context);
