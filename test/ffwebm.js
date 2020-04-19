#!/usr/bin/env node

if (process.argv.length < 3) {
  console.log("Usage: node test/ffwebm.js -i test/test.webm -speed 5 -t 1 -y test/out.webm");
  return;
}

require("../ffmpeg-webm")({
  arguments: process.argv.slice(2),
  mounts: [{type: "NODEFS", opts: {root: __dirname}, mountpoint: "/test"}],
  chdir: "/",
});
