"use client";

import React from "react";
import Link from "next/link";
import { Card, Col, Row, Typography } from "antd";
import {
  FileTextOutlined,
  AppstoreOutlined,
  CarryOutOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";

const { Title, Paragraph } = Typography;

const featureCards = [
  {
    title: "工单管理",
    desc: "登记、追踪部门内的工作工单，支持检索、筛选与转为需求。",
    href: "/work-orders",
    icon: <FileTextOutlined style={{ fontSize: 40, color: "#1677ff" }} />,
  },
  {
    title: "需求管理",
    desc: "从工单转化的需求或手工登记的需求，跟进方案、开发、测试、发版全流程。",
    href: "/requirements",
    icon: <AppstoreOutlined style={{ fontSize: 40, color: "#52c41a" }} />,
  },
  {
    title: "会议纪要",
    desc: "记录部门会议的主题、参会人与讨论内容，支持上传附件。",
    href: "/meetings",
    icon: <ScheduleOutlined style={{ fontSize: 40, color: "#fa8c16" }} />,
  },
];

export default function HomePage() {
  return (
    <div>
      <Card style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginTop: 0 }}>
          <CarryOutOutlined style={{ marginRight: 8 }} />
          四川物流工单系统
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          部门内部工单统计与需求追踪工具。登记工单、追踪需求，全流程可视化管理。
        </Paragraph>
      </Card>

      <Row gutter={[24, 24]}>
        {/* 一行两个：工单/需求在第一行，后续新增功能自动落到第二行 */}
        {featureCards.map((card) => (
          <Col xs={24} md={12} key={card.href}>
            <Link href={card.href}>
              <Card hoverable style={{ height: "100%" }}>
                <div style={{ marginBottom: 12 }}>{card.icon}</div>
                <Title level={4} style={{ marginTop: 0 }}>
                  {card.title}
                </Title>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {card.desc}
                </Paragraph>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
}
