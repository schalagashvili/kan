import { z } from "zod";

import { cardTypeSchema, checklistResponseSchema, labelSchema } from "./common";

export const taskFeedSourceSchema = z.object({
  boardPublicId: z.string(),
  boardName: z.string(),
  listPublicId: z.string(),
  listName: z.string(),
});

export const taskFeedCardSchema = z.object({
  publicId: z.string(),
  cardNumber: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: cardTypeSchema,
  dueDate: z.date().nullable(),
  index: z.number(),
  labels: z.array(labelSchema),
  members: z.array(
    z.object({
      publicId: z.string(),
      email: z.string(),
      user: z
        .object({
          name: z.string().nullable(),
          email: z.string(),
        })
        .nullable(),
    }),
  ),
  checklists: z.array(checklistResponseSchema),
});

export const dailyToDoTaskFeedResponseSchema = z.object({
  generatedAt: z.date(),
  source: taskFeedSourceSchema,
  cards: z.array(taskFeedCardSchema),
});

export const dailyToDoTaskFeedKeyResponseSchema = z.object({
  key: z.string(),
  name: z.string().nullable(),
  source: taskFeedSourceSchema,
});
