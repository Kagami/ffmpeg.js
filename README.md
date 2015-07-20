# ffmpeg.js [![Build Status](https://travis-ci.org/Kagami/ffmpeg.js.svg?branch=master)](https://travis-ci.org/Kagami/ffmpeg.js)

[![NPM](https://nodei.co/npm/ffmpeg.js.png?downloads=true)](https://www.npmjs.com/package/ffmpeg.js)

This library provides FFmpeg builds ported to JavaScript using [Emscripten project](https://github.com/kripken/emscripten). Builds are optimized for in-browser use: minimal size for faster loading, asm.js, performance tunings, etc. Though they work in Node as well.

## Builds

ffmpeg.js uses latest available revisions of FFmpeg and dependencies on the moment of build in almost all cases, see [build directory](https://github.com/Kagami/ffmpeg.js/tree/master/build) for the exact commits being used.

Currently available builds (additional builds may be added in future):
* `ffmpeg-webm.js` - WebM encoding (VP8/VP9/Vorbis/Opus encoders, a lot of decoders).
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

### FFmpeg

Library uses LGPL FFmpeg builds, see [here](https://www.ffmpeg.org/legal.html) for more details and FFmpeg's license information.

```
This software uses code of FFmpeg <http://ffmpeg.org> licensed under the LGPLv2.1 <http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html> and its source can be downloaded here <https://ffmpeg.org/download.html>.
```

### libvpx

Library includes libvpx which is licensed under BSD.

```
Copyright (c) 2010, The WebM Project authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in
    the documentation and/or other materials provided with the
    distribution.

  * Neither the name of Google, nor the WebM Project, nor the names
    of its contributors may be used to endorse or promote products
    derived from this software without specific prior written
    permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### ffmpeg.js

Own library code licensed under LGPL 2.1 or later as well.

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
