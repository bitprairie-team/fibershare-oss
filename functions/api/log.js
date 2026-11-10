import { getLog, postLog } from "../../server/pages.js";

export const onRequestGet = (context) => getLog(context);
export const onRequestPost = (context) => postLog(context);
