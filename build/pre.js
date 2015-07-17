function __ffmpegjs(__ffmpegjs_opts) {
  __ffmpegjs_opts = __ffmpegjs_opts || {};
  var Module = {};
  var __ffmpegjs_return;

  // User options.
  (function() {
    var key;
    for (key in __ffmpegjs_opts) {
      if (key != "mounts" && key != "MEMFS") {
        Module[key] = __ffmpegjs_opts[key];
      }
    }
  })();

  // Override some options.
  Module["preInit"] = function() {
    // XXX(Kagami): Prevent emscripten to call `process.exit` at the end
    // of execution on Node; we can redefine `exit` and use
    // `ENVIRONMENT_IS_NODE` variable only after main function code
    // started executing.
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

  Module["preRun"] = function() {
    (__ffmpegjs_opts.mounts || []).forEach(function(mount) {
      var fs;
      if (mount.type == "NODEFS") {
        fs = NODEFS;
      } else if (mount.type == "IDBFS") {
        fs = IDBFS;
      } else {
        throw new Error("Bad mount type");
      }
      // NOTE(Kagami): Subdirs are not allowed in the paths to simplify
      // things and avoid ".." escapes.
      if (!mount.mountpoint.match(/^\/[^\/]+$/) ||
          mount.mountpoint == "/tmp" ||
          mount.mountpoint == "/home" ||
          mount.mountpoint == "/dev" ||
          mount.mountpoint == "/work") {
        throw new Error("Bad mount point");
      }
      FS.mkdir(mount.mountpoint);
      FS.mount(fs, mount.opts, mount.mountpoint);
    });

    FS.mkdir("/work");
    FS.chdir("/work");

    (__ffmpegjs_opts.MEMFS || []).forEach(function(file) {
      if (file.name.match(/\//)) {
        throw new Error("Bad file name");
      }
      var fd = FS.open(file.name, "w+");
      FS.write(fd, file.data, 0, file.data.length);
      FS.close(fd);
    });
  };

  Module["postRun"] = function() {
    function has(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }
    var inFiles = {};
    (__ffmpegjs_opts.MEMFS || []).forEach(function(file) {
      inFiles[file.name] = true;
    });
    var files = FS.lookupPath(".").node.contents;
    var outFiles = []
    var filename;
    for (filename in files) {
      if (!has(inFiles, filename)) {
        outFiles.push({name: filename, data: files[filename].contents});
      }
    }
    __ffmpegjs_return = {MEMFS: outFiles};
  };
