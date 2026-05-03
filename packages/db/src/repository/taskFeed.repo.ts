import { and, asc, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  boards,
  cards,
  checklistItems,
  checklists,
  lists,
} from "@kan/db/schema";

export const getTaskFeedSource = async (
  db: dbClient,
  args: {
    boardPublicId: string;
    listPublicId: string;
  },
) => {
  const [source] = await db
    .select({
      boardPublicId: boards.publicId,
      boardName: boards.name,
      listId: lists.id,
      listPublicId: lists.publicId,
      listName: lists.name,
      workspaceId: boards.workspaceId,
    })
    .from(lists)
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(
      and(
        eq(boards.publicId, args.boardPublicId),
        eq(lists.publicId, args.listPublicId),
        isNull(boards.deletedAt),
        isNull(lists.deletedAt),
      ),
    );

  return source ?? null;
};

export const getDailyToDoFeedCards = async (db: dbClient, listId: number) => {
  const feedCards = await db.query.cards.findMany({
    columns: {
      publicId: true,
      cardNumber: true,
      title: true,
      description: true,
      type: true,
      dueDate: true,
      index: true,
    },
    where: and(eq(cards.listId, listId), isNull(cards.deletedAt)),
    orderBy: asc(cards.index),
    with: {
      labels: {
        with: {
          label: {
            columns: {
              publicId: true,
              name: true,
              colourCode: true,
              deletedAt: true,
            },
          },
        },
      },
      members: {
        with: {
          member: {
            columns: {
              publicId: true,
              email: true,
              status: true,
              deletedAt: true,
            },
            with: {
              user: {
                columns: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      checklists: {
        columns: {
          publicId: true,
          name: true,
          index: true,
        },
        where: isNull(checklists.deletedAt),
        orderBy: asc(checklists.index),
        with: {
          items: {
            columns: {
              publicId: true,
              title: true,
              completed: true,
              index: true,
            },
            where: isNull(checklistItems.deletedAt),
            orderBy: asc(checklistItems.index),
          },
        },
      },
    },
  });

  return feedCards.map((card) => ({
    publicId: card.publicId,
    cardNumber: card.cardNumber,
    title: card.title,
    description: card.description,
    type: card.type,
    dueDate: card.dueDate,
    index: card.index,
    labels: card.labels
      .map((cardLabel) => cardLabel.label)
      .filter((label) => !label.deletedAt)
      .map(({ deletedAt: _deletedAt, ...label }) => label),
    members: card.members
      .map((cardMember) => cardMember.member)
      .filter((member) => !member.deletedAt && member.status !== "removed")
      .map(({ deletedAt: _deletedAt, status: _status, user, ...member }) => ({
        ...member,
        user: user
          ? {
              name: user.name,
              email: user.email,
            }
          : null,
      })),
    checklists: card.checklists,
  }));
};
