importScripts('./analyzer.js');

self.onmessage = function (event) {
  var data = event.data || {};
  try {
    var candidates = self.DrumAnalyzer.analyze(data.samples, data.sampleRate, function (progress) {
      self.postMessage({ type: 'progress', progress: progress, id: data.id });
    });
    self.postMessage({ type: 'done', id: data.id, candidates: candidates });
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: data.id,
      message: String(err && err.message ? err.message : err)
    });
  }
};
