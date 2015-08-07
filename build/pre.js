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
      if (ArrayBuffer["isView"](data)) {
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
    var SimpleSet = function() {
      var obj = Object.create(null);
      var hasProto = false;
      return {
        has: function(prop) {
          return prop === "__proto__" ? hasProto : prop in obj;
        },
        set: function(prop) {
          if (prop === "__proto__") {
            hasProto = true;
          } else {
            obj[prop] = true;
          }
        },
      };
    };

    // NOTE(Kagami): Search for files only in working directory, one
    // level depth. Since FFmpeg shouldn't normally create
    // subdirectories, it should be enough.
    function listFiles(dir) {
      var obj = FS.lookupPath(dir).node.contents;
      var names = Object.keys(obj);
      // Fix for possible file with "__proto__" name. See
      // <https://github.com/kripken/emscripten/issues/3663> for
      // details.
      if (obj.__proto__ && obj.__proto__.name === "__proto__") {
        names.push("__proto__");
      }
      return names.map(function(name) {
        return obj[name];
      });
    }

    var inFiles = SimpleSet();
    (__ffmpegjs_opts["MEMFS"] || []).forEach(function(file) {
      inFiles.set(file["name"]);
    });
    var outFiles = listFiles("/work").filter(function(file) {
      return !inFiles.has(file.name);
    }).map(function(file) {
      var data = file.contents;
      // library_memfs will use `Array` for newly created files (see
      // settings.js, MEMFS_APPEND_TO_TYPED_ARRAYS), so convert them
      // back to typed arrays to simplify API.
      if (ArrayBuffer["isView"](data)) {
        if (!(data instanceof Uint8Array)) data = new Uint8Array(data.buffer);
      } else {
        data = new Uint8Array(data || []);
      }
      return {"name": file.name, "data": data};
    });
    __ffmpegjs_return = {"MEMFS": outFiles};
  };
