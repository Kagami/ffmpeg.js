#!/usr/bin/env node

// Do simple benchmark.
// Usage: `node bench.js [test.mkv]'

var fs = require("fs");
var path = require("path");
var ffmpeg = require("../ffmpeg-webm");

var testDataName = path.basename(process.argv[2] || "test.webm");
var testDataPath = process.argv[2] || path.join(__dirname, "test.webm");
var testData = new Uint8Array(fs.readFileSync(testDataPath));

ffmpeg({
  arguments: [
    "-i", testDataName,
    "-frames:v", "5", "-c:v", "libvpx",
    "-an",
    "-f", "null", "-",
  ],
  stdin: function() {},
  MEMFS: [{name: testDataName, data: testData}],
  TOTAL_MEMORY: 67108864,  // 64M
});
