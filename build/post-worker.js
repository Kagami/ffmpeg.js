  return __ffmpegjs_return;
}

var __ffmpegjs_running = false;

self.onmessage = function(e) {
  var msg = e.data;
  var opts, key, result;
  if (msg.type == "run") {
    if (__ffmpegjs_running) {
      self.postMessage({type: "error", data: "already running"});
    } else {
      __ffmpegjs_running = true;
      self.postMessage({type: "run"});
      opts = {};
      for (key in msg) {
        if (key !== "type") {
          opts[key] = msg[key]
        }
      }
      opts.stdin = function() {
        // NOTE(Kagami): Since it's not possible to pass stdin callback
        // via Web Worker message interface, set stdin to no-op. We are
        // messing with other handlers anyway.
      };
      opts.print = function(data) {
        self.postMessage({type: "stdout", data: data});
      };
      opts.printErr = function(data) {
        self.postMessage({type: "stderr", data: data});
      };
      opts.onExit = function(code) {
        self.postMessage({type: "exit", data: code});
      };
      // TODO(Kagami): Should we wrap this function into try/catch in
      // case of possible exception?
      result = __ffmpegjs(opts);
      self.postMessage({type: "done", data: result});
      __ffmpegjs_running = false;
    }
  } else {
    self.postMessage({type: "error", data: "unknown command"});
  }
};

self.postMessage({type: "ready"});
