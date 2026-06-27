/**
 * Zod schema for the Telegram `Update` and field extraction (R1.6, R1.8, R1.9).
 *
 * The webhook validates the request body against {@link updateSchema} *before*
 * touching any field (R1.6). The schema recognizes the four update types the
 * bot subscribes to — `message`, `edited_message`, `channel_post`,
 * `edited_channel_post` (R1.8) — and {@link extractUpdate} pulls the relevant
 * fields out of whichever one is present: `update_id`, `message_id`, `chat.id`,
 * `text`, `caption`, `photo`, `date`, `edit_date`, `entities` and
 * `caption_entities` (R1.9).
 *
 * The `photo[]` element type is the shared {@link TelegramPhoto} from
 * `lib/telegram/files`, so the Image Processor and the webhook agree on a single
 * definition. Unknown extra fields are tolerated (`.passthrough()`): Telegram
 * adds fields over time and a strict shape would reject otherwise-valid updates.
 */

import { z } from "zod";

import type { TelegramPhoto } from "@/lib/telegram/files";

/** A Telegram `PhotoSize`. Mirrors {@link TelegramPhoto}. */
export const photoSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  width: z.number(),
  height: z.number(),
  file_size: z.number().optional(),
});

/** A Telegram `MessageEntity` (only the fields the parser may use). */
export const messageEntitySchema = z
  .object({
    type: z.string(),
    offset: z.number(),
    length: z.number(),
    url: z.string().optional(),
  })
  .passthrough();

/** A Telegram `Message` (or channel post). Extra fields are tolerated. */
export const messageSchema = z
  .object({
    message_id: z.number(),
    date: z.number(),
    edit_date: z.number().optional(),
    chat: z.object({ id: z.number() }).passthrough(),
    text: z.string().optional(),
    caption: z.string().optional(),
    photo: z.array(photoSchema).optional(),
    entities: z.array(messageEntitySchema).optional(),
    caption_entities: z.array(messageEntitySchema).optional(),
  })
  .passthrough();

/** A Telegram `Update` carrying at most one of the four recognized message kinds. */
export const updateSchema = z
  .object({
    update_id: z.number(),
    message: messageSchema.optional(),
    edited_message: messageSchema.optional(),
    channel_post: messageSchema.optional(),
    edited_channel_post: messageSchema.optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof updateSchema>;
export type TelegramMessage = z.infer<typeof messageSchema>;
export type MessageEntity = z.infer<typeof messageEntitySchema>;

/** The four update kinds the bot subscribes to (R1.8). */
export type UpdateKind = "message" | "edited_message" | "channel_post" | "edited_channel_post";

/** Kinds that represent an edit of a previously-sent message (R7.6, R7.7). */
export const EDITED_KINDS: readonly UpdateKind[] = ["edited_message", "edited_channel_post"];

/** Priority order for picking the message out of an update. */
const UPDATE_KINDS: readonly UpdateKind[] = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
];

/** The fields extracted from an update (R1.9), normalized for the pipeline. */
export interface ExtractedUpdate {
  updateId: number;
  kind: UpdateKind;
  /** `true` for `edited_message`/`edited_channel_post` (drives audit logging). */
  isEdit: boolean;
  messageId: number;
  chatId: number;
  text: string | null;
  caption: string | null;
  /** Always an array (empty when absent); element type matches the Image Processor. */
  photo: TelegramPhoto[];
  date: number;
  editDate: number | null;
  entities: MessageEntity[];
  captionEntities: MessageEntity[];
}

/**
 * Extracts the relevant fields (R1.9) from whichever recognized message a valid
 * update carries, in priority order. Returns `null` when the update has none of
 * the four message kinds (e.g. a callback query or other unsupported update),
 * which the caller treats as a silently-ignored technical event.
 */
export function extractUpdate(update: TelegramUpdate): ExtractedUpdate | null {
  for (const kind of UPDATE_KINDS) {
    const message = update[kind];
    if (message === undefined) continue;
    return {
      updateId: update.update_id,
      kind,
      isEdit: EDITED_KINDS.includes(kind),
      messageId: message.message_id,
      chatId: message.chat.id,
      text: message.text ?? null,
      caption: message.caption ?? null,
      photo: message.photo ?? [],
      date: message.date,
      editDate: message.edit_date ?? null,
      entities: message.entities ?? [],
      captionEntities: message.caption_entities ?? [],
    };
  }
  return null;
}

/** Discriminated result of {@link parseUpdate}. */
export type ParseUpdateResult =
  | { ok: true; update: TelegramUpdate }
  | { ok: false; error: z.ZodError };

/**
 * Validates an unknown request body against {@link updateSchema} (R1.6). On
 * failure it returns the `ZodError` so the caller can log a *technical* event
 * (issue paths/codes — never personal data or secrets) and respond 400 (R1.7).
 */
export function parseUpdate(raw: unknown): ParseUpdateResult {
  const result = updateSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, update: result.data };
  }
  return { ok: false, error: result.error };
}
