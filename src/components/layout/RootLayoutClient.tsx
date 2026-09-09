"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu } from "antd";
import {
  FileTextOutlined,
  AppstoreOutlined,
  HomeOutlined,
} from "@ant-design/icons";

const { Sider, Content } = Layout;

const menuItems = [
  {
    key: "/",
    icon: <HomeOutlined />,
    label: <Link href="/">首页</Link>,
  },
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
];

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 取当前路径对应的顶级菜单 key：/work-orders 下所有子页(create/edit)均选中「工单管理」
  const selectedKey = menuItems
    .map((i) => i.key)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] ?? "/";

  // 窄屏(断点 lg)自动折叠为纯图标栏，桌面可手动收起/展开
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* 左侧导航 */}
      <Sider
        theme="light"
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        style={{
          borderRight: "1px solid #f0f0f0",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 64,
            padding: collapsed ? "0 20px" : "0 16px",
            fontSize: collapsed ? 20 : 16,
            fontWeight: 600,
            color: "#1677ff",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? "川" : "四川物流工单系统"}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderInlineEnd: "none" }}
        />
      </Sider>

      {/* 右侧内容区 */}
      <Layout>
        <Content style={{ padding: 24, background: "#f5f5f5" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
