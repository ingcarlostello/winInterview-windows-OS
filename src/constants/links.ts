// External web links opened from the desktop app via the Tauri `open_url` command.

/**
 * Where the desktop "Upgrade plan" action sends the user. Plans and billing are
 * managed in the separate web app (Clerk + Paddle), not in the desktop app.
 * NOTE: confirm the domain — only the `/upgrade` path was specified.
 */
export const WEBSITE_UPGRADE_URL = "https://wininterview.xyz/upgrade";
