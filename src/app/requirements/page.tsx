"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { Requirement, RequirementNode } from "@/types";
import {
  NODE_COLORS,
  NODE_OPTIONS,
  SYSTEM_COLORS,
  SYSTEM_OPTIONS,
  YES_NO_OPTIONS,
  asSelectOptions,
} from "@/types";
import { useAppStore } from "@/store/store";
import { formatDate, today } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";
import ProTable from "@/components/common/ProTable";
import EditableChip from "@/components/common/EditableChip";
import SortableHeader from "@/components/common/SortableHeader";
import { createComparator, type SortState } from "@/lib/sortRows";
import { useRowDrafts } from "@/lib/useRowDrafts";

// 配色与选项均唯一来源 src/types（新增选项时只改那一处）

// 当前节点筛选下拉选项
const nodeOptions = asSelectOptions(NODE_OPTIONS);
// 系统选项：列表内联编辑用
const systemOptions = asSelectOptions(SYSTEM_OPTIONS);

/**
 * 需求列表页
 * - 数据源：全局 store（useAppStore.requirements）
 * - ProTable 提供列拖排序 + 拖宽能力
 * - 系统/当前节点/是否加急/是否发版支持列表内联编辑
 * - 内联修改需点「提交」才落库（草稿门）
 */
export default function RequirementListPage() {
  const requirements = useAppStore((s) => s.requirements);
  const workOrders = useAppStore((s) => s.workOrders);
  const loading = useAppStore((s) => s.requirementsLoading);
  const loadRequirements = useAppStore((s) => s.loadRequirements);
  const loadWorkOrders = useAppStore((s) => s.loadWorkOrders);
  const deleteRequirement = useAppStore((s) => s.deleteRequirement);
  const updateRequirement = useAppStore((s) => s.updateRequirement);

  const [keyword, setKeyword] = useState("");
  const [node, setNode] = useState<RequirementNode | undefined>(undefined);
  // 排序状态：null = 未排序，保持后端返回的 createdAt 倒序
  const [sort, setSort] = useState<SortState<Requirement> | null>(null);

  // 草稿状态：修改后需显式点提交才落库
  const drafts = useRowDrafts<Requirement>();

  // 初次挂载拉取数据（工单列表用于「来源工单」列反查标题）
  useEffect(() => {
    void loadRequirements().catch((e) => message.error(toErrorMessage(e)));
    void loadWorkOrders().catch((e) => message.error(toErrorMessage(e)));
  }, [loadRequirements, loadWorkOrders]);

  // 前端过滤：需求ID或标题包含 + 当前节点相等
  const filteredRequirements = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requirements.filter((req) => {
      const hitText =
        !kw ||
        req.requirementId.toLowerCase().includes(kw) ||
        (req.title ?? "").toLowerCase().includes(kw);
      const hitNode = !node || req.currentNode === node;
      return hitText && hitNode;
    });
  }, [requirements, keyword, node]);

  // 双击列头：升序 → 降序 → 取消（回到默认的创建时间倒序）
  const handleSortToggle = (field: keyof Requirement) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, order: "ascend" };
      if (prev.order === "ascend") return { field, order: "descend" };
      return null;
    });
  };

  // 排序作用在已提交值上（在 drafts.merge 之前）：
  // 未提交的内联草稿不参与排序，避免用户编辑时那一行跳走。
  const sortedRequirements = useMemo(() => {
    if (!sort) return filteredRequirements;
    return [...filteredRequirements].sort(
      createComparator<Requirement>(sort.field, sort.order),
    );
  }, [filteredRequirements, sort]);

  // 列头工厂：给可排序的列统一挂上双击行为
  const sortableTitle = (label: string, field: keyof Requirement) => (
    <SortableHeader<Requirement>
      label={label}
      field={field}
      sort={sort}
      onToggle={handleSortToggle}
    />
  );

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
            await updateRequirement(id, patch);
          });
          if (n > 0) message.success(`已提交 ${n} 条需求修改`);
        } catch (e) {
          message.error(toErrorMessage(e));
        }
      },
    });
  };

  const columns: ColumnsType<Requirement> = [
    {
      title: "需求ID",
      dataIndex: "requirementId",
      key: "requirementId",
      width: 130,
    },
    {
      title: sortableTitle("日期", "date"),
      dataIndex: "date",
      key: "date",
      width: 110,
      render: (date: string) => formatDate(date),
    },
    {
      title: "需求标题",
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true,
      render: (title?: string) => title || "-",
    },
    {
      title: "需求内容",
      dataIndex: "content",
      key: "content",
      width: 240,
      ellipsis: true,
      render: (content?: string) => content || "-",
    },
    {
      title: "系统",
      dataIndex: "system",
      key: "system",
      width: 100,
      render: (system: string, record) => {
        return (
          <EditableChip
            value={system}
            options={systemOptions}
            colorOf={(s) => SYSTEM_COLORS[s]}
            dirty={drafts.isFieldDirty(record.id, "system")}
            onChange={(val) =>
              drafts.stage(record.id, { system: val } as Partial<Requirement>)
            }
          />
        );
      },
    },
    {
      title: sortableTitle("开发时长(天)", "developmentDays"),
      dataIndex: "developmentDays",
      key: "developmentDays",
      width: 110,
      align: "center" as const,
      render: (days?: number) => (typeof days === "number" ? days : "-"),
    },
    {
      title: sortableTitle("当前节点", "currentNode"),
      dataIndex: "currentNode",
      key: "currentNode",
      width: 120,
      render: (currentNode: RequirementNode, record) => {
        return (
          <EditableChip
            value={currentNode}
            options={nodeOptions}
            colorOf={(n) => NODE_COLORS[n]}
            dirty={drafts.isFieldDirty(record.id, "currentNode")}
            onChange={(val) =>
              drafts.stage(record.id, { currentNode: val } as Partial<Requirement>)
            }
          />
        );
      },
    },
    {
      title: sortableTitle("是否加急", "isUrgent"),
      dataIndex: "isUrgent",
      key: "isUrgent",
      width: 100,
      align: "center" as const,
      render: (isUrgent: boolean, record) => (
        <EditableChip
          value={isUrgent}
          options={YES_NO_OPTIONS}
          colorOf={(v) => (v ? "red" : undefined)}
          dirty={drafts.isFieldDirty(record.id, "isUrgent")}
          onChange={(val) =>
            drafts.stage(record.id, { isUrgent: val } as Partial<Requirement>)
          }
        />
      ),
    },
    {
      title: sortableTitle("是否发版", "isReleased"),
      dataIndex: "isReleased",
      key: "isReleased",
      width: 100,
      align: "center" as const,
      render: (isReleased: boolean, record) => (
        <EditableChip
          value={isReleased}
          options={YES_NO_OPTIONS}
          colorOf={(v) => (v ? "success" : undefined)}
          dirty={drafts.isFieldDirty(record.id, "isReleased")}
          onChange={(val) => {
            const enabling = val === true;
            // value 即"改之前"的当前值（已叠加 merge 的 staged 数据）
            const wasReleased = isReleased;
            if (enabling) {
              const patch: Partial<Requirement> = { isReleased: true };
              if (!wasReleased) patch.releaseDate = today(); // 否→是：发版时间默认今天
              drafts.stage(record.id, patch);
            } else {
              drafts.stage(record.id, { isReleased: false, releaseDate: undefined });
            }
          }}
        />
      ),
    },
    {
      title: sortableTitle("发版时间", "releaseDate"),
      dataIndex: "releaseDate",
      key: "releaseDate",
      width: 115,
      render: (_, record) =>
        record.isReleased ? formatDate(record.releaseDate) : "-",
    },
    {
      title: "来源工单",
      key: "sourceWorkOrder",
      width: 130,
      render: (_, record) => {
        if (!record.workOrderId) return "-";
        const src = workOrders.find((w) => w.id === record.workOrderId);
        return (
          <Tag color="geekblue">
            {src ? src.title || src.id : record.workOrderId}
          </Tag>
        );
      },
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      width: 160,
      ellipsis: true,
      render: (remark?: string) => remark || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right" as const,
      render: (_, record) => (
        <Space size={0}>
          <Link href={`/requirements/edit/${record.id}`}>
            <Button type="link" size="small">
              编辑
            </Button>
          </Link>
          <Popconfirm
            title="删除需求"
            description="确定删除该需求吗？删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              drafts.discard(record.id);
              try {
                await deleteRequirement(record.id);
                // 若该需求来自工单，后端已复位工单的转需求标记 → 强制刷新工单列表保持一致
                if (record.workOrderId) {
                  await loadWorkOrders(true);
                }
                message.success("需求已删除");
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
    <Card title="需求列表">
      {/* 顶部工具栏 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Space>
          <Link href="/requirements/create">
            <Button type="primary" icon={<PlusOutlined />}>
              新建需求
            </Button>
          </Link>
          {/* 提交按钮：有草稿时启用，显示待提交数量 */}
          <Button
            type="primary"
            disabled={drafts.count === 0}
            onClick={handleCommit}
          >
            提交{drafts.count ? `（${drafts.count}）` : ""}
          </Button>
          {/* 还原按钮：有草稿时才显示 */}
          {drafts.count > 0 ? (
            <Button onClick={() => drafts.discard()}>还原</Button>
          ) : null}
        </Space>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => {
              void loadRequirements(true).catch((e) =>
                message.error(toErrorMessage(e)),
              );
              void loadWorkOrders(true).catch(() => undefined);
            }}
          >
            刷新
          </Button>
          <Input
            allowClear
            placeholder="按需求ID/标题搜索"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select<RequirementNode>
            allowClear
            placeholder="按当前节点筛选"
            style={{ width: 180 }}
            options={nodeOptions}
            value={node}
            onChange={(value) => setNode(value)}
          />
        </Space>
      </div>

      <ProTable<Requirement>
        rowKey="id"
        columns={columns}
        dataSource={sortedRequirements.map(drafts.merge)}
        loading={loading}
        scroll={{ x: 1560 }}
        layoutStorageKey="requirements"
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
