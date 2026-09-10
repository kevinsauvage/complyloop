import fs from "node:fs";
import path from "node:path";

import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_PROJECT_COOKIE,
} from "../src/server/active-cookies";
import {
  E2E_ORG_ID,
  E2E_OWNER,
  E2E_PROJECT_ID,
  E2E_VIEWER,
} from "./constants";
import { mintSessionCookie, storageState } from "./helpers";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");
export const OWNER_STATE = path.join(AUTH_DIR, "owner.json");
export const VIEWER_STATE = path.join(AUTH_DIR, "viewer.json");
export const ANON_STATE = path.join(AUTH_DIR, "anon.json");

export { mintSessionCookie, storageState } from "./helpers";

export async function writeAuthStates(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const ownerSession = await mintSessionCookie(E2E_OWNER);
  const viewerSession = await mintSessionCookie(E2E_VIEWER);
  const workspaceCookies = [
    { name: ACTIVE_PROJECT_COOKIE, value: E2E_PROJECT_ID },
    { name: ACTIVE_ORG_COOKIE, value: E2E_ORG_ID },
  ];

  fs.writeFileSync(
    OWNER_STATE,
    JSON.stringify(
      storageState([ownerSession, ...workspaceCookies]),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    VIEWER_STATE,
    JSON.stringify(
      storageState([viewerSession, ...workspaceCookies]),
      null,
      2,
    ),
  );
  fs.writeFileSync(ANON_STATE, JSON.stringify(storageState([]), null, 2));
}
