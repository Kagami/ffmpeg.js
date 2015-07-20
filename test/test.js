// TODO(Kagami): In-browser tests with karma.
var expect = require("chai").expect;
var fs = require("fs");
var Worker = require("webworker-threads").Worker;
var ffmpeg_webm = require("../ffmpeg-webm");

function noop() {};

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

    it("shouldn't return input files on MEMFS", function() {
      var res = ffmpeg_webm({
        print: noop,
        printErr: noop,
        MEMFS: [
          {name: "test.mkv", data: new Uint8Array(1)},
          {name: "222.webm", data: new Uint8Array(10)},
        ],
      });
      expect(res.MEMFS).to.be.empty;
    });

    it("should show metadata of test video on NODEFS", function() {
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

    // FIXME(Kagami): Test it in worker. Now it segfaults when passing
    // Uint8Array and can't use NODEFS.
    it("should encode test video to WebM/VP8 on MEMFS", function() {
      this.timeout(60000);
      var testData = new Uint8Array(fs.readFileSync("test/test.webm"));
      var res = ffmpeg_webm({
        arguments: [
          "-i", "test.webm",
          "-frames:v", "5", "-c:v", "libvpx",
          "-an",
          "out.webm"
        ],
        stdin: noop,
        print: noop,
        printErr: noop,
        MEMFS: [{name: "test.webm", data: testData}],
      });
      expect(res.MEMFS).to.have.length(1);
      expect(res.MEMFS[0].name).to.equal("out.webm");
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
  });
});
