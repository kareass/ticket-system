import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "./globals.css";
import RootLayoutClient from "@/components/layout/RootLayoutClient";

dayjs.locale("zh-cn");

export const metadata: Metadata = {
  title: "四川物流工单系统",
  description: "内部工单统计与需求追踪系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ConfigProvider
            locale={zhCN}
            theme={{
              token: {
                colorPrimary: "#1677ff",
                borderRadius: 6,
              },
            }}
          >
            <RootLayoutClient>{children}</RootLayoutClient>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
