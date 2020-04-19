#!/usr/bin/env node

if (process.argv.length < 3) {
  console.log("Usage: node test/ffmp4.js -i test/test.webm -preset ultrafast -t 1 -y test/out.mp4");
  return;
}

require("../ffmpeg-mp4")({
  arguments: process.argv.slice(2),
  mounts: [{type: "NODEFS", opts: {root: __dirname}, mountpoint: "/test"}],
  chdir: "/",
});
