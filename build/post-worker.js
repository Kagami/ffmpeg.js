  return __ffmpegjs_return;
}

var __ffmpegjs_running = false;

// Shim for nodejs
if (typeof self === "undefined") {
  self = require("worker_threads")["parentPort"];
}

self.onmessage = function(e) {
  var msg = e.data;
  if (msg["type"] == "run") {
    if (__ffmpegjs_running) {
      self.postMessage({"type": "error", "data": "already running"});
    } else {
      __ffmpegjs_running = true;
      self.postMessage({"type": "run"});
      var opts = {};
      Object.keys(msg).forEach(function(key) {
        if (key !== "type") {
          opts[key] = msg[key]
        }
      });
      opts["print"] = function(line) {
        self.postMessage({"type": "stdout", "data": line});
      };
      opts["printErr"] = function(line) {
        self.postMessage({"type": "stderr", "data": line});
      };
      opts["onExit"] = function(code) {
        self.postMessage({"type": "exit", "data": code});
      };
      // TODO(Kagami): Should we wrap this function into try/catch in
      // case of possible exception?
      var result = __ffmpegjs(opts);
      var transfer = result["MEMFS"].map(function(file) {
        return file["data"].buffer;
      });
      self.postMessage({"type": "done", "data": result}, transfer);
      __ffmpegjs_running = false;
    }
  } else {
    self.postMessage({"type": "error", "data": "unknown command"});
  }
};

self.postMessage({"type": "ready"});
