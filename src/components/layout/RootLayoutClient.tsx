"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu } from "antd";
import {
  FileTextOutlined,
  AppstoreOutlined,
  HomeOutlined,
} from "@ant-design/icons";

const { Header, Content } = Layout;

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

  const selectedKey = menuItems
    .map((i) => i.key)
    .filter((k) => k !== "/" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] ?? "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#fff",
          paddingInline: 24,
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#1677ff",
            marginRight: 32,
            whiteSpace: "nowrap",
          }}
        >
          四川物流工单系统
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ flex: 1, minWidth: 0, borderBottom: "none" }}
        />
      </Header>
      <Content style={{ padding: 24, background: "#f5f5f5" }}>
        {children}
      </Content>
    </Layout>
  );
}
