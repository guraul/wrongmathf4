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
  webpack: (config, { isServer }) => {
    // core 的 TS 源码里写的是 ESM 规范的 "./x.js"，实际文件是 ./x.ts
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };

    if (isServer) {
      // 上面的 serverComponentsExternalPackages 只对 app 直接依赖生效；
      // sharp 是从 @wrongmath/core 转引进来的，会被打进 bundle。
      // 内联后 sharp 的平台探测失效（拿不到 @img/sharp-wasm32 回落），
      // 部署到 android-arm64 时接口直接 500，所以这里再显式声明一次。
      config.externals = [...(config.externals ?? []), { sharp: "commonjs sharp" }];
    }

    return config;
  },
};
