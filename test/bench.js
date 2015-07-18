#!/usr/bin/env node

// Do simple benchmark.

var fs = require("fs");
var path = require("path");
var ffmpeg = require("../ffmpeg-webm");

var testDataPath = path.join(__dirname, "test.webm");
var testData = new Uint8Array(fs.readFileSync(testDataPath));

ffmpeg({
  arguments: [
    "-i", "test.webm",
    "-frames:v", "5", "-c:v", "libvpx",
    "-an",
    "-f", "webm", "-y", "/dev/null",
  ],
  stdin: function() {},
  MEMFS: [{name: "test.webm", data: testData}],
  TOTAL_MEMORY: 67108864,  // 64M
});
