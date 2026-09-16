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
 * 可选 `layoutStorageKey`：传入后会把「列顺序 + 列宽」自动持久化到浏览器
 * localStorage（每张表一个独立 key，用户调整后自动保存；刷新/重进仍在）。
 * 布局非默认时，表格上方右侧出现「还原默认列布局」小按钮，一键清空恢复。
 * 存储格式：`protable:layout:<key>` → `{ order: string[], widths: Record<string, number> }`
 * （固定列不参与排序/调宽，故不入存储）。
 *
 * 另外会接管**每页条数**：默认 10，可选 10/20/30/50/100，用户的选择存入
 * `protable:pageSize:<key>`（与列布局分开存，避免影响「还原默认列布局」的语义 ——
 * 合并的话，仅改过条数的用户也会看到该按钮，点它还会连条数一起重置）。
 * 只接管 pageSize，**不接管当前页码** —— 排序后仍停留当前页。
 * 若调用方显式传了 pagination.pageSize，则以调用方为准，本组件不介入。
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button, Table } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnType, ColumnsType, TableProps } from "antd/es/table";

type RecordTypeOf = object;

/** 每页条数可选档位。必须包含默认值 10，否则 antd 的 Select 无法高亮当前项 */
const PAGE_SIZE_CHOICES = [10, 20, 30, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

export interface ProTableProps<RecordType extends RecordTypeOf>
  extends Omit<TableProps<RecordType>, "columns" | "components"> {
  columns: ColumnsType<RecordType>;
  /** 拖拽收缩的最小列宽（px），默认 60 */
  minColumnWidth?: number;
  /**
   * 列布局持久化 key：传入后用户调整的「列顺序 + 列宽」会存入
   * localStorage（刷新/重进保留），且布局非默认时表格上方显示「还原默认列布局」按钮。
   * 每张表用不同 key（如 "work-orders" / "requirements"），不传则不启用。
   */
  layoutStorageKey?: string;
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
  layoutStorageKey,
  pagination,
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

  // 默认列序 = 当前可排序列的静态顺序（还原按钮的目标态）
  const defaultOrder = useMemo(
    () => movable.map((col) => colKeyOf(col)),
    [movable],
  );

  // 列顺序（只含可排序列）
  const [order, setOrder] = useState<string[]>(defaultOrder);

  // 列宽覆盖（key -> px，仅记录用户拖宽过的列）
  const [widths, setWidths] = useState<Record<string, number>>({});

  // 持久化 key（用户调整前为 undefined，避免 localStorage 不可用时报错/SSR 访问）
  const storageKey = layoutStorageKey
    ? `protable:layout:${layoutStorageKey}`
    : undefined;

  // 是否已从 localStorage 恢复过（恢复前不写回，防止一挂载就把默认值覆盖用户存档）
  const restoredRef = useRef(false);

  // 挂载后一次性恢复存档（localStorage 只在浏览器端存在，放 effect 防 SSR hydration 错位）
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          order?: unknown;
          widths?: unknown;
        };
        // 仅采纳当前仍存在的列 key，存档里已移除的旧列 key 丢弃
        const validKeys = new Set(defaultOrder);
        const savedOrder = Array.isArray(saved.order)
          ? (saved.order as unknown[]).filter(
              (k): k is string => typeof k === "string" && validKeys.has(k),
            )
          : [];
        // 存档里有的列按其保存顺序在前；存档未覆盖的新列按默认相对顺序补在末尾
        const mergedOrder = [
          ...savedOrder,
          ...defaultOrder.filter((k) => !savedOrder.includes(k)),
        ];
        if (mergedOrder.length !== defaultOrder.length) {
          /* 理论不可达（savedOrder⊆defaultOrder），防呆保底 */
          setOrder(defaultOrder);
        } else {
          setOrder(mergedOrder);
        }
        // 恢复列宽：校验是正数、且对应的列仍在
        if (saved.widths && typeof saved.widths === "object") {
          const restoredWidths: Record<string, number> = {};
          for (const [k, v] of Object.entries(
            saved.widths as Record<string, unknown>,
          )) {
            if (validKeys.has(k) && typeof v === "number" && v > 0) {
              restoredWidths[k] = v;
            }
          }
          if (Object.keys(restoredWidths).length) setWidths(restoredWidths);
        }
      }
    } catch {
      // 存档损坏/被篡改时静默忽略，退回默认布局
    }
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 布局变动即自动写回（自动保存；try/catch 兜底 localStorage 不可用）
  useEffect(() => {
    if (!storageKey || !restoredRef.current) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ order, widths }),
      );
    } catch {
      // 隐私模式/配额满时静默降级为不持久化
    }
  }, [storageKey, order, widths]);

  // —— 每页条数：与列布局分开的独立存档（原因见文件头说明）——
  const pageSizeStorageKey = layoutStorageKey
    ? `protable:pageSize:${layoutStorageKey}`
    : undefined;

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const pageSizeRestoredRef = useRef(false);

  // 挂载后一次性恢复（与列布局同理，放 effect 防 SSR hydration 错位）
  useEffect(() => {
    if (!pageSizeStorageKey) return;
    try {
      const raw = window.localStorage.getItem(pageSizeStorageKey);
      const n = raw === null ? NaN : Number(raw);
      // 只接受白名单内的档位；存档被篡改或来自旧版本时一律退回默认
      if (PAGE_SIZE_CHOICES.includes(n)) setPageSize(n);
    } catch {
      // 隐私模式等场景下静默降级为不持久化
    }
    pageSizeRestoredRef.current = true;
  }, [pageSizeStorageKey]);

  // 变动即写回
  useEffect(() => {
    if (!pageSizeStorageKey || !pageSizeRestoredRef.current) return;
    try {
      window.localStorage.setItem(pageSizeStorageKey, String(pageSize));
    } catch {
      /* 忽略 */
    }
  }, [pageSizeStorageKey, pageSize]);

  /**
   * 合并分页配置：本组件提供默认值，调用方传入的同名字段优先。
   * 调用方显式给了 pageSize 时整体让位（不接管、也不持久化），避免两处状态打架。
   * 不设 current —— 保持非受控，排序后仍停留当前页。
   */
  const mergedPagination = useMemo(() => {
    if (pagination === false) return false;
    const caller =
      pagination && typeof pagination === "object" ? pagination : undefined;
    if (caller?.pageSize !== undefined) return caller;
    return {
      pageSize,
      showSizeChanger: true,
      pageSizeOptions: PAGE_SIZE_CHOICES.map(String),
      onShowSizeChange: (_current: number, size: number) => setPageSize(size),
      ...(caller ?? {}),
    };
  }, [pagination, pageSize]);

  /** 一键还原：列序回默认、清空列宽，并删掉存档 */
  const handleResetLayout = useCallback(() => {
    setOrder(defaultOrder);
    setWidths({});
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* 忽略 */
      }
    }
  }, [defaultOrder, storageKey]);

  // 是否与默认布局一致（决定要不要显示「还原默认列布局」按钮）
  const isDefaultLayout = useMemo(
    () =>
      order.length === defaultOrder.length &&
      defaultOrder.every((k, i) => order[i] === k) &&
      Object.keys(widths).length === 0,
    [order, defaultOrder, widths],
  );

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

  // 布局非默认时，表格上方右侧显示「还原默认列布局」按钮
  const showResetLayout =
    Boolean(storageKey) && restoredRef.current && !isDefaultLayout;

  return (
    <>
      {showResetLayout && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={handleResetLayout}
            style={{ color: "#999" }}
          >
            还原默认列布局
          </Button>
        </div>
      )}
      <Table<RecordType>
        {...rest}
        columns={displayColumns}
        pagination={mergedPagination}
        components={components}
      />
    </>
  );
}
