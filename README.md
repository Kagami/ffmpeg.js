# ffmpeg.js [![Build Status](https://travis-ci.org/Kagami/ffmpeg.js.svg?branch=master)](https://travis-ci.org/Kagami/ffmpeg.js)

[![NPM](https://nodei.co/npm/ffmpeg.js.png?downloads=true)](https://www.npmjs.com/package/ffmpeg.js)

This library provides FFmpeg builds ported to JavaScript using [Emscripten project](https://github.com/kripken/emscripten). Builds are optimized for in-browser use: minimal size for faster loading, asm.js, performance tunings, etc. Though they work in Node as well.

## Builds

Currently available builds (additional builds may be added in future):
* `ffmpeg-webm.js` - WebM encoding (VP8 & Opus encoders, popular decoders).
* `ffmpeg-worker-webm.js` - Web Worker version of `ffmpeg-webm.js`.

Note: only NPM releases contain abovementioned files.

## Version scheme

ffmpeg.js uses the following version pattern: `major.minor.9ddd`, where:
* **major** - FFmpeg's major version number used in the builds.
* **minor** - FFmpeg's minor version.
* **ddd** - ffmpeg.js own patch version. Should not be confused with FFmpeg's patch version number.

Example: `2.7.9005`

## Usage

See documentation on [Module object](https://kripken.github.io/emscripten-site/docs/api_reference/module.html#affecting-execution) for the list of options that you can pass.

### Sync run

ffmpeg.js provides common module API, `ffmpeg-webm.js` is the default module.

```js
var ffmpeg = require("ffmpeg.js");
var stdout = "";
var stderr = "";
// Print FFmpeg's version.
ffmpeg({
  arguments: ["-version"],
  print: function(data) { stdout += data + "\n"; },
  printErr: function(data) { stderr += data + "\n"; },
  onExit: function(code) {
    console.log("Process exited with code " + code);
    console.log(stdout);
  },
});
```

Use e.g. [browserify](https://github.com/substack/node-browserify) in case of Browser.

### Via Web Worker

ffmpeg.js also provides wrapper for main function with Web Worker interface to offload the work to different process. Worker sends the following messages:
* `{type: "ready"}` - Worker loaded and ready to accept commands.
* `{type: "run"}` - Worker started the job.
* `{type: "stdout", data: "<line>"}` - FFmpeg printed to stdout.
* `{type: "stderr", data: "<line>"}` - FFmpeg printed to stderr.
* `{type: "exit", data: "<code>"}` - FFmpeg exited.
* `{type: "done", data: "<result>"}` - Job finished with some result.
* `{type: "error", data: "<error description>"}` - Error occured.

You can send the following messages to the worker:
* `{type: "run", ...opts}` - Start new job with provided options.

```js
var stdout = "";
var stderr = "";
var worker = new Worker("ffmpeg-worker-webm.js");
worker.onmessage = function(e) {
  var msg = e.data;
  switch (msg.type) {
  case "ready":
    worker.postMessage({type: "run", arguments: ["-version"]});
    break;
  case "stdout":
    stdout += msg.data + "\n";
    break;
  case "stderr":
    stderr += msg.data + "\n";
    break;
  case "exit":
    console.log("Process exited with code " + code);
    console.log(stdout);
    worker.terminate();
    break;
  }
};
```

This works in Browser as is, use e.g. [webworker-threads](https://github.com/audreyt/node-webworker-threads) Web Worker implementation in Node.

### Files

Empscripten has 3 types of file systems: [MEMFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#memfs), [NODEFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#nodefs) and [IDBFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#filesystem-api-idbfs). ffmpeg.js uses MEMFS to store the input/output files in FFmpeg's working directory. You need to pass *Array* of *Object* to `MEMFS` option with the following keys:
* **name** *(String)* - File name, can't contain slashes.
* **data** *(ArrayBufferView)* - File data.

ffmpeg.js resulting object has `MEMFS` option with the same structure and contains files which weren't passed to the input, i.e. new files created by FFmpeg.

```js
var ffmpeg = require("ffmpeg.js");
var fs = require("fs");
var testData = new Uint8Array(fs.readFileSync("test.webm"));
// Encode test video to VP8.
var result = ffmpeg({
  MEMFS: [{name: "test.webm", data: testData}],
  arguments: ["-i", "test.webm", "-c:v", "libvpx", "-an", "out.webm"],
  // Ignore stdin read requests.
  stdin: function() {},
});
// Write out.webm to disk.
var out = result.MEMFS[0];
fs.writeFileSync(out.name, Buffer(out.data));
```

You can also mount NODEFS and IDBFS filesystem by passing *Array* of *Object* to `mounts` option with the following keys:
* **type** *(String)* - `NODEFS` or `IDBFS`.
* **opts** *(Object)* - Underlying file system options.
* **mountpoint** *(String)* - Mount path, must start with a slash, must not contain other slashes and also the following paths are blacklisted: `/tmp`, `/home`, `/dev`, `/work`. Mount directory will be created automatically before mount.

See documentation of [FS.mount](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#FS.mount) for more details.

```js
var ffmpeg = require("ffmpeg.js");
ffmpeg({
  // Mount /data inside application to the current directory.
  mounts: [{type: "NODEFS", opts: {root: "."}, mountpoint: "/data"}],
  arguments: ["-i", "/data/test.webm", "-c:v", "libvpx", "-an", "/data/out.webm"],
  stdin: function() {},
});
// out.webm was written to the current directory.
```

## Credits

Thanks to [videoconverter.js](https://bgrins.github.io/videoconverter.js/) for inspiration. And of course to all great projects which made this library possible: FFmpeg, Emscripten, asm.js, node.js and many others.

## License

* Library uses LGPL FFmpeg builds, see [here](https://www.ffmpeg.org/legal.html) for more details and FFmpeg's license information.
* Library includes libopus which is [licensed under BSD](https://git.xiph.org/?p=opus.git;a=blob;f=COPYING;h=9c739c34a3a9dd39729587eb6b1f9dd4344e58f6;hb=HEAD).
* Library includes libvpx which is [licensed under BSD](https://chromium.googlesource.com/webm/libvpx/+/master/LICENSE).
* Own library code licensed under LGPL 2.1 or later.

See [LICENSE](https://github.com/Kagami/ffmpeg.js/blob/master/LICENSE) for the full text of licenses.
