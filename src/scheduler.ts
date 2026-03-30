import type { SchedulerConfig } from "./types";

const DEFAULT_INTERVAL_HOURS = 6;

export function startScheduler(
  config: SchedulerConfig,
  scraper: () => Promise<void>
): void {
  const intervalMs =
    (config.intervalHours ?? DEFAULT_INTERVAL_HOURS) * 60 * 60 * 1000;

  console.log(
    JSON.stringify({
      level: "info",
      message: "Scheduler started",
      intervalHours: config.intervalHours ?? DEFAULT_INTERVAL_HOURS,
      timestamp: new Date().toISOString(),
    })
  );

  setInterval(async () => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Scraper run started",
        timestamp: new Date().toISOString(),
      })
    );

    try {
      await scraper();

      console.log(
        JSON.stringify({
          level: "info",
          message: "Scraper run completed",
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      console.error(
        JSON.stringify({
          level: "critical",
          message: "All scrapers failed",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })
      );

      try {
        await config.bot.telegram.sendMessage(
          config.operatorChatId,
          `🚨 CRITICAL: All scrapers failed at ${new Date().toISOString()}.\nError: ${errorMessage}`
        );
      } catch (alertErr) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to send operator alert",
            error: alertErr instanceof Error ? alertErr.message : String(alertErr),
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  }, intervalMs);
}
