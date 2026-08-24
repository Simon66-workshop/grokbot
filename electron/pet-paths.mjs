import path from "node:path";

/** Packaged pet Application Support folder. Must not be the chat client. */
export const PET_APPDATA = "GrokBot";
/** Chat client `/Applications/Grok Bot.app` (`com.anysphere.sand`). */
export const CHAT_CLIENT_APPDATA = "Grok Bot";

export function petUserDataPath({ packaged, appData }) {
  if (!packaged) return null;
  if (!appData) return null;
  return path.join(appData, PET_APPDATA);
}

export function applyPetUserData(app) {
  if (!app || typeof app.getPath !== "function") return "";
  if (!app.isPackaged) return app.getPath("userData");
  if (typeof app.setName === "function") app.setName(PET_APPDATA);
  const dest = petUserDataPath({ packaged: true, appData: app.getPath("appData") });
  if (dest && typeof app.setPath === "function") app.setPath("userData", dest);
  return dest || app.getPath("userData");
}

export function petDataFile(app, name) {
  return path.join(app.getPath("userData"), name);
}

export function chatClientSupportRoots(home) {
  return [
    path.join(home, "Library", "Application Support", CHAT_CLIENT_APPDATA),
    path.join(home, "Library", "Application Support", "ai.x.grok-bot"),
    path.join(home, "Library", "Logs", CHAT_CLIENT_APPDATA),
  ];
}

export function companionIndex(here) {
  return path.join(here, "..", "mac", "index.html");
}
