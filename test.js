// TODO(Kagami): In-browser tests with karma.
var expect = require("chai").expect;
var Worker = require("webworker-threads").Worker;
var ffmpeg_webm = require("./ffmpeg-webm");

describe("FFmpeg WebM", function() {
  describe("Sync", function() {
    it("should print version to stdout", function(done) {
      var stdout = '';
      var stderr = '';
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
  });

  describe("Worker", function() {
    it("should print version to stdout", function(done) {
      var stdout = '';
      var stderr = '';
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
