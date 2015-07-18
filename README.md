# ffmpeg.js [![Build Status](https://travis-ci.org/Kagami/ffmpeg.js.svg?branch=master)](https://travis-ci.org/Kagami/ffmpeg.js)

[![NPM](https://nodei.co/npm/ffmpeg.js.png?downloads=true)](https://www.npmjs.com/package/ffmpeg.js)

This library provides FFmpeg builds ported to JavaScript using [Emscripten project](https://github.com/kripken/emscripten). Builds are optimized for in-browser use: minimal size for faster loading, asm.js, performance tunings, etc. Though they work in Node as well.

## Contents

Currently available builds (additional builds may be added in future):

* `ffmpeg-webm.js`: WebM encoding (VP8/VP9/Opus encoders, a lot of decoders)
* `ffmpeg-worker-webm.js`: Web Worker version of the `ffmpeg-webm`

Note: only NPM releases contain abovementioned files.

## Usage

See documentation on [Module object](https://kripken.github.io/emscripten-site/docs/api_reference/module.html#affecting-execution) for the list of options that you can pass.

### Sync run

Print FFmpeg's version:

```js
var ffmpeg = require("ffmpeg.js");
var stdout = "";
var stderr = "";
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

Print FFmpeg's version:

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

*TODO: Document messages*

This works in Browser as is, use e.g. [webworker-threads](https://github.com/audreyt/node-webworker-threads) Web Worker implementation in Node.

### Files

Empscripten has 3 types of file systems: [MEMFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#memfs), [NODEFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#nodefs) and [IDBFS](https://kripken.github.io/emscripten-site/docs/api_reference/Filesystem-API.html#filesystem-api-idbfs). ffmpeg.js uses MEMFS to store the input/output files in FFmpeg's working directory. You need to pass *Array* of *Object* to `MEMFS` option with the following keys:
* **name** *(String)* - File name, can't contain slashes.
* **data** *(ArrayBufferView)* - File data.

ffmpeg.js resulting object has `MEMFS` option with the same structure and contains files which weren't passed to the input, i.e. new files created by FFmpeg.

```js
var ffmpeg = require("ffmpeg.js");
var fs = require("fs");
var testData = new Uint8Array(fs.readFileSync("webm"));
var result = ffmpeg({
  MEMFS: [{name: "test.webm", data: testData}],
  arguments: ["-i", "test.webm", "-c:v", "libvpx", "-an", "out.webm"],
  stdin: function() {},
});
// Write out.webm to disk.
var out = result.MEMFS[0];
fs.writeFileSync(out.name, Buffer(out.data));
```

You can also mount NODEFS and IDBFS filesystem by passing *Array* of *Object* to `mounts` option with the following keys:
* **type** *(String)* - `NODEFS` or `IDBFS`.
* **opts** *(Object)* - Underlying file system options.
* **mountpoint** *(String)* - Mount path, must start with a slash, must not contain other slashes and also following paths are blacklisted: `/tmp`, `/home`, `/dev`, `/work`. Mount directory will be created automatically before mount.

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

## Version scheme

*TODO*

## Credits

Thanks to [videoconverter.js](https://bgrins.github.io/videoconverter.js/) for inspiration. And of course to all great projects which made this library possible: FFmpeg, Emscripten, asm.js, node.js and many others.

## License

Library uses LGPL FFmpeg builds, see [here](https://www.ffmpeg.org/legal.html) for more details and FFmpeg's license information. Own library code licensed under LGPL 2.1 or later as well.

```
ffmpeg.js - Port of FFmpeg with Emscripten

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either
version 2.1 of the License, or (at your option) any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
```
