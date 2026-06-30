import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Checks for an app update once on mount and, if one is available, downloads,
 * installs, and relaunches into the new version. Fully fail-safe: in dev (no
 * updater endpoint/artifacts) or on any network/verification error it logs and
 * does nothing, so it never blocks app startup.
 *
 * The update bundle's minisign signature is verified against the `pubkey` in
 * tauri.conf.json before install — a tampered/incorrectly-signed artifact is
 * rejected by the plugin.
 */
export function useUpdater(): void {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const update = await check();
        if (!update || cancelled) return;
        console.info(`[updater] update available: ${update.version}`);
        await update.downloadAndInstall();
        if (cancelled) return;
        await relaunch();
      } catch (err) {
        // Dev mode, offline, or no update endpoint — non-fatal.
        console.warn("[updater] check/install skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
