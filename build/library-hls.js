mergeInto(LibraryManager.library, {
    emscripten_read_async: function (fd, buf, size) {
        if (!self.stream_started) {
            const onmessage = self.onmessage;
            self.stream_is_main = true;
            self.stream_ended = false;
            self.stream_sending = false;
            self.stream_queues = new Map();
            self.stream_handlers = new Map();
            self.stream_bufs = new Map();
            self.stream_sizes = new Map();
            self.stream_process = function (name) {
                let processed = 0;
                while (self.stream_queues.has(name) &&
                       (self.stream_queues.get(name).length > 0) &&
                       (self.stream_sizes.get(name) > 0)) {
                    const queue = self.stream_queues.get(name);
                    const buf = self.stream_bufs.get(name);
                    const size = self.stream_sizes.get(name);
                    const head = queue.shift();
                    const take = Math.min(head.length, size);
                    HEAPU8.set(head.subarray(0, take), buf);
                    processed += take;
                    self.stream_bufs.set(name, buf + take);
                    self.stream_sizes.set(name, size - take);
                    if (take < head.length) {
                        queue.unshift(head.subarray(take));
                    }
                }
                if ((processed > 0) || self.stream_ended) {
                    const handler = self.stream_handlers.get(name);
                    self.stream_handlers.delete(name);
                    self.stream_bufs.delete(name);
                    self.stream_sizes.delete(name);
                    setTimeout(() => {
                        try {
                            handler(processed);
                        } catch (ex) {
                            console.error(ex);
                        }
                    }, 0);
                }
            };
            self.onmessage = function (e) {
                const msg = e['data'];
                switch (msg['type']) {
                    case 'stream-data':
                        self.stream_is_main = msg['is_main'];
                        if (!self.stream_queues.has(msg['name'])) {
                            self.stream_queues.set(msg['name'], []);
                        }
                        self.stream_queues.get(msg['name']).push(new Uint8Array(msg['data']));
                        if (self.stream_handlers.has(msg['name'])) {
                            self.stream_process(msg['name']);
                        }
                        break;
                    case 'stream-end':
                        self.stream_ended = true;
                        for (let h of self.stream_handlers.keys()) {
                            self.stream_process(h);
                        }
                        break;
                    default:
                        onmessage.apply(this, arguments);
                        break;
                }
            };
            self.postMessage({'type': 'start-stream'});
            self.stream_started = true;
        }
        return Asyncify.handleSleep(wakeUp => {
            if (size <= 0) {
                return setTimeout(() => {
                    try {
                        wakeUp(0);
                    } catch (ex) {
                        console.error(ex);
                    }
                }, 0);
            }
            const stream = FS.streams[fd];
            let name;
            if (stream) {
                name = stream.node.name;
            } else {
                name = `/${fd}`;
                if (self.stream_is_main && !self.stream_ended) {
                    self.postMessage({'type': 'read', 'fd': fd, 'size': size});
                }
            }
            self.stream_handlers.set(name, wakeUp);
            self.stream_bufs.set(name, buf);
            self.stream_sizes.set(name, size);
            self.stream_process(name);
        });
    },
    emscripten_exit_async: function (code) {
        return Asyncify.handleSleep(wakeUp => {
            if (self.pending_fetches > 0) {
                console.log(`EXIT with ${self.pending_fetches} pending fetches`);
                self.pending_exit_code = code;
            } else {
                self.postMessage({
                    'type': 'ffexit',
                    'code': code
                });
            }
        });
    }
});
