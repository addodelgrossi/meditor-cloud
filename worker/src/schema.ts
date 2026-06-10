import { z } from "zod";

// Mirrors MermaidTheme in the macOS app
// (Sources/Meditor/Models/EditorModels.swift). Keep these in sync.
export const THEMES = ["default", "neutral", "dark", "forest", "base"] as const;

// Closed list of allowed lifetimes: 1 hour, 24 hours, 7 days.
export const TTL_SECONDS = [3600, 86_400, 604_800] as const;

export const MAX_CODE_BYTES = 50 * 1024; // 50 KB
export const MAX_OG_IMAGE_BYTES = 500 * 1024; // 500 KB, checked after base64 decode

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

export const shareRequestSchema = z.object({
  version: z.literal(1),
  code: z
    .string()
    .min(1, "code is empty")
    .refine((value) => utf8Bytes(value) <= MAX_CODE_BYTES, {
      message: `code exceeds ${MAX_CODE_BYTES} bytes`,
    }),
  // Validated for size and PNG magic bytes after decode (see crypto.decodeBase64Png).
  // The character-length bound here is a cheap guard before we allocate.
  ogImage: z.string().max(Math.ceil((MAX_OG_IMAGE_BYTES * 4) / 3) + 4, "ogImage is too large"),
  ttlSeconds: z.union([z.literal(3600), z.literal(86_400), z.literal(604_800)]),
  theme: z.enum(THEMES),
});

export type ShareRequest = z.infer<typeof shareRequestSchema>;

/** Shape stored in KV at `s:{id}`. */
export interface ShareRecord {
  code: string;
  theme: (typeof THEMES)[number];
  createdAt: number;
  expiresAt: number;
  deleteTokenHash: string;
}
