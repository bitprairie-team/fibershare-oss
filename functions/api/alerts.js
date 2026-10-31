import { getAlerts, postAlerts } from "../../server/pages.js";

export const onRequestGet = (context) => getAlerts(context);
export const onRequestPost = (context) => postAlerts(context);
