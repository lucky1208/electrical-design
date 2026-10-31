/* EVSE/BESS schematic generation worker. Keep dependency order in sync with index.html. */
self.window = self;
importScripts(
  'evse-core.js',
  'evse-mwess-core.js',
  'evse-vendor-kb.js',
  'evse-source.js',
  'evse-geo.js',
  'evse-labelfix.js'
);

self.__EVSE_PROGRESS = function (message) {
  self.postMessage({ type: 'progress', message: message });
};

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type !== 'generate') return;
  try {
    const design = self.EVSE_GEO.generate(data.params || {});
    self.postMessage({ type: 'result', design: design });
  } catch (error) {
    self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : '' });
  }
};
