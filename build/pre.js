function __ffmpegjs(__ffmpegjs_opts) {
  __ffmpegjs_opts = __ffmpegjs_opts || {};
  var __ffmpegjs_return;
  var Module = {};

  // User options.
  (function() {
    var key;
    for (key in __ffmpegjs_opts) {
      if (key != "mounts" && key != "MEMFS") {
        Module[key] = __ffmpegjs_opts[key];
      }
    }
  })();

  Module["preRun"] = function() {
    (__ffmpegjs_opts["mounts"] || []).forEach(function(mount) {
      var fs;
      if (mount["type"] == "NODEFS") {
        fs = NODEFS;
      } else if (mount["type"] == "IDBFS") {
        fs = IDBFS;
      } else {
        throw new Error("Bad mount type");
      }
      var mountpoint = mount["mountpoint"];
      // NOTE(Kagami): Subdirs are not allowed in the paths to simplify
      // things and avoid ".." escapes.
      if (!mountpoint.match(/^\/[^\/]+$/) ||
          mountpoint == "/tmp" ||
          mountpoint == "/home" ||
          mountpoint == "/dev" ||
          mountpoint == "/work") {
        throw new Error("Bad mount point");
      }
      FS.mkdir(mountpoint);
      FS.mount(fs, mount["opts"], mountpoint);
    });

    FS.mkdir("/work");
    FS.chdir("/work");

    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      if (file["name"].match(/\//)) {
        throw new Error("Bad file name");
      }
      var fd = FS.open(file["name"], "w+");
      FS.write(fd, file["data"], 0, file["data"].length);
      FS.close(fd);
    });
  };

  Module["postRun"] = function() {
    function has(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }
    var inFiles = {};
    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      inFiles[file["name"]] = true;
    });
    var files = FS.lookupPath(".").node.contents;
    var outFiles = []
    var filename;
    for (filename in files) {
      if (!has(inFiles, filename)) {
        outFiles.push({"name": filename, "data": files[filename].contents});
      }
    }
    __ffmpegjs_return = {"MEMFS": outFiles};
  };
