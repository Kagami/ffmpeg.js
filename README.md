# ffmpeg.js

[![NPM](https://nodei.co/npm/ffmpeg.js.png?downloads=true)](https://www.npmjs.com/package/ffmpeg.js)

This library provides FFmpeg builds ported to JavaScript using [Emscripten project](https://github.com/emscripten-core/emscripten). Builds are optimized for in-browser use: minimal size for faster loading, asm.js, performance tunings, etc. Though they work in Node as well.

## Builds

Currently available builds (additional builds may be added in future):
* `ffmpeg-webm.js` - WebM encoding (VP8 & Opus encoders, popular decoders).
* `ffmpeg-worker-webm.js` - Web Worker version of `ffmpeg-webm.js`.
* `ffmpeg-mp4.js` - MP4 encoding (H.264 & AAC & MP3 encoders, popular decoders).
* `ffmpeg-worker-mp4.js` - Web Worker version of `ffmpeg-mp4.js`.

Note: only NPM releases contain abovementioned files.

## Version scheme

ffmpeg.js uses the following version pattern: `major.minor.9ddd`, where:
* **major** - FFmpeg's major version number used in the builds.
* **minor** - FFmpeg's minor version.
* **ddd** - ffmpeg.js own patch version. Should not be confused with FFmpeg's patch version number.

Example: `2.7.9005`

## Usage

See documentation on [Module object](https://emscripten.org/docs/api_reference/module.html#affecting-execution) for the list of options that you can pass.

### Sync run

ffmpeg.js provides common module API, `ffmpeg-webm.js` is the default module. Add its name after the slash if you need another build, e.g. `require("ffmpeg.js/ffmpeg-mp4.js")`.

```js
const ffmpeg = require("ffmpeg.js");
let stdout = "";
let stderr = "";
// Print FFmpeg's version.
ffmpeg({
  arguments: ["-version"],
  print: function(data) { stdout += data + "\n"; },
  printErr: function(data) { stderr += data + "\n"; },
  onExit: function(code) {
    console.log("Process exited with code " + code);
    console.log(stdout);
    console.log(stderr);
  },
});
```

Use e.g. [browserify](https://github.com/browserify/browserify) in case of Browser.

### Via Web Worker

ffmpeg.js also provides wrapper for main function with Web Worker interface to offload the work to a different process. Worker sends the following messages:
* `{type: "ready"}` - Worker loaded and ready to accept commands.
* `{type: "run"}` - Worker started the job.
* `{type: "stdout", data: "<line>"}` - FFmpeg printed to stdout.
* `{type: "stderr", data: "<line>"}` - FFmpeg printed to stderr.
* `{type: "exit", data: "<code>"}` - FFmpeg exited.
* `{type: "done", data: "<result>"}` - Job finished with some result.
* `{type: "error", data: "<error description>"}` - Error occurred.
* `{type: "abort", data: "<abort reason>"}` - FFmpeg terminated abnormally (e.g. out of memory, wasm error).

You can send the following messages to the worker:
* `{type: "run", ...opts}` - Start new job with provided options.

```js
const worker = new Worker("ffmpeg-worker-webm.js");
worker.onmessage = function(e) {
  const msg = e.data;
  switch (msg.type) {
  case "ready":
    worker.postMessage({type: "run", arguments: ["-version"]});
    break;
  case "stdout":
    console.log(msg.data);
    break;
  case "stderr":
    console.log(msg.data);
    break;
  case "done":
    console.log(msg.data);
    break;
  }
};
```

You can use [worker_threads](https://nodejs.org/api/worker_threads.html) module in case of Node.

### Files

Empscripten supports several types of [file systems](https://emscripten.org/docs/api_reference/Filesystem-API.html#file-systems). ffmpeg.js uses [MEMFS](https://emscripten.org/docs/api_reference/Filesystem-API.html#memfs) to store the input/output files in FFmpeg's working directory. You need to pass *Array* of *Object* to `MEMFS` option with the following keys:
* **name** *(String)* - File name, can't contain slashes.
* **data** *(ArrayBuffer/ArrayBufferView/Array)* - File data.

ffmpeg.js resulting object has `MEMFS` option with the same structure and contains files which weren't passed to the input, i.e. new files created by FFmpeg.

```js
const ffmpeg = require("ffmpeg.js");
const fs = require("fs");
const testData = new Uint8Array(fs.readFileSync("test.webm"));
// Encode test video to VP8.
const result = ffmpeg({
  MEMFS: [{name: "test.webm", data: testData}],
  arguments: ["-i", "test.webm", "-c:v", "libvpx", "-an", "out.webm"],
});
// Write out.webm to disk.
const out = result.MEMFS[0];
fs.writeFileSync(out.name, Buffer(out.data));
```

You can also mount other FS by passing *Array* of *Object* to `mounts` option with the following keys:
* **type** *(String)* - Name of the file system.
* **opts** *(Object)* - Underlying file system options.
* **mountpoint** *(String)* - Mount path, must start with a slash, must not contain other slashes and also the following paths are blacklisted: `/tmp`, `/home`, `/dev`, `/work`. Mount directory will be created automatically before mount.

See documentation of [FS.mount](https://emscripten.org/docs/api_reference/Filesystem-API.html#FS.mount) for more details.

```js
const ffmpeg = require("ffmpeg.js");
ffmpeg({
  // Mount /data inside application to the current directory.
  mounts: [{type: "NODEFS", opts: {root: "."}, mountpoint: "/data"}],
  arguments: ["-i", "/data/test.webm", "-c:v", "libvpx", "-an", "-y", "/data/out.webm"],
});
// out.webm was written to the current directory.
```

## Build instructions

It's recommended to use [Docker](https://www.docker.com/) to build ffmpeg.js.

1.  Clone ffmpeg.js repository with submodules:
    ```bash
    git clone https://github.com/Kagami/ffmpeg.js.git --recurse-submodules
    ```

2.  Modify Makefile and/or patches if you wish to make a custom build.

3.  Build everything:
    ```bash
    docker run --rm -it -v /path/to/ffmpeg.js:/mnt -w /opt kagamihi/ffmpeg.js
    # cp -a /mnt/{.git,build,Makefile} . && source /root/emsdk/emsdk_env.sh && make && cp ffmpeg*.js /mnt
    ```

That's it. ffmpeg.js modules should appear in your repository clone.

## Build without Docker

Ubuntu example:

```bash
sudo apt-get update
sudo apt-get install -y git python build-essential automake libtool pkg-config

cd ~
git clone https://github.com/emscripten-core/emsdk.git && cd emsdk
./emsdk install latest
./emsdk activate latest
source emsdk_env.sh

cd ~
git clone https://github.com/Kagami/ffmpeg.js.git --recurse-submodules && cd ffmpeg.js
make
```

## Credits

Thanks to [videoconverter.js](https://bgrins.github.io/videoconverter.js/) for inspiration. And of course to all great projects which made this library possible: FFmpeg, Emscripten, asm.js, node.js and many others.

## License

Own library code licensed under LGPL 2.1 or later.

### WebM build

This build uses LGPL version of FFmpeg and thus available under LGPL 2.1 or later. See [here](https://www.ffmpeg.org/legal.html) for more details and FFmpeg's license information.

Included libraries:
* libopus [licensed under BSD](https://git.xiph.org/?p=opus.git;a=blob;f=COPYING).
* libvpx [licensed under BSD](https://chromium.googlesource.com/webm/libvpx/+/master/LICENSE).

See [LICENSE.WEBM](https://github.com/Kagami/ffmpeg.js/blob/master/LICENSE.WEBM) for the full text of software licenses used in this build.

### MP4 build

This build uses GPL version of FFmpeg and thus available under GPL 2.0. It also includes patent encumbered H.264, AAC and MP3 encoders. Make sure to contact lawyer before using it in your country.

Included libraries:
* x264 [licensed under GPL](https://git.videolan.org/?p=x264.git;a=blob;f=COPYING).
* LAME [licensed under LGPL](https://github.com/rbrito/lame/blob/origin/COPYING).

See [LICENSE.MP4](https://github.com/Kagami/ffmpeg.js/blob/master/LICENSE.MP4) for the full text of software licenses used in this build.
