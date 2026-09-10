"use client";

/**
 * useRowDrafts —— 列表「修改后显式点提交才保存」的行级草稿状态。
 *
 * - stage(id, patch)：暂存某行某字段的修改（不写 store，仅本地待提交）
 * - commit(apply)：把全部草稿交给 apply(id, patch) 批量落库，成功后清空草稿，返回提交条数
 * - discard(id?)：撤销单行 / 全部待提交修改
 * - merge(row)：把草稿叠加到原始行上用于列表展示（未提交也能看到改了之后的样子）
 *
 * 用法：
 *   const draftsApi = useRowDrafts<WorkOrder>();
 *   dataSource = rows.map(draftsApi.merge);
 *   <button onClick={() => draftsApi.commit((id, p) => updateWorkOrder(id, { ...p, updatedAt: now }))}>
 */
import { useCallback, useRef, useState } from "react";

export interface RowDraftsApi<Row extends { id: string }> {
  /** 当前草稿：rowId -> 该行待提交的字段补丁 */
  drafts: Record<string, Partial<Row>>;
  /** 暂存一行若干字段的修改 */
  stage: (id: string, patch: Partial<Row>) => void;
  /** 撤销某行（传 id）或全部（不传）待提交修改 */
  discard: (id?: string) => void;
  /** 是否该行某字段处于待提交状态 */
  isFieldDirty: (id: string, field: keyof Row) => boolean;
  /** 待提交行数 */
  count: number;
  /** 把草稿叠加到原始行（列表展示用；不改原始数据） */
  merge: (row: Row) => Row;
  /** 批量落库：apply(id, patch) 会逐行调用；成功后清空草稿并返回提交的行数 */
  commit: (apply: (id: string, patch: Partial<Row>) => void) => number;
  /**
   * 异步批量落库（接真实 API 用）：apply 返回 Promise，逐行并发提交；
   * 全部成功后才清空草稿并返回提交行数 —— 任一行失败则草稿保留，用户可重试。
   */
  commitAsync: (
    apply: (id: string, patch: Partial<Row>) => Promise<void>,
  ) => Promise<number>;
}

export function useRowDrafts<Row extends { id: string }>(): RowDraftsApi<Row> {
  const [drafts, setDrafts] = useState<Record<string, Partial<Row>>>({});

  // 供 commit 读取最新草稿，避免闭包过期
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const stage = useCallback((id: string, patch: Partial<Row>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }, []);

  const discard = useCallback((id?: string) => {
    setDrafts((prev) => {
      if (id === undefined) return {};
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const isFieldDirty = useCallback(
    (id: string, field: keyof Row) => {
      const d = draftsRef.current[id];
      return !!d && Object.prototype.hasOwnProperty.call(d, field);
    },
    [],
  );

  const merge = useCallback(
    (row: Row): Row => {
      const patch = draftsRef.current[row.id];
      return patch ? { ...row, ...patch } : row;
    },
    [],
  );

  const commit = useCallback(
    (apply: (id: string, patch: Partial<Row>) => void): number => {
      const ds = draftsRef.current;
      const ids = Object.keys(ds);
      ids.forEach((id) => apply(id, ds[id] as Partial<Row>));
      setDrafts({});
      return ids.length;
    },
    [],
  );

  const commitAsync = useCallback(
    async (
      apply: (id: string, patch: Partial<Row>) => Promise<void>,
    ): Promise<number> => {
      const ds = draftsRef.current;
      const ids = Object.keys(ds);
      if (!ids.length) return 0;
      // 并发提交；任一失败即抛出（草稿不清空，便于修正后重试）
      await Promise.all(ids.map((id) => apply(id, ds[id] as Partial<Row>)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      return ids.length;
    },
    [],
  );

  return {
    drafts,
    stage,
    discard,
    isFieldDirty,
    count: Object.keys(drafts).length,
    merge,
    commit,
    commitAsync,
  };
}
