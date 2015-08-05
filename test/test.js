// TODO(Kagami): In-browser tests with karma.
var expect = require("chai").expect;
var fs = require("fs");
var path = require("path");
var Worker = require("webworker-threads").Worker;
var ffmpeg_webm = require("../ffmpeg-webm");

function noop() {};
var testDataPath = path.join(__dirname, "test.webm");
var testData = new Uint8Array(fs.readFileSync(testDataPath));

describe("FFmpeg WebM", function() {
  this.timeout(10000);

  describe("Sync", function() {
    it("should print version to stdout", function(done) {
      var stdout = "";
      var stderr = "";
      ffmpeg_webm({
        arguments: ["-version"],
        print: function(data) { stdout += data + "\n"; },
        printErr: function(data) { stderr += data + "\n"; },
        onExit: function(code) {
          expect(code).to.equal(0);
          // emscripten emits warnings regarding `signal()` calls. It
          // should be empty actually.
          // expect(stderr).to.be.empty;
          expect(stdout).to.match(/^ffmpeg version /);
          done();
        },
      });
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
      this.timeout(60000);
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
      this.timeout(60000);
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

    // TODO(Kagami): Not our bug - report to Emscripten.
    it.skip("should work with other crazy output name", function() {
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
  });

  describe("Worker", function() {
    it("should print version to stdout", function(done) {
      var stdout = "";
      var stderr = "";
      var worker = new Worker("ffmpeg-worker-webm.js");
      worker.onerror = done;
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
          expect(msg.data).to.equal(0);
          expect(stdout).to.match(/^ffmpeg version /);
          worker.terminate();
          done();
          break;
        }
      };
    });

    // FIXME(Kagami): Blocked by:
    // <https://github.com/audreyt/node-webworker-threads/issues/60>.
    it.skip("should encode test file to WebM/VP8 at MEMFS", function(done) {
      this.timeout(60000);
      var worker = new Worker("ffmpeg-worker-webm.js");
      worker.onerror = done;
      worker.onmessage = function(e) {
        var msg = e.data;
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
          var mem = res.data.MEMFS;
          expect(mem).to.have.length(1);
          expect(mem[0].name).to.equal("out.webm");
          expect(mem[0].data.length).to.be.above(0);
          worker.terminate();
          done();
          break;
        }
      };
    });
  });
});
