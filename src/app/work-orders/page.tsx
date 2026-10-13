"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tooltip,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import ProTable from "@/components/common/ProTable";
import Surface from "@/components/common/Surface";
import EditableChip from "@/components/common/EditableChip";
import SortableHeader from "@/components/common/SortableHeader";
import { MOSS } from "@/lib/theme";
import { useRowDrafts } from "@/lib/useRowDrafts";
import { createComparator, type SortState } from "@/lib/sortRows";
import { SYSTEM_OPTIONS, SUBMITTER_OPTIONS, WORK_ORDER_STATUS_OPTIONS, asSelectOptions } from "@/types";
import type { WorkOrder, WorkOrderStatus } from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, workOrderNo } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";

// 系统 / 工单状态配色：唯一来源 src/types（新增选项时只改那一处）

/** 空值占位：中文数据表惯例用全角破折号「—」，不用半角减号；
 *  颜色退到装饰灰，让「有值」的格子自然比空格子响。 */
const EMPTY = <span style={{ color: MOSS.ornament }}>—</span>;

/**
 * 工单列表页（环节5：数据源为真实后端 API）
 * - 挂载时拉取工单 + 需求（后者用于「关联需求」列反查）
 * - 列表内可改「系统 / 状态」→ 暂存草稿，点「提交」并确认后才落库
 * - 「是否转需求」只读展示：转需求由「编辑工单开启开关保存即同步」或
 *   操作列「转需求」按钮驱动，避免在未填需求ID 的情况下误切标志
 * - 操作列提供「转需求」：弹框内填写「需求ID」（工单已登记则回填），
 *   确认后调后端一对一转换接口建需求并置工单标记
 * - 所有失败（校验/冲突/网络）统一用 toErrorMessage 友好提示
 */
export default function WorkOrderListPage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const requirements = useAppStore((s) => s.requirements);
  const loading = useAppStore((s) => s.workOrdersLoading);
  const loadWorkOrders = useAppStore((s) => s.loadWorkOrders);
  const loadRequirements = useAppStore((s) => s.loadRequirements);
  const deleteWorkOrder = useAppStore((s) => s.deleteWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const convertWorkOrder = useAppStore((s) => s.convertWorkOrder);

  // 草稿状态：内联修改暂存草稿，显式提交才落库
  const drafts = useRowDrafts<WorkOrder>();

  // 标题搜索关键字 / 系统筛选值 / 提交人筛选值（受控，allowClear 清空后为 undefined 表示不过滤）
  const [keyword, setKeyword] = useState("");
  const [system, setSystem] = useState<string | undefined>(undefined);
  const [submitter, setSubmitter] = useState<string | undefined>(undefined);
  // 排序状态：null = 未排序，保持后端返回的 createdAt 倒序
  const [sort, setSort] = useState<SortState<WorkOrder> | null>(null);

  // 转需求弹框：目标工单 + 待填需求ID / 需求内容 + 需求提交人 + 提交中
  const [convertTarget, setConvertTarget] = useState<WorkOrder | null>(null);
  const [convertId, setConvertId] = useState("");
  const [convertContent, setConvertContent] = useState("");
  const [convertSubmitter, setConvertSubmitter] = useState<string | undefined>(undefined);
  const [converting, setConverting] = useState(false);

  // 初次挂载拉取数据（需求列表用于反查「关联需求」）
  useEffect(() => {
    void loadWorkOrders().catch((e) => message.error(toErrorMessage(e)));
    void loadRequirements().catch((e) => message.error(toErrorMessage(e)));
  }, [loadWorkOrders, loadRequirements]);

  // 前端过滤：标题包含 + 系统相等 + 提交人相等（无关键字 / 未选筛选时不参与过滤）
  const filteredWorkOrders = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const hitTitle = !kw || wo.title.toLowerCase().includes(kw);
      const hitSystem = !system || wo.system === system;
      // 提交人筛选：历史数据 submittedBy 为空时永远不命中（与 DB 一致）
      const hitSubmitter = !submitter || wo.submittedBy === submitter;
      return hitTitle && hitSystem && hitSubmitter;
    });
  }, [workOrders, keyword, system, submitter]);

  // 台头计数：统计**全部**工单，不随筛选/搜索变化 ——
  // 「还有几条没转需求」是翻页后仍要看到的量，跟着筛选变就没有参照意义了。
  const stats = useMemo(() => {
    const total = workOrders.length;
    const fresh = workOrders.filter((wo) => wo.status === "新建").length;
    const converted = workOrders.filter((wo) => wo.isConvertToRequirement).length;
    return { total, fresh, converted, pending: total - converted };
  }, [workOrders]);

  // 双击列头：升序 → 降序 → 取消（回到默认的创建时间倒序）
  const handleSortToggle = (field: keyof WorkOrder) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, order: "ascend" };
      if (prev.order === "ascend") return { field, order: "descend" };
      return null;
    });
  };

  // 排序作用在已提交值上（在 drafts.merge 之前）
  const sortedWorkOrders = useMemo(() => {
    if (!sort) return filteredWorkOrders;
    return [...filteredWorkOrders].sort(
      createComparator<WorkOrder>(sort.field, sort.order),
    );
  }, [filteredWorkOrders, sort]);

  // 列头工厂：给可排序的列统一挂上双击行为
  const sortableTitle = (label: string, field: keyof WorkOrder) => (
    <SortableHeader<WorkOrder>
      label={label}
      field={field}
      sort={sort}
      onToggle={handleSortToggle}
    />
  );

  // 系统筛选下拉可选项：唯一来源 src/types，与 SystemSelect 共用
  const systemFilterOptions = asSelectOptions(SYSTEM_OPTIONS);
  // 状态选项：唯一来源 src/types，与表单页共用
  const statusOptions = asSelectOptions(WORK_ORDER_STATUS_OPTIONS);
  // 提交人选项：唯一来源 src/types，与表单页共用
  const submitterOptions = asSelectOptions(SUBMITTER_OPTIONS);

  // 提交：先确认，再把全部草稿逐个写入后端（全成功才清空草稿）
  const handleCommit = () => {
    Modal.confirm({
      title: `确认提交 ${drafts.count} 条修改？`,
      content: "提交后将写入数据库，列表数据会同步更新。",
      okText: "确认提交",
      cancelText: "取消",
      onOk: async () => {
        try {
          const n = await drafts.commitAsync(async (id, patch) => {
            await updateWorkOrder(id, patch);
          });
          if (n > 0) message.success(`已提交 ${n} 条工单修改`);
        } catch (e) {
          message.error(toErrorMessage(e));
        }
      },
    });
  };

  // 转需求弹框：需求ID 与需求内容直接在弹框内填写（工单上已登记则回填，可改），无需先去编辑页
  const openConvert = (record: WorkOrder) => {
    setConvertTarget(record);
    setConvertId(record.requirementId ?? "");
    setConvertContent(record.requirementContent ?? "");
    // 需求提交人默认预填工单的提交人；历史工单无提交人时让用户在弹框里手动选
    setConvertSubmitter(record.submittedBy);
  };

  const handleConvertOk = async () => {
    if (!convertTarget) return;
    const rid = convertId.trim();
    if (!rid) {
      message.warning("请填写「需求ID」后再转需求。");
      return;
    }
    if (!convertSubmitter) {
      message.warning("请选择「需求提交人」后再转需求。");
      return;
    }
    setConverting(true);
    try {
      // 需求内容按填写值原样提交：留空即转出「内容为空」的需求（后端不再回退成工单标题）
      const req = await convertWorkOrder(convertTarget.id, {
        requirementId: rid,
        requirementContent: convertContent.trim(),
        submittedBy: convertSubmitter,
      });
      message.success(`已转为需求 ${req.requirementId}`);
      setConvertTarget(null);
    } catch (e) {
      message.error(toErrorMessage(e));
    } finally {
      setConverting(false);
    }
  };

  const columns: ColumnsType<WorkOrder> = [
    {
      // ① 工单ID列：库主键为 cuid，展示派生短号（wo-末8位）
      title: "工单ID",
      dataIndex: "id",
      width: 120,
      render: (id: string) => <span className="mono">{workOrderNo(id)}</span>,
    },
    {
      title: sortableTitle("日期", "date"),
      dataIndex: "date",
      width: 110,
      // 日期用等宽：三行数字上下对齐，扫读「哪天」不用逐字看
      render: (_, record) => <span className="mono">{formatDate(record.date)}</span>,
    },
    {
      title: "标题",
      dataIndex: "title",
      width: 220,
      ellipsis: true,
    },
    {
      title: "工单内容",
      dataIndex: "content",
      width: 240,
      ellipsis: true,
      render: (content?: string) => content || EMPTY,
    },
    {
      title: sortableTitle("系统", "system"),
      dataIndex: "system",
      width: 100,
      render: (sys: string, record) => (
        <EditableChip
          value={sys}
          options={SYSTEM_OPTIONS.map((v) => ({ label: v, value: v }))}
          dirty={drafts.isFieldDirty(record.id, "system")}
          onChange={(v) => drafts.stage(record.id, { system: v } as Partial<WorkOrder>)}
        />
      ),
    },
    {
      // 提交人：黄傲 / 陈婷婷；历史数据为空时显示 -（可空字段）。三态语义走 PUT：未传不动 / 空串清空 / 非空改名
      title: sortableTitle("提交人", "submittedBy"),
      dataIndex: "submittedBy",
      width: 110,
      render: (submittedBy: string | undefined, record) => (
        <EditableChip
          value={submittedBy ?? ""}
          options={submitterOptions}
          dirty={drafts.isFieldDirty(record.id, "submittedBy")}
          onChange={(v) =>
            drafts.stage(record.id, { submittedBy: v } as Partial<WorkOrder>)
          }
        />
      ),
    },
    {
      // 是否转需求：由「填写需求ID / 转需求」驱动，故列表内只读展示，避免误切导致状态脱节。
      // 用「实心方块 = 是」而不是彩色标签：本方向颜色稀缺，且这一列的「是」
      // 在视觉上不该比工单标题更响；方块与相邻列的圆点、三角形状不同，不会混读。
      title: "是否转需求",
      dataIndex: "isConvertToRequirement",
      width: 110,
      align: "center" as const,
      render: (isConvert: boolean) =>
        isConvert ? (
          <span className="wo-converted">
            <i aria-hidden />
            是
          </span>
        ) : (
          <span style={{ color: MOSS.ink2 }}>否</span>
        ),
    },
    {
      // 关联需求：反查需求表命中显示需求编号；仅填了需求ID尚未转需求时以虚线标注提示。
      // 需求编号是**编号**，用等宽字；两种情况的分辨靠「有没有下划线」而不是靠色。
      title: "关联需求",
      key: "linkRequirement",
      width: 150,
      render: (_, record) => {
        const found = requirements.find((r) => r.workOrderId === record.id);
        if (found)
          return <span className="mono">{found.requirementId}</span>;
        if (record.requirementId) {
          return (
            <Tooltip title="工单上登记了需求ID，但对应需求已不存在（如曾被删除），可点「转需求」按此编号重建">
              <span className="mono wo-orphan-id">{record.requirementId}</span>
            </Tooltip>
          );
        }
        return <span style={{ color: MOSS.ornament }}>—</span>;
      },
    },
    {
      title: sortableTitle("状态", "status"),
      dataIndex: "status",
      width: 110,
      render: (status: string, record) => (
        <EditableChip
          value={status as WorkOrderStatus}
          options={statusOptions}
          dirty={drafts.isFieldDirty(record.id, "status")}
          onChange={(v) =>
            drafts.stage(record.id, { status: v as WorkOrderStatus } as Partial<WorkOrder>)
          }
        />
      ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 180,
      ellipsis: true,
      render: (remark?: string) => remark || EMPTY,
    },
    {
      // ② ③ 操作列固定在最右侧（含转需求入口）
      title: "操作",
      key: "action",
      width: 210,
      fixed: "right",
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/work-orders/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Button
            type="link"
            size="small"
            disabled={record.isConvertToRequirement}
            title={
              record.isConvertToRequirement
                ? "该工单已转需求"
                : record.requirementId
                  ? `按需求ID「${record.requirementId}」创建需求并关联`
                  : "填写需求ID 并创建关联需求"
            }
            onClick={() => openConvert(record)}
          >
            转需求
          </Button>
          <Popconfirm
            title="删除工单"
            description="确定删除该工单吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              drafts.discard(record.id);
              try {
                await deleteWorkOrder(record.id);
                message.success("工单已删除");
              } catch (e) {
                message.error(toErrorMessage(e));
              }
            }}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
    <Surface style={{ marginBottom: 20 }}>
      {/* 台头：页面名在左，「还剩几条没转需求」在右 —— 这是这个系统存在的理由 */}
      <div className="page-head">
        <h1>工单管理</h1>
        <div className="page-stats">
          <div className="page-stat">
            <b>{stats.total}</b>
            <span>工单总数</span>
          </div>
          <div className="page-stat">
            <b>{stats.fresh}</b>
            <span>新建</span>
          </div>
          <div className="page-stat">
            <b>{stats.converted}</b>
            <span>已转需求</span>
          </div>
          <div className="page-stat">
            <b>{stats.pending}</b>
            <span>未转需求</span>
          </div>
        </div>
      </div>

      {/* 工具行：动作在左（先决定做什么），筛选与搜索在右（再决定看哪几条） */}
      <div className="page-tools">
        {/* 新建工单 + 提交/还原（草稿计数） */}
        <Space>
          <Link href="/work-orders/create">
            <Button type="primary" icon={<PlusOutlined />}>
              新建工单
            </Button>
          </Link>
          <Button
            type="primary"
            disabled={drafts.count === 0}
            onClick={handleCommit}
          >
            提交{drafts.count ? `（${drafts.count}）` : ""}
          </Button>
          {drafts.count > 0 ? (
            <Button onClick={() => drafts.discard()}>还原</Button>
          ) : null}
        </Space>
        <div className="page-filters">
          <div className="field">
            <label htmlFor="wo-kw">搜索</label>
            <Input
              id="wo-kw"
              allowClear
              placeholder="标题关键字"
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wo-sys">系统</label>
            <Select<string>
              id="wo-sys"
              allowClear
              placeholder="全部"
              style={{ width: 130 }}
              options={systemFilterOptions}
              value={system}
              onChange={(value) => setSystem(value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wo-sub">提交人</label>
            <Select<string>
              id="wo-sub"
              allowClear
              placeholder="全部"
              style={{ width: 120 }}
              options={submitterOptions}
              value={submitter}
              onChange={(value) => setSubmitter(value)}
            />
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => {
              void loadWorkOrders(true).catch((e) =>
                message.error(toErrorMessage(e)),
              );
              void loadRequirements(true).catch(() => undefined);
            }}
          >
            刷新
          </Button>
        </div>
      </div>
    </Surface>

    {/* 表格板：不设内边距，让密表贴到圆角上（圆角处由 Surface 的 overflow 裁切） */}
    <Surface padding={0}>
      <ProTable<WorkOrder>
        rowKey="id"
        columns={columns}
        dataSource={sortedWorkOrders.map(drafts.merge)}
        loading={loading}
        scroll={{ x: 1510 }}
        layoutStorageKey="work-orders"
        pagination={{
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Surface>

      {/* 转需求弹框：需求ID 的填写位置（必填，空编号时确认按钮禁用） */}
      <Modal
        title="工单转需求"
        open={convertTarget !== null}
        okText="转为需求"
        cancelText="取消"
        confirmLoading={converting}
        okButtonProps={{ disabled: !convertId.trim() || !convertSubmitter }}
        onOk={handleConvertOk}
        onCancel={() => setConvertTarget(null)}
        destroyOnClose
      >
        {convertTarget ? (
          <>
            <div style={{ marginBottom: 12, color: MOSS.ink2 }}>
              将工单
              <span style={{ fontWeight: 600 }}>「{convertTarget.title}」</span>
              转为需求：日期 / 标题 / 内容 / 系统同步自该工单，节点默认「方案中」，
              工单随即标记为已转需求。
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: MOSS.danger, marginRight: 4 }}>*</span>
              需求ID
            </div>
            <Input
              autoFocus
              style={{ width: 240 }}
              placeholder="如 R-2026-001"
              value={convertId}
              onChange={(e) => setConvertId(e.target.value)}
              onPressEnter={handleConvertOk}
            />
            <div style={{ marginTop: 6, marginBottom: 12, color: MOSS.ink2, fontSize: 12 }}>
              业务编号，需全局唯一；编号已被占用会提示更换。
            </div>

            <div style={{ marginBottom: 6 }}>
              <span style={{ color: MOSS.danger, marginRight: 4 }}>*</span>
              需求提交人
            </div>
            <Select
              style={{ width: 160 }}
              placeholder="请选择需求提交人"
              options={submitterOptions}
              value={convertSubmitter}
              onChange={setConvertSubmitter}
              allowClear
            />
            <div style={{ marginTop: 6, marginBottom: 12, color: MOSS.ink2, fontSize: 12 }}>
              默认与工单提交人相同，可在此修改。
            </div>

            <div style={{ marginBottom: 6 }}>需求内容</div>
            <Input.TextArea
              rows={6}
              placeholder="选填，描述需求背景与验收期望"
              value={convertContent}
              onChange={(e) => setConvertContent(e.target.value)}
            />
            <div style={{ marginTop: 6, color: MOSS.ink2, fontSize: 12 }}>
              留空则转出的需求内容也为空（不会自动取工单标题）。
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
