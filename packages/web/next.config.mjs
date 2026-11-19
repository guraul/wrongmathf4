/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: "standalone",
  // core 直接以 TS 源码被引用，交给 Next 转译
  transpilePackages: ["@wrongmath/core"],
  experimental: {
    // sharp 是原生模块，不能让 webpack 打包
    serverComponentsExternalPackages: ["sharp"],
  },
  webpack: (config) => {
    // core 的 TS 源码里写的是 ESM 规范的 "./x.js"，实际文件是 ./x.ts
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
