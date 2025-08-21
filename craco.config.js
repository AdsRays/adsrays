// craco.config.js
const webpack = require("webpack");

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // гарантируем, что объекты существуют
      webpackConfig.resolve = webpackConfig.resolve || {};
      // Фолбэки для пакетов, которые ожидают ноды
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        process: require.resolve("process/browser"),
        util: require.resolve("util"),
        buffer: require.resolve("buffer"),
        stream: require.resolve("stream-browserify"),
        path: require.resolve("path-browserify"),
        crypto: require.resolve("crypto-browserify"),
        events: require.resolve("events"),
      };

      // Полифил глобалов (некоторые пакеты ждут process и Buffer)
      webpackConfig.plugins = webpackConfig.plugins || [];
      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: ["process"],
        })
      );

      return webpackConfig;
    },
  },
};
