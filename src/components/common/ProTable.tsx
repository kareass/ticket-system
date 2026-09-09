"use client";

/**
 * ProTable —— 基于 antd Table 的表格封装，为列表页提供：
 * 1. 表头**拖拽调整列顺序**（把鼠标放在列标题上按住左右拖动）
 * 2. 表头**右缘拖拽调整列宽**（鼠标移到列标题右边界出现竖线手柄后左右拖动）
 * 3. 保留 antd `fixed: 'right'` 固定列（如「操作」列固定在最右，不参与排序/调宽）
 *
 * 用法：与 antd Table 一致，额外传入 `columns`（每列需带唯一 `key` 或 `dataIndex`；
 * 需要拖宽/拖排序的列建议给数值 `width`，无 width 的列只支持排序不支持拖宽）。
 * `scroll={{ x }}` 仍用于横向滚动，固定列始终钉在最右侧。
 *
 * 拖拽/拖宽均为纯前端表现层状态（列序、列宽只影响本组件内），不写回数据。
 */
import React, {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Table } from "antd";
import type { ColumnType, ColumnsType, TableProps } from "antd/es/table";

type RecordTypeOf = object;

export interface ProTableProps<RecordType extends RecordTypeOf>
  extends Omit<TableProps<RecordType>, "columns" | "components"> {
  columns: ColumnsType<RecordType>;
  /** 拖拽收缩的最小列宽（px），默认 60 */
  minColumnWidth?: number;
}

type AnyCol<RecordType extends RecordTypeOf> = ColumnType<RecordType> & {
  key?: React.Key;
  dataIndex?: unknown;
  width?: number | string;
  fixed?: boolean | "left" | "right";
};

/** 稳定列标识：优先 key，其次 dataIndex（字符串化）；都没有则报错要求补 key */
function colKeyOf<RecordType extends RecordTypeOf>(
  col: AnyCol<RecordType>,
): string {
  if (col.key !== undefined && col.key !== null) return String(col.key);
  if (col.dataIndex !== undefined && col.dataIndex !== null) {
    return String(col.dataIndex);
  }
  throw new Error(
    "[ProTable] 每列需提供唯一 key 或 dataIndex，否则无法进行拖拽排序/定位。",
  );
}

/** 数字列宽（非数值宽度返回 undefined，即不可拖宽的自动列） */
function numericWidthOf<RecordType extends RecordTypeOf>(
  col: AnyCol<RecordType>,
): number | undefined {
  return typeof col.width === "number" ? col.width : undefined;
}

/* ------------------------------------------------------------------ */
/* 表头单元格：普通列 = 标题可拖排序 + 右缘手柄拖宽；固定列 = 原样输出   */
/* ------------------------------------------------------------------ */
interface HeaderCellProps {
  children?: ReactNode;
  dataKey?: string; // 可拖拽/拖宽的普通列才带 dataKey
  width?: number; // 该列当前宽（由 ProTable 注入）
  onMove?: (fromKey: string, toKey: string) => void;
  onMoveEnd?: () => void;
  onResizeWidth?: (key: string, nextWidth: number) => void;
  minColumnWidth?: number;
  // antd/rc-table 透传的剩余 th 属性（className/style/rowSpan 等）
  [rest: string]: unknown;
}

function HeaderCell(props: HeaderCellProps) {
  const {
    children,
    dataKey,
    width,
    onMove,
    onMoveEnd,
    onResizeWidth,
    minColumnWidth,
    ...thProps
  } = props;

  // 是否为普通列（可拖排序/拖宽）
  const interactive = dataKey !== undefined;

  if (!interactive) {
    return <th {...(thProps as Record<string, unknown>)}>{children}</th>;
  }

  const key = dataKey as string;

  /** 标题按住拖动：进入其它表头时实时调序，松开结束 */
  const handleDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "move";
    // 让当前拖拽目标可高亮（简单起见用 title 占位换行提示）
    e.dataTransfer.setData("text/plain", key);
  };
  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/plain");
    if (from && from !== key && onMove) onMove(from, key);
    if (onMoveEnd) onMoveEnd();
  };
  const handleDragEnd = () => {
    if (onMoveEnd) onMoveEnd();
  };

  /** 右缘手柄拖宽：Pointer 事件在 window 上跟手 */
  const startResize = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width ?? 120;
    const lower = Math.min(minColumnWidth ?? 60, startW);
    const move = (ev: PointerEvent) => {
      const next = Math.max(lower, startW + (ev.clientX - startX));
      if (onResizeWidth) onResizeWidth(key, next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const thStyle: CSSProperties = {
    position: "relative",
    ...(thProps.style as CSSProperties | undefined),
  };

  return (
    <th {...(thProps as Record<string, unknown>)} style={thStyle}>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        title="按住左右拖动调整列顺序"
        style={{
          userSelect: "none",
          cursor: "grab",
          paddingRight: 12,
          minWidth: 0,
        }}
      >
        {children}
      </div>
      <span
        onPointerDown={startResize}
        title="拖动调整列宽"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: 6,
          cursor: "col-resize",
          zIndex: 1,
        }}
      />
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* ProTable 主体                                                       */
/* ------------------------------------------------------------------ */
export default function ProTable<RecordType extends RecordTypeOf>({
  columns,
  minColumnWidth = 60,
  ...rest
}: ProTableProps<RecordType>) {
  // 拆分：可排序普通列 + 固定右侧列（操作列等，始终钉在最右）
  const { movable, pinnedRight } = useMemo(() => {
    const movableCols: AnyCol<RecordType>[] = [];
    const pinnedCols: AnyCol<RecordType>[] = [];
    (columns as AnyCol<RecordType>[]).forEach((col) => {
      if (col.fixed === "right") pinnedCols.push(col);
      else movableCols.push(col);
    });
    return { movable: movableCols, pinnedRight: pinnedCols };
  }, [columns]);

  // 列顺序（只含可排序列）
  const [order, setOrder] = useState<string[]>(() =>
    movable.map((col) => colKeyOf(col)),
  );

  // 列宽覆盖（key -> px，仅记录用户拖宽过的列）
  const [widths, setWidths] = useState<Record<string, number>>({});

  const handleMove = useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      setOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(fromKey);
        const to = next.indexOf(toKey);
        if (from < 0 || to < 0) return prev;
        next.splice(from, 1);
        next.splice(to, 0, fromKey);
        return next;
      });
    },
    [],
  );

  const handleResizeWidth = useCallback((key: string, nextWidth: number) => {
    setWidths((prev) => ({ ...prev, [key]: Math.round(nextWidth) }));
  }, []);

  // 依据 order/widths 重建要传给 Table 的 columns
  const displayColumns = useMemo<ColumnsType<RecordType>>(() => {
    const byKey = new Map<string, AnyCol<RecordType>>(
      movable.map((col) => [colKeyOf(col), col]),
    );
    const ordered: ColumnsType<RecordType> = order
      .map((key) => {
        const col = byKey.get(key);
        if (!col) return null;
        const w = widths[key] ?? numericWidthOf(col);
        return {
          ...col,
          width: w,
          onHeaderCell: () => ({
            dataKey: key,
            width: w,
            onMove: handleMove,
            onMoveEnd: () => undefined,
            onResizeWidth: handleResizeWidth,
            minColumnWidth,
          }),
        } as ColumnType<RecordType>;
      })
      .filter((c): c is ColumnType<RecordType> => Boolean(c));

    // 固定右侧列不参与排序/拖宽，原样附在末尾
    const pinned = pinnedRight.map((col) => ({ ...col })) as ColumnsType<RecordType>;
    return [...ordered, ...pinned];
  }, [
    movable,
    pinnedRight,
    order,
    widths,
    handleMove,
    handleResizeWidth,
    minColumnWidth,
  ]);

  const components = useMemo(
    () =>
      ({
        header: { cell: HeaderCell },
      }) as TableProps<RecordType>["components"],
    [],
  );

  return (
    <Table<RecordType>
      {...rest}
      columns={displayColumns}
      components={components}
    />
  );
}
