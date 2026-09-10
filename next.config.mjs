/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * 构建输出目录，默认 .next。
   * 可用环境变量 NEXT_DIST_DIR 覆盖 —— 便于在 dev server 正在运行（占用 .next）
   * 的机器上做一次隔离的生产构建验证，例如：
   *   NEXT_DIST_DIR=.next-build npm run build
   * 部署时无需设置，保持默认即可。
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
