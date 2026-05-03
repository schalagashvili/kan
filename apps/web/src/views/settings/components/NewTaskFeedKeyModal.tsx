import { t } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  HiInformationCircle,
  HiMiniCheck,
  HiOutlineDocumentDuplicate,
  HiXMark,
} from "react-icons/hi2";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useClipboard } from "~/hooks/useClipboard";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export default function NewTaskFeedKeyModal() {
  const defaultName = t`Daily To Do feed`;
  const { closeModal } = useModal();
  const { copied, copy } = useClipboard({ timeout: 2000 });
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const [name, setName] = useState(defaultName);
  const [boardPublicId, setBoardPublicId] = useState("");
  const [listPublicId, setListPublicId] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<{
    key: string;
    name: string | null;
    boardName: string;
    listName: string;
  } | null>(null);

  const boardsQuery = api.board.all.useQuery(
    {
      workspacePublicId: workspace.publicId,
      type: "regular",
      archived: false,
    },
    { enabled: Boolean(workspace.publicId) },
  );

  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const selectedBoard = useMemo(
    () => boards.find((board) => board.publicId === boardPublicId),
    [boardPublicId, boards],
  );
  const selectedLists = selectedBoard?.lists ?? [];

  useEffect(() => {
    if (!boardPublicId && boards[0]) {
      setBoardPublicId(boards[0].publicId);
    }
  }, [boardPublicId, boards]);

  useEffect(() => {
    if (!selectedBoard) {
      setListPublicId("");
      return;
    }

    const listExists = selectedBoard.lists.some(
      (list) => list.publicId === listPublicId,
    );

    if (!listExists) {
      const todoList =
        selectedBoard.lists.find(
          (list) => list.name.trim().toLowerCase() === "to do",
        ) ?? selectedBoard.lists[0];
      setListPublicId(todoList?.publicId ?? "");
    }
  }, [listPublicId, selectedBoard]);

  const createTaskFeedKey = api.taskFeed.createDailyToDoKey.useMutation({
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      setCreatedApiKey({
        key: result.key,
        name: result.name,
        boardName: result.source.boardName,
        listName: result.source.listName,
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to create task feed key`,
        message: t`Please check your board access and try again.`,
        icon: "error",
      });
    },
  });

  if (createdApiKey) {
    return (
      <div>
        <div className="px-5 pt-5">
          <div className="flex w-full items-center justify-between pb-4 text-neutral-900 dark:text-dark-1000">
            <h2 className="text-sm font-bold">{t`Task feed key created`}</h2>
            <button
              type="button"
              className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
              onClick={(e) => {
                e.preventDefault();
                closeModal();
              }}
            >
              <HiXMark
                size={18}
                className="text-light-900 dark:text-dark-900"
              />
            </button>
          </div>

          <div className="mb-4">
            <div className="mb-3 rounded-md border border-light-600 bg-light-100 px-3 py-2 text-xs text-light-900 dark:border-dark-600 dark:bg-dark-200 dark:text-dark-900">
              {t`Source`}: {createdApiKey.boardName} / {createdApiKey.listName}
            </div>
            <div className="relative">
              <Input
                value={createdApiKey.key}
                className="pr-10 text-sm text-light-900 dark:text-dark-900"
                readOnly
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-light-900 hover:text-light-950 dark:text-dark-900 dark:hover:text-dark-950"
                onClick={() => copy(createdApiKey.key)}
              >
                {copied ? (
                  <HiMiniCheck className="h-5 w-5 text-green-600" />
                ) : (
                  <HiOutlineDocumentDuplicate className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-start gap-1">
              <HiInformationCircle className="mt-0.5 h-4 w-4 text-dark-900" />
              <p className="text-xs text-gray-500 dark:text-dark-900">
                {t`This API key will only be shown once. Please save it in a secure location.`}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
          <Button onClick={() => closeModal()}>{t`Close`}</Button>
        </div>
      </div>
    );
  }

  const canCreate =
    Boolean(boardPublicId) && Boolean(listPublicId) && name.trim().length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canCreate) return;
        createTaskFeedKey.mutate({
          name: name.trim(),
          boardPublicId,
          listPublicId,
        });
      }}
    >
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4 text-neutral-900 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`New task feed key`}</h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        <div className="space-y-4">
          <Input
            value={name}
            placeholder={t`API key name`}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
          />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-light-900 dark:text-dark-900">
              {t`Board`}
            </span>
            <select
              value={boardPublicId}
              disabled={boardsQuery.isLoading || boards.length === 0}
              onChange={(event) => setBoardPublicId(event.target.value)}
              className="block w-full rounded-md border-0 bg-dark-300 bg-white/5 px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700"
            >
              {boards.map((board) => (
                <option key={board.publicId} value={board.publicId}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-light-900 dark:text-dark-900">
              {t`List`}
            </span>
            <select
              value={listPublicId}
              disabled={selectedLists.length === 0}
              onChange={(event) => setListPublicId(event.target.value)}
              className="block w-full rounded-md border-0 bg-dark-300 bg-white/5 px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700"
            >
              {selectedLists.map((list) => (
                <option key={list.publicId} value={list.publicId}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>

          {boardsQuery.isLoading && (
            <p className="text-xs text-light-900 dark:text-dark-900">
              {t`Loading boards...`}
            </p>
          )}
          {!boardsQuery.isLoading && boards.length === 0 && (
            <p className="text-xs text-light-900 dark:text-dark-900">
              {t`No boards are available in this workspace.`}
            </p>
          )}
        </div>
      </div>
      <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <Button
          type="submit"
          disabled={!canCreate}
          isLoading={createTaskFeedKey.isPending}
        >
          {t`Create task feed key`}
        </Button>
      </div>
    </form>
  );
}
