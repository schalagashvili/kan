import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as taskFeedRepo from "@kan/db/repository/taskFeed.repo";

import { assertPermission } from "../utils/permissions";

vi.mock("@kan/db/repository/taskFeed.repo", () => ({
  getDailyToDoFeedCards: vi.fn(),
  getTaskFeedSource: vi.fn(),
}));

vi.mock("../utils/permissions", () => ({
  assertPermission: vi.fn(),
}));

const mockGetDailyToDoFeedCards =
  taskFeedRepo.getDailyToDoFeedCards as ReturnType<typeof vi.fn>;
const mockGetTaskFeedSource = taskFeedRepo.getTaskFeedSource as ReturnType<
  typeof vi.fn
>;
const mockAssertPermission = assertPermission as ReturnType<typeof vi.fn>;

describe("task feed router", () => {
  const mockDb = {} as never;
  const mockUser = {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
  };
  const mockSource = {
    boardPublicId: "board-123456",
    boardName: "Product",
    listId: 1,
    listPublicId: "list-1234567",
    listName: "To Do",
    workspaceId: 1,
  };
  const mockAuth = {
    api: {
      verifyApiKey: vi.fn(),
      createApiKey: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertPermission.mockResolvedValue(undefined);
  });

  const createCtx = (headers = new Headers()) =>
    ({
      user: null,
      db: mockDb,
      headers,
      auth: mockAuth,
    }) as never;

  describe("dailyToDo", () => {
    it("requires an API key", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      await expect(
        taskFeedRouter.createCaller(createCtx()).dailyToDo(),
      ).rejects.toThrow(TRPCError);
    });

    it("rejects a key without task feed permission", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      mockAuth.api.verifyApiKey.mockResolvedValueOnce({
        valid: false,
        error: { message: "API Key not found", code: "KEY_NOT_FOUND" },
        key: null,
      });

      await expect(
        taskFeedRouter
          .createCaller(
            createCtx(new Headers({ authorization: "Bearer broad-key" })),
          )
          .dailyToDo(),
      ).rejects.toThrow(TRPCError);

      expect(mockAuth.api.verifyApiKey).toHaveBeenCalledWith({
        key: "broad-key",
        permissions: { taskFeed: ["read"] },
      });
    });

    it("rejects malformed key metadata", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      mockAuth.api.verifyApiKey.mockResolvedValueOnce({
        valid: true,
        error: null,
        key: {
          userId: "user-123",
          metadata: { integration: "other" },
        },
      });

      await expect(
        taskFeedRouter
          .createCaller(createCtx(new Headers({ "x-api-key": "scoped-key" })))
          .dailyToDo(),
      ).rejects.toThrow(TRPCError);
    });

    it("returns active cards for the scoped list", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      mockAuth.api.verifyApiKey.mockResolvedValueOnce({
        valid: true,
        error: null,
        key: {
          userId: "user-123",
          metadata: {
            integration: "daily-to-do",
            boardPublicId: mockSource.boardPublicId,
            listPublicId: mockSource.listPublicId,
          },
        },
      });
      mockGetTaskFeedSource.mockResolvedValueOnce(mockSource);
      mockGetDailyToDoFeedCards.mockResolvedValueOnce([
        {
          publicId: "card-123456",
          cardNumber: 42,
          title: "Ship task feed",
          description: null,
          type: "coding",
          dueDate: null,
          index: 0,
          labels: [],
          members: [],
          checklists: [],
        },
      ]);

      const result = await taskFeedRouter
        .createCaller(
          createCtx(new Headers({ authorization: "Bearer scoped" })),
        )
        .dailyToDo();

      expect(result.source.listName).toBe("To Do");
      expect(result.cards).toHaveLength(1);
      expect(mockGetTaskFeedSource).toHaveBeenCalledWith(mockDb, {
        boardPublicId: mockSource.boardPublicId,
        listPublicId: mockSource.listPublicId,
      });
      expect(mockAssertPermission).toHaveBeenCalledWith(
        mockDb,
        "user-123",
        mockSource.workspaceId,
        "board:view",
      );
      expect(mockGetDailyToDoFeedCards).toHaveBeenCalledWith(
        mockDb,
        mockSource.listId,
      );
    });
  });

  describe("createDailyToDoKey", () => {
    it("creates a server-side scoped key", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      mockGetTaskFeedSource.mockResolvedValueOnce(mockSource);
      mockAuth.api.createApiKey.mockResolvedValueOnce({
        key: "kan_feed_secret",
        name: "Daily To Do feed",
      });

      const result = await taskFeedRouter
        .createCaller({
          user: mockUser,
          db: mockDb,
          headers: new Headers(),
          auth: mockAuth,
        } as never)
        .createDailyToDoKey({
          boardPublicId: mockSource.boardPublicId,
          listPublicId: mockSource.listPublicId,
        });

      expect(result.key).toBe("kan_feed_secret");
      expect(mockAuth.api.createApiKey).toHaveBeenCalledWith({
        userId: mockUser.id,
        name: "Daily To Do feed",
        prefix: "kan_feed_",
        metadata: {
          integration: "daily-to-do",
          boardPublicId: mockSource.boardPublicId,
          listPublicId: mockSource.listPublicId,
        },
        permissions: { taskFeed: ["read"] },
      });
    });

    it("rejects a list from a different board", async () => {
      const { taskFeedRouter } = await import("./taskFeed");

      mockGetTaskFeedSource.mockResolvedValueOnce(null);

      await expect(
        taskFeedRouter
          .createCaller({
            user: mockUser,
            db: mockDb,
            headers: new Headers(),
            auth: mockAuth,
          } as never)
          .createDailyToDoKey({
            boardPublicId: mockSource.boardPublicId,
            listPublicId: mockSource.listPublicId,
          }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
