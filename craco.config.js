/* TEMP: снять ограничение CRA на "вне src" (ModuleScopePlugin) */
module.exports = {
  webpack: {
    configure: (config) => {
      if (config.resolve && Array.isArray(config.resolve.plugins)) {
        config.resolve.plugins = config.resolve.plugins.filter(
          (p) => !(p && p.constructor && p.constructor.name === 'ModuleScopePlugin')
        );
      }
      return config;
    },
  },
};
