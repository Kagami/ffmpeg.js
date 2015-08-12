  return __ffmpegjs_return;
}

var __ffmpegjs_running = false;

self.onmessage = function(e) {
  function makeOutHandler(cb) {
    var buf = [];
    return function(ch, exit) {
      if (exit && buf.length) return cb(__ffmpegjs_utf8ToStr(buf, 0));
      if (ch === 10 || ch === 13) {
        cb(__ffmpegjs_utf8ToStr(buf, 0));
        buf = [];
      } else if (ch !== 0) {
        // See <https://github.com/kripken/emscripten/blob/1.34.4/
        // src/library_tty.js#L146>.
        buf.push(ch);
      }
    };
  }

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
      opts["stdin"] = function() {
        // NOTE(Kagami): Since it's not possible to pass stdin callback
        // via Web Worker message interface, set stdin to no-op. We are
        // messing with other handlers anyway.
      };
      opts["stdout"] = makeOutHandler(function(line) {
        self.postMessage({"type": "stdout", "data": line});
      });
      opts["stderr"] = makeOutHandler(function(line) {
        self.postMessage({"type": "stderr", "data": line});
      });
      opts["onExit"] = function(code) {
        // Flush buffers.
        opts["stdout"](0, true);
        opts["stderr"](0, true);
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
