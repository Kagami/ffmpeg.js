// TODO(Kagami): Worker tests with webworker-threads.
// TODO(Kagami): In-browser tests with karma.

var expect = require("chai").expect;
var ffmpeg_webm = require("./ffmpeg-webm");

describe("FFmpeg WebM", function() {
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
