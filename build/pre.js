function ffmpeg(opts) {
  var Module = {};
  var key;
  // User options.
  for (key in opts) {
    Module[key] = opts[key];
  }
  // Override some options.
  // XXX(Kagami): Prevent emscripten to call `process.exit` at the end
  // of execution on Node.
  Module["preInit"] = function() {
    // We can redefine `exit` and use `ENVIRONMENT_IS_NODE` variable
    // only after main function code started executing.
    if (ENVIRONMENT_IS_NODE) {
      exit = Module["exit"] = function(status) {
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;

        exitRuntime();

        if (Module["onExit"]) Module["onExit"](status);

        throw new ExitStatus(status);
      };
    }
  };
