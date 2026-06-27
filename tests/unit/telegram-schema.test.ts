import { describe, expect, it } from "vitest";

import {
  EDITED_KINDS,
  extractUpdate,
  parseUpdate,
  type UpdateKind,
} from "@/lib/telegram/schema";

/**
 * Example unit tests for the Telegram Update schema + extraction (Task 14.4,
 * R1.6, R1.8, R1.9). They confirm the four recognized update kinds, field
 * extraction and rejection of malformed bodies.
 */

const ALL_KINDS: UpdateKind[] = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
];

function rawUpdate(kind: UpdateKind): unknown {
  return {
    update_id: 42,
    [kind]: {
      message_id: 7,
      date: 1_700_000_000,
      chat: { id: 5054325626 },
      text: "hello",
      photo: [{ file_id: "f", file_unique_id: "u", width: 100, height: 100 }],
    },
  };
}

describe("parseUpdate", () => {
  it("accepts all four recognized update kinds (R1.8)", () => {
    for (const kind of ALL_KINDS) {
      const result = parseUpdate(rawUpdate(kind));
      expect(result.ok).toBe(true);
    }
  });

  it("tolerates unknown extra fields (forward-compatible)", () => {
    const result = parseUpdate({
      update_id: 1,
      some_future_field: { anything: true },
      message: { message_id: 1, date: 1, chat: { id: 1, type: "private" }, text: "x" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a body missing update_id with a ZodError (R1.6, R1.7)", () => {
    const result = parseUpdate({ message: { message_id: 1, date: 1, chat: { id: 1 } } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects a malformed message (missing required fields)", () => {
    const result = parseUpdate({ update_id: 1, message: { text: "no id or chat" } });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(parseUpdate(null).ok).toBe(false);
    expect(parseUpdate("string").ok).toBe(false);
    expect(parseUpdate(123).ok).toBe(false);
  });
});

describe("extractUpdate", () => {
  it("extracts the relevant fields from a plain message (R1.9)", () => {
    const parsed = parseUpdate(rawUpdate("message"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const extracted = extractUpdate(parsed.update);
    expect(extracted).not.toBeNull();
    if (extracted === null) return;

    expect(extracted.updateId).toBe(42);
    expect(extracted.kind).toBe("message");
    expect(extracted.isEdit).toBe(false);
    expect(extracted.messageId).toBe(7);
    expect(extracted.chatId).toBe(5054325626);
    expect(extracted.text).toBe("hello");
    expect(extracted.photo).toHaveLength(1);
    expect(extracted.photo[0].file_id).toBe("f");
  });

  it("flags edited kinds as edits (R7.6, R7.7)", () => {
    for (const kind of EDITED_KINDS) {
      const parsed = parseUpdate(rawUpdate(kind));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const extracted = extractUpdate(parsed.update);
      expect(extracted?.isEdit).toBe(true);
    }
  });

  it("returns null for an update with no recognized message", () => {
    const parsed = parseUpdate({ update_id: 99, callback_query: { id: "cb" } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(extractUpdate(parsed.update)).toBeNull();
  });

  it("defaults absent text/caption/photo to null/empty", () => {
    const parsed = parseUpdate({
      update_id: 5,
      message: { message_id: 2, date: 1, chat: { id: 5054325626 } },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const extracted = extractUpdate(parsed.update);
    expect(extracted?.text).toBeNull();
    expect(extracted?.caption).toBeNull();
    expect(extracted?.photo).toEqual([]);
  });
});
