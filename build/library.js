mergeInto(LibraryManager.library, {
    emscripten_stdin_async: function (buf, size) {
        if (!self.video_started) {
            const onmessage = self.onmessage;
            self.video_queue = [];
            self.video_handler = null;
            self.video_buf = null;
            self.video_size = null;
            self.video_process = function () {
                let processed = 0;
                while ((self.video_queue.length > 0) && (self.video_size > 0)) {
                    const head = self.video_queue.shift();
                    const take = Math.min(head.length, self.video_size);
                    // TOOD: Weird - Module.HEAPU8 is undefined!
                    Module['HEAPU8'].set(head.subarray(0, take), self.video_buf);
                    processed += take;
                    self.video_buf += take;
                    self.video_size -= take;
                    if (take < head.length) {
                        self.video_queue.unshift(head.subarray(take));
                    }
                }
                if (processed > 0) {
                    const handler = self.video_handler;
                    self.video_handler = null;
                    self.video_buf = null;
                    self.video_size = null;
                    handler(processed);
                }
            };
            self.onmessage = function (e) {
                const msg = e.data;
                if (msg.type == 'video-data') {
                    self.video_queue.push(new Uint8Array(msg.data));
                    console.log("GOT VIDEO DATA", self.video_queue.length);
                    if (self.video_handler) {
                        self.video_process();
                    }
                } else {
                    onmessage.apply(this, arguments);
                }
            };
            self.postMessage({type: 'start-video'});
            self.video_started = true;
        }
        return Asyncify.handleSleep(wakeUp => {
            if (size <= 0) {
                return wakeUp(0);
            }
            self.video_handler = wakeUp;
            self.video_buf = buf;
            self.video_size = size;
            self.video_process();
        });
    }
});
