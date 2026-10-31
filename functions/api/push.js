// POST /api/push. Takes the hidden and full live files from
// `npm run chirpstack:pull -- --push` and stores them in KV.
import { postPush } from "../../server/pages.js";

export const onRequestPost = (context) => postPush(context);
