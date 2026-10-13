"use client";

/**
 * 全站外壳（方向：柔和 · 苔绿）
 *
 * 结构：米白微绿的地色上浮两块**圆角卡片** —— 左边导航、右边内容。
 * 不用 antd 默认的「左栏通顶 + 右栏灰底」：那样每页都像后台模板。
 *
 * 约定：
 * - 导航当前项 = 强调色 10% 浅底 + 强调色文字，**不加单边色条**
 *   （单边粗色条是「一眼 AI」的特征，且与柔和方向相冲）。
 * - 导航与内容两块卡片顶/底对齐，靠同一组 18/20 的边距，不用 flex 居中。
 */
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Layout, Menu } from "antd";
import {
  AppstoreOutlined,
  BellOutlined,
  FileTextOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";

import { MOSS } from "@/lib/theme";

const { Sider, Content } = Layout;

/** 导航项：图标统一 16px、同一笔画重量的 antd 图标族，不混用两套 */
const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: <Link href="/">首页</Link> },
  {
    key: "/work-orders",
    icon: <FileTextOutlined />,
    label: <Link href="/work-orders">工单管理</Link>,
  },
  {
    key: "/requirements",
    icon: <AppstoreOutlined />,
    label: <Link href="/requirements">需求管理</Link>,
  },
  {
    key: "/meetings",
    icon: <ScheduleOutlined />,
    label: <Link href="/meetings">会议纪要</Link>,
  },
  {
    key: "/reminders",
    icon: <BellOutlined />,
    label: <Link href="/reminders">工作提醒</Link>,
  },
];

/** 外壳两卡片的共同间距：顶/底 18，卡片之间 20 */
const PAD_Y = 18;
const GAP = 20;

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 取当前路径对应的顶级菜单 key：/work-orders 下所有子页(create/edit)均选中「工单管理」
  const selectedKey =
    menuItems
      .map((i) => i.key)
      .filter((k) => k !== "/" && pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? "/";

  // 窄屏(断点 lg)自动折叠为纯图标栏，桌面可手动收起/展开
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh", background: MOSS.bg }}>
      {/* 左侧导航：一张贴顶贴底的圆角卡片 */}
      <Sider
        className="app-sider"
        width={216}
        collapsedWidth={64}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        trigger={null}
        style={{
          background: MOSS.card,
          /* 贴顶贴底、随页面滚动留在视口内 */
          position: "sticky",
          top: PAD_Y,
          height: `calc(100vh - ${PAD_Y * 2}px)`,
          margin: `${PAD_Y}px 0 ${PAD_Y}px ${GAP}px`,
          borderRadius: 14,
          boxShadow: MOSS.shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 品牌栏：文字标识 + 收起/展开。收起后只留按钮 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            gap: 8,
            height: 56,
            flex: "none",
            padding: collapsed ? 0 : "0 6px 0 20px",
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: MOSS.ink,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              四川物流工单系统
            </span>
          )}
          <Button
            type="text"
            aria-label={collapsed ? "展开导航" : "收缩导航"}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
            style={{ fontSize: 15, color: MOSS.ink2 }}
          />
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderInlineEnd: "none", background: "transparent" }}
        />

        {/* 脚注：把「无账号体系、日期默认今天」写在界面上。
            这不是装饰 —— 它省掉的是新同事的第一个问题。
            收起时空间不足，直接不渲染。 */}
        {!collapsed && (
          <div
            style={{
              marginTop: "auto",
              flex: "none",
              padding: "14px 20px 16px",
              borderTop: `1px solid ${MOSS.line}`,
              fontSize: 12,
              lineHeight: 1.8,
              color: MOSS.ink2,
            }}
          >
            无账号体系
            <br />
            日期默认今天
          </div>
        )}
      </Sider>

      {/* 右侧内容：各页自己用 Card 浮成第二张卡片，这里只给边距 */}
      <Content
        style={{
          background: "transparent",
          padding: `${PAD_Y}px ${GAP}px ${PAD_Y}px ${GAP}px`,
          minWidth: 0,
        }}
      >
        {children}
      </Content>
    </Layout>
  );
}
