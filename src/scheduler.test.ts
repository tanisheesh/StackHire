import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { startScheduler } from "./scheduler";
import type { SchedulerConfig } from "./types";

describe("startScheduler", () => {
  let originalSetInterval: typeof setInterval;
  let capturedCallback: (() => void) | null = null;
  let capturedInterval: number | null = null;

  beforeEach(() => {
    originalSetInterval = globalThis.setInterval;
    capturedCallback = null;
    capturedInterval = null;

    // @ts-ignore
    globalThis.setInterval = (cb: () => void, ms: number) => {
      capturedCallback = cb;
      capturedInterval = ms;
      return 0;
    };
  });

  afterEach(() => {
    globalThis.setInterval = originalSetInterval;
  });

  it("uses 6-hour default interval (Requirement 5.3)", () => {
    const sendMessage = mock(async () => {});
    const config: SchedulerConfig = {
      intervalHours: 6,
      operatorChatId: "op123",
      bot: { telegram: { sendMessage } },
    };

    startScheduler(config, async () => {});

    expect(capturedInterval).toBe(6 * 60 * 60 * 1000);
  });

  it("respects custom interval hours", () => {
    const sendMessage = mock(async () => {});
    const config: SchedulerConfig = {
      intervalHours: 12,
      operatorChatId: "op123",
      bot: { telegram: { sendMessage } },
    };

    startScheduler(config, async () => {});

    expect(capturedInterval).toBe(12 * 60 * 60 * 1000);
  });

  it("sends operator alert when scraper throws (Requirement 8.2)", async () => {
    const sendMessage = mock(async () => {});
    const config: SchedulerConfig = {
      intervalHours: 6,
      operatorChatId: "op456",
      bot: { telegram: { sendMessage } },
    };

    const failingScraper = async () => {
      throw new Error("all portals failed");
    };

    startScheduler(config, failingScraper);

    // Trigger the interval callback manually
    await (capturedCallback as unknown as () => Promise<void>)();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe("op456");
    expect(text).toContain("All scrapers failed");
    expect(text).toContain("all portals failed");
  });

  it("does not send alert when scraper succeeds", async () => {
    const sendMessage = mock(async () => {});
    const config: SchedulerConfig = {
      intervalHours: 6,
      operatorChatId: "op789",
      bot: { telegram: { sendMessage } },
    };

    startScheduler(config, async () => {});

    await (capturedCallback as unknown as () => Promise<void>)();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
