const webpack = require("webpack");

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        crypto: require.resolve("crypto-browserify"),
        path: require.resolve("path-browserify"),
        util: require.resolve("util"),
        events: require.resolve("events")
      };

      config.plugins = (config.plugins || []).concat(
        new webpack.ProvidePlugin({
          process: "process/browser",
          Buffer: ["buffer", "Buffer"]
        })
      );

      return config;
    }
  }
};
