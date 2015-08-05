function __ffmpegjs(__ffmpegjs_opts) {
  __ffmpegjs_opts = __ffmpegjs_opts || {};
  var __ffmpegjs_return;
  var Module = {};

  Object.keys(__ffmpegjs_opts).forEach(function(key) {
    if (key != "mounts" && key != "MEMFS") {
      Module[key] = __ffmpegjs_opts[key];
    }
  });

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
      var data = file["data"];
      // `FS.write` accepts only `Uint8Array`, so we do conversion here
      // to simplify our API. It will work with plain `Array` too.
      if (ArrayBuffer.isView(data)) {
        // Avoid unnecessary copying.
        if (!(data instanceof Uint8Array)) data = new Uint8Array(data.buffer);
      } else {
        data = new Uint8Array(data);
      }
      FS.write(fd, data, 0, data.length);
      FS.close(fd);
    });
  };

  Module["postRun"] = function() {
    var inFiles = Object.create(null);
    var hasProto = false;
    function set(obj, prop) {
      if (prop === "__proto__") {
        hasProto = true;
      } else {
        inFiles[prop] = true;
      }
    }
    function has(obj, prop) {
      return prop === "__proto__" ? hasProto : prop in obj;
    }
    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      set(inFiles, file["name"]);
    });
    var files = FS.lookupPath("/work").node.contents;
    // NOTE(Kagami): Search for files only in working directory, one
    // level depth. Since FFmpeg shouldn't normally create
    // subdirectories, it should be enough.
    var outFiles = Object.keys(files).filter(function(filename) {
      return !has(inFiles, filename);
    }).map(function(filename) {
      var data = files[filename].contents;
      // library_memfs will use `Array` for newly created files (see
      // settings.js, MEMFS_APPEND_TO_TYPED_ARRAYS), so convert them
      // back to typed arrays to simplify API.
      if (ArrayBuffer.isView(data)) {
        if (!(data instanceof Uint8Array)) data = new Uint8Array(data.buffer);
      } else {
        data = new Uint8Array(data);
      }
      return {"name": filename, "data": data};
    });
    __ffmpegjs_return = {"MEMFS": outFiles};
  };
