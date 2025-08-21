// craco.config.js
const webpack = require("webpack");

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // гарантируем, что объекты существуют
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.alias = {
        ...(webpackConfig.resolve.alias || {}),
        // ВАЖНО: без .js — правильный экспорт
        "react/jsx-runtime": require.resolve("react/jsx-runtime"),
      };

      // Фолбэки для пакетов, которые ожидают ноды
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        process: require.resolve("process/browser.js"),
        util: require.resolve("util/"),
        buffer: require.resolve("buffer/"),
      };

      // Полифил глобалов (некоторые пакеты ждут process и Buffer)
      webpackConfig.plugins = webpackConfig.plugins || [];
      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          process: "process/browser.js",
          Buffer: ["buffer", "Buffer"],
        })
      );

      return webpackConfig;
    },
  },
};
