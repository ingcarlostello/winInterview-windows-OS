import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop de los downgrades programados: cada día aplica los que ya vencieron por
// si el webhook de renovación de Paddle no llegó. El camino normal lo resuelve el
// webhook `subscription.*`; este cron solo cubre eventos perdidos.
crons.daily(
  "apply-due-downgrades",
  { hourUTC: 6, minuteUTC: 0 },
  internal.users.applyDuePendingDowngrades,
  {}
);

export default crons;
