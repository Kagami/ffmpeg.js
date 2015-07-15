# ffmpeg.js [![Build Status](https://travis-ci.org/Kagami/ffmpeg.js.svg?branch=master)](https://travis-ci.org/Kagami/ffmpeg.js)

[![NPM](https://nodei.co/npm/ffmpeg.js.png?downloads=true)](https://www.npmjs.com/package/ffmpeg.js)

This library provides FFmpeg builds ported to JavaScript using [Emscripten project](https://github.com/kripken/emscripten). Builds are optimized for in-browser use: minimal size for faster loading, asm.js, performance tunings, etc. Though they work in Node as well.

## Contents

Currently available builds (additional builds may be added in future):

* `ffmpeg-webm.js`: WebM encoding (VP8/VP9/Opus encoders, a lot of decoders)
* `ffmpeg-worker-webm.js`: Web Worker version of the `ffmpeg-webm`

Note: only NPM releases contain abovementioned files.

## Usage

### Sync version

Print FFmpeg's version:

```js
var ffmpeg = require("ffmpeg.js");
var stdout = '';
var stderr = '';
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

See documentation on [Module object](https://kripken.github.io/emscripten-site/docs/api_reference/module.html#affecting-execution) for the list of options that you can pass.

### Web Worker version

*TODO*

### Files

*TODO*

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
