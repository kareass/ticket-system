import type { CSSProperties, ReactNode } from "react";

import { MOSS } from "@/lib/theme";

/**
 * Surface —— 页面上的「一块板」。本方向全站只有这一种容器。
 *
 * 为什么不用 antd `Card`：Card 自带 `border + border-radius + padding` 三件套，
 * 而本方向的面是**无边框、只靠极柔投影从地色上浮起来**的；
 * 用 Card 得逐处抵消它的边框与圆角，抵消代码会散落在每个页面里。
 * 这里把「一块板长什么样」收成一处，各页只决定板内怎么排。
 *
 * 两条纪律：
 * - **板不嵌套**：一块板里再放一块板永远是错的，用发丝线或留白分组。
 * - padding 由调用方按内容给（密表要贴边，所以表格板的默认值是 0）。
 */
export default function Surface({
  children,
  padding = 20,
  style,
  as: Tag = "section",
}: {
  children: ReactNode;
  /** 内边距；密表板传 0，让表格贴到圆角上 */
  padding?: number | string;
  style?: CSSProperties;
  as?: "section" | "div" | "aside";
}) {
  return (
    <Tag
      style={{
        background: MOSS.card,
        borderRadius: 14,
        boxShadow: MOSS.shadow,
        /* 让板内密表的边角被圆角裁掉，而不是压出直角 */
        overflow: "hidden",
        padding,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
