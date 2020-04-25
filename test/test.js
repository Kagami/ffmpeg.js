var expect = require("chai").expect;
var fs = require("fs");
var path = require("path");
var Worker = require("worker_threads").Worker;
var ffmpeg_webm = require("../ffmpeg-webm");
var ffmpeg_mp4 = require("../ffmpeg-mp4");

function noop() {}
var testDataPath = path.join(__dirname, "test.webm");
var testData = new Uint8Array(fs.readFileSync(testDataPath));

describe("WebM", function() {
  this.timeout(20000);

  describe("Sync", function() {
    it("should print version to stdout", function() {
      var code;
      var stdout = "";
      var stderr = "";
      ffmpeg_webm({
        arguments: ["-version"],
        print: function(data) { stdout += data + "\n"; },
        printErr: function(data) { stderr += data + "\n"; },
        onExit: function(v) {code = v},
      });
      expect(code).to.equal(0);
      expect(stderr).to.be.empty;
      expect(stdout).to.match(/^ffmpeg version /);
    });

    it("shouldn't return input files at MEMFS", function() {
      var res = ffmpeg_webm({
        arguments: [],
        print: noop,
        printErr: noop,
        MEMFS: [
          {name: "test.mkv", data: new Uint8Array(1)},
          {name: "222.webm", data: new Uint8Array(10)},
        ],
      });
      expect(res.MEMFS).to.be.empty;
    });

    it("should show metadata of test file at NODEFS", function() {
      var stderr = "";
      ffmpeg_webm({
        arguments: ["-i", "/data/test.webm"],
        print: noop,
        printErr: function(data) { stderr += data + "\n"; },
        mounts: [{type: "NODEFS", opts: {root: "test"}, mountpoint: "/data"}],
      });
      expect(stderr).to.match(/^Input.*matroska,webm/m);
      expect(stderr).to.match(/^\s+Stream.*Video: vp8/m);
      expect(stderr).to.match(/^\s+Stream.*Audio: vorbis/m);
    });

    it("should encode test file to WebM/VP8 at MEMFS", function() {
      var code;
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-frames:v", "5", "-c:v", "libvpx",
          "-an",
          "out.webm",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(code).to.equal(0);
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.webm");
      expect(file.data.length).to.be.above(0);
      expect(file.data).to.be.an.instanceof(Uint8Array);
    });

    it("should encode test file to WebM/Opus at MEMFS", function() {
      var code;
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-c:a", "libopus",
          "out.webm",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(code).to.equal(0);
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.webm");
      expect(file.data.length).to.be.above(0);
      expect(file.data).to.be.an.instanceof(Uint8Array);
    });

    it("should accept ArrayBuffer in MEMFS input", function() {
      var code;
      ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "-f", "null", "-",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData.buffer}],
      });
      expect(code).to.equal(0);
    });

    it("should accept Array in MEMFS input", function() {
      var data = Array.prototype.slice.call(testData);
      var code;
      ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "-f", "null", "-",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: data}],
      });
      expect(code).to.equal(0);
    });

    it("should accept Uint16Array in MEMFS input", function() {
      var data = new Uint16Array(testData.buffer);
      var code;
      ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "-f", "null", "-",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: data}],
      });
      expect(code).to.equal(0);
    });

    it("should work with crazy output name", function() {
      var code;
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "-f", "webm", "toString",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(code).to.equal(0);
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("toString");
      expect(file.data.length).to.be.above(0);
      expect(file.data).to.be.an.instanceof(Uint8Array);
    });

    it("should work with other crazy output name", function() {
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "-f", "webm", "__proto__",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(res.MEMFS).to.have.length(1);
      expect(res.MEMFS[0].name).to.equal("__proto__");
      expect(res.MEMFS[0].data.length).to.be.above(0);
    });

    it("should return empty array for empty output", function() {
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vf", "not_existent",
          "out.webm",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(res.MEMFS).to.have.length(1);
      expect(res.MEMFS[0].name).to.equal("out.webm");
      expect(res.MEMFS[0].data.length).to.equal(0);
    });

    /*it("should have subtitles filter", function() {
      var code;
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-frames:v", "1", "-c:v", "libvpx",
          "-vf", "subtitles=test.webm",
          "-an", "-f", "null", "-",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(code).to.equal(0);
    });*/

    it("should have Ogg muxer", function() {
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "libopus",
          "out.ogg",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.ogg");
      expect(file.data.length).to.be.above(0);
      expect(file.data).to.be.an.instanceof(Uint8Array);
    });

    it("should encode JPEGs to WebM", function() {
      var res = ffmpeg_webm({
        // FIXME(Kagami): pattern_type=sequence doesn't work with NODEFS
        // for some reason.
        arguments: [
          "-pattern_type", "glob",
          "-i", "/data/test-frame*.jpg",
          "out.webm",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        mounts: [{type: "NODEFS", opts: {root: "test"}, mountpoint: "/data"}],
      });
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.webm");
      expect(file.data.length).to.be.above(0);
    });

    it("should encode PNGs to WebM", function() {
      var res = ffmpeg_webm({
        arguments: [
          "-pattern_type", "glob",
          "-i", "/data/test-frame*.png",
          "out.webm",
        ],
        print: noop,
        printErr: noop,
        mounts: [{type: "NODEFS", opts: {root: "test"}, mountpoint: "/data"}],
      });
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.webm");
      expect(file.data.length).to.be.above(0);
    });
  });

  describe("Worker", function() {
    it("should print version to stdout", function(done) {
      var stdout = "";
      var stderr = "";
      var worker = new Worker("./ffmpeg-worker-webm.js");
      worker.on("error", done);
      worker.on("message", function(msg) {
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
          worker.terminate();
          expect(stderr).to.be.empty;
          expect(msg.data).to.equal(0);
          expect(stdout).to.match(/^ffmpeg version /);
          done();
          break;
        }
      });
    });

    it("should encode test file to WebM/VP8 at MEMFS", function(done) {
      var worker = new Worker("./ffmpeg-worker-webm.js");
      worker.onerror = done;
      worker.on("error", done);
      worker.on("message", function(msg) {
        switch (msg.type) {
        case "ready":
          worker.postMessage({
            type: "run",
            arguments: [
              "-i", "test.webm",
              "-frames:v", "5", "-c:v", "libvpx",
              "-an",
              "out.webm",
            ],
            MEMFS: [{name: "test.webm", data: testData}],
          });
          break;
        case "done":
          worker.terminate();
          var mem = msg.data.MEMFS;
          expect(mem).to.have.length(1);
          expect(mem[0].name).to.equal("out.webm");
          expect(mem[0].data.length).to.be.above(0);
          done();
          break;
        }
      });
    });
  });
});

describe("MP4", function() {
  this.timeout(20000);

  describe("Sync", function() {
    it("should print version to stdout", function() {
      var code;
      var stdout = "";
      var stderr = "";
      ffmpeg_mp4({
        arguments: ["-version"],
        print: function(data) { stdout += data + "\n"; },
        printErr: function(data) { stderr += data + "\n"; },
        onExit: function(v) {code = v},
      });
      expect(code).to.equal(0);
      expect(stderr).to.be.empty;
      expect(stdout).to.match(/^ffmpeg version /);
    });

    it("should encode test file to MP4/H.264/MP3 at MEMFS", function() {
      var code;
      var res = ffmpeg_mp4({
        arguments: [
          "-i", "test.webm",
          "-frames:v", "5", "-c:v", "libx264",
          "-c:a", "libmp3lame",
          "out.mp4",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        onExit: function(v) {code = v},
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(code).to.equal(0);
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.mp4");
      expect(file.data.length).to.be.above(0);
      expect(file.data).to.be.an.instanceof(Uint8Array);
    });

    it("should encode test file to MP4/AAC at MEMFS", function() {
      var res = ffmpeg_mp4({
        arguments: [
          "-i", "test.webm",
          "-vn",
          "-frames:a", "1", "-c:a", "aac",
          "out.mp4",
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(res.MEMFS).to.have.length(1);
      var file = res.MEMFS[0];
      expect(file.name).to.equal("out.mp4");
      expect(file.data.length).to.be.above(0);
    });
  });

  describe("Worker", function() {
    it("should print version to stdout", function(done) {
      var stdout = "";
      var stderr = "";
      var worker = new Worker("./ffmpeg-worker-mp4.js");
      worker.on("error", done);
      worker.on("message", function(msg) {
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
          worker.terminate();
          expect(stderr).to.be.empty;
          expect(msg.data).to.equal(0);
          expect(stdout).to.match(/^ffmpeg version /);
          done();
          break;
        }
      });
    });

    it("should encode test file to MP4/H.264 at MEMFS", function(done) {
      var worker = new Worker("./ffmpeg-worker-mp4.js");
      worker.onerror = done;
      worker.on("error", done);
      worker.on("message", function(msg) {
        switch (msg.type) {
        case "ready":
          worker.postMessage({
            type: "run",
            arguments: [
              "-i", "test.webm",
              "-frames:v", "5", "-c:v", "libx264",
              "-an",
              "out.mp4",
            ],
            MEMFS: [{name: "test.webm", data: testData}],
          });
          break;
        case "done":
          worker.terminate();
          var mem = msg.data.MEMFS;
          expect(mem).to.have.length(1);
          expect(mem[0].name).to.equal("out.mp4");
          expect(mem[0].data.length).to.be.above(0);
          done();
          break;
        }
      });
    });
  });
});
