import { expect, test } from "@playwright/test";
import { gymDurationMinutes, clockFromStamp, isDateKey, normalizeClock, stampEndFromDateAndClock, stampFromDateAndClock } from "../shared/log.ts";

test("Safari iOS manda HH:MM:SS y se normaliza", () => {
  expect(normalizeClock("07:30:00")).toBe("07:30");
  expect(normalizeClock("7:05")).toBe("07:05");
  expect(normalizeClock("19:45:12.500")).toBe("19:45");
  expect(normalizeClock("24:00")).toBeNull();
  expect(stampFromDateAndClock("2026-08-16", "07:30:00")).toMatch(/T/);
  const stamp = stampFromDateAndClock("2026-08-16", "07:30");
  expect(clockFromStamp(stamp)).toBe("07:30");
});

test("término después de medianoche cuenta en el mismo gym", () => {
  const start = stampFromDateAndClock("2026-08-16", "22:00");
  const end = stampEndFromDateAndClock("2026-08-16", "00:30", start);
  expect(gymDurationMinutes(start, end)).toBe(150);
  expect(isDateKey("2026-02-31")).toBe(false);
  expect(isDateKey("2026-08-16")).toBe(true);
});
