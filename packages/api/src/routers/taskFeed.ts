import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as taskFeedRepo from "@kan/db/repository/taskFeed.repo";

import {
  dailyToDoTaskFeedKeyResponseSchema,
  dailyToDoTaskFeedResponseSchema,
} from "../schemas";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { assertPermission } from "../utils/permissions";

const TASK_FEED_PERMISSIONS = { taskFeed: ["read"] };
const TASK_FEED_KEY_PREFIX = "kan_feed_";
const DAILY_TO_DO_INTEGRATION = "daily-to-do";

const taskFeedMetadataSchema = z.object({
  integration: z.literal(DAILY_TO_DO_INTEGRATION),
  boardPublicId: z.string().min(12),
  listPublicId: z.string().min(12),
});

const extractApiKey = (headers: Headers) => {
  const authorization = headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return bearerMatch[1].trim();

  return headers.get("x-api-key")?.trim() ?? null;
};

export const taskFeedRouter = createTRPCRouter({
  dailyToDo: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/task-feeds/daily-to-do",
        summary: "Get daily To Do task feed",
        description:
          "Returns active cards from the To Do list configured on a scoped task-feed API key",
        tags: ["Task Feeds"],
        protect: true,
      },
    })
    .input(z.void())
    .output(dailyToDoTaskFeedResponseSchema)
    .query(async ({ ctx }) => {
      const key = extractApiKey(ctx.headers);

      if (!key) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Task feed API key is required",
        });
      }

      const verification = await ctx.auth.api.verifyApiKey({
        key,
        permissions: TASK_FEED_PERMISSIONS,
      });

      if (!verification.valid || !verification.key) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid task feed API key",
        });
      }

      const metadataResult = taskFeedMetadataSchema.safeParse(
        verification.key.metadata,
      );

      if (!metadataResult.success) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Task feed API key metadata is invalid",
        });
      }

      const source = await taskFeedRepo.getTaskFeedSource(ctx.db, {
        boardPublicId: metadataResult.data.boardPublicId,
        listPublicId: metadataResult.data.listPublicId,
      });

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task feed source was not found",
        });
      }

      await assertPermission(
        ctx.db,
        verification.key.userId,
        source.workspaceId,
        "board:view",
      );

      const cards = await taskFeedRepo.getDailyToDoFeedCards(
        ctx.db,
        source.listId,
      );

      return {
        generatedAt: new Date(),
        source: {
          boardPublicId: source.boardPublicId,
          boardName: source.boardName,
          listPublicId: source.listPublicId,
          listName: source.listName,
        },
        cards,
      };
    }),
  createDailyToDoKey: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/task-feeds/daily-to-do/keys",
        summary: "Create daily To Do task feed key",
        description:
          "Creates a scoped read-only API key for a board/list daily To Do task feed",
        tags: ["Task Feeds"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        listPublicId: z.string().min(12),
        name: z.string().min(1).max(32).optional(),
      }),
    )
    .output(dailyToDoTaskFeedKeyResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const source = await taskFeedRepo.getTaskFeedSource(ctx.db, {
        boardPublicId: input.boardPublicId,
        listPublicId: input.listPublicId,
      });

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task feed source was not found",
        });
      }

      await assertPermission(ctx.db, userId, source.workspaceId, "board:view");

      const apiKey = await ctx.auth.api.createApiKey({
        userId,
        name: input.name ?? "Daily To Do feed",
        prefix: TASK_FEED_KEY_PREFIX,
        metadata: {
          integration: DAILY_TO_DO_INTEGRATION,
          boardPublicId: source.boardPublicId,
          listPublicId: source.listPublicId,
        },
        permissions: TASK_FEED_PERMISSIONS,
      });

      return {
        key: apiKey.key,
        name: apiKey.name,
        source: {
          boardPublicId: source.boardPublicId,
          boardName: source.boardName,
          listPublicId: source.listPublicId,
          listName: source.listName,
        },
      };
    }),
});
