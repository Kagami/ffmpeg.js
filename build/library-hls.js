mergeInto(LibraryManager.library, {
    emscripten_read_async: function (fd, buf, size) {
        if (!self.stream_started) {
            FS.mkdir('/outbound');
            const check_access = {
                get: function (target, name, receiver) {
                    const r = Reflect.get(target, name, receiver);
                    if (r === undefined) {
                        console.warn('Accessed missing property:', name, target);
                    }
                    return r;
                }
            };
            const files = new Set();
            const ops = new Proxy({
                mount: function (mount) {
                    return ops.createNode(null, '/', ops.getMode('/'));
                },
                createNode: function (parent, name, mode, dev) {
                    const node = FS.createNode(parent, name, mode, dev);
                    node.node_ops = ops.node_ops;
                    node.stream_ops = ops.stream_ops;
                    node.usedBytes = 0;
                    return node;
                },
                getMode: function (path) {
                    return (path === '/' ? 0x40000 : 0x100000) | 0x777;
                },
                realPath: function (node) {
                    const parts = [];
                    while (node.parent !== node) {
                        parts.push(node.name);
                        node = node.parent;
                    }
                    parts.reverse();
                    return PATH.join.apply(null, parts);
                },
                node_ops: new Proxy({
                    getattr: function (node) {
                        const attr = {};
                        attr.dev = 1;
                        attr.ino = node.id;
                        attr.nlink = 1;
                        attr.uid = 0;
                        attr.gid = 0;
                        attr.rdev = node.rdev;
                        attr.size = FS.isDir(node.mode) ? 4096 : node.usedBytes;
                        attr.atime = new Date(node.timestamp);
                        attr.mtime = new Date(node.timestamp);
                        attr.ctime = new Date(node.timestamp);
                        attr.blksize = 4096;
                        attr.blocks = Math.ceil(attr.size / attr.blksize);
                        return attr;
                    },
                    setattr: function (node, attr) {
                    },
                    lookup: function (parent, name) {
                        if (!files.has(name)) {
                            throw FS.genericErrors[{{{ cDefine('ENOENT') }}}];
                        }
                        const path = PATH.join2(ops.realPath(parent), name);
                        const mode = ops.getMode(path);
                        return ops.createNode(parent, name, mode);
                    },
                    mknod: function (parent, name, mode, dev) {
                        files.add(name);
                        return ops.createNode(parent, name, mode, dev);
                    },
                    rename: function (old_node, new_dir, new_name) {
                        files.delete(old_node.name);
                        old_node.parent.timestamp = Date.now();
                        old_node.name = new_name;
                    },
                    unlink: function (parent, name) {
                        files.delete(name);
                    }
                }, check_access),
                stream_ops: new Proxy({
                    open: function (stream) {
                        stream.upload_url = self.upload_url(stream.node.name);
                        stream.upload_data = [];
                    },
                    llseek: function (stream, offset, whence) {
                        let position = offset;
                        if (whence === {{{ cDefine('SEEK_CUR') }}}) {
                            position += stream.position;
                        } else if (whence === {{{ cDefine('SEEK_END') }}}) {
                            if (FS.isFile(stream.node.mode)) {
                                position += stream.node.usedBytes;
                            }
                        }
                        if (position < 0) {
                            throw new FS.ErrnoError({{{ cDefine('EINVAL') }}});
                        }
                        return position;
                    },
                    write: function (stream, buffer, offset, length, position, canOwn) {
                        if (!length) {
                            return 0;
                        }
                        const node = stream.node;
                        node.timestamp = Date.now();
                        node.usedBytes = Math.max(node.usedBytes, position + length);
                        if (stream.upload_url) {
                            if (!self.stream_sending) {
                                self.stream_sending = true;
                                self.postMessage({type: 'sending'});
                            }
#if ALLOW_MEMORY_GROWTH
                            if (buffer.buffer === HEAP8.buffer) {
                                canOwn = false;
                            }
#endif
                            if (canOwn) {
                                stream.upload_data.push(buffer.subarray(offset, offset + length));
                            } else {
                                stream.upload_data.push(buffer.slice(offset, offset + length));
                            }
                        }
                        return length;
                    },
                    close: function (stream) {
                        files.delete(stream.node.name);
                    }
                }, check_access)
            }, check_access);
            FS.mount(ops, {}, '/outbound');
            const onmessage = self.onmessage;
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
                    handler(processed);
                }
            };
            self.onmessage = function (e) {
                const msg = e['data'];
                switch (msg['type']) {
                    case 'stream-data':
                        if (!self.stream_queues.has(msg['name'])) {
                            self.stream_queues.set(msg['name'], []);
                        }
                        self.stream_queues.get(msg['name']).push(new Uint8Array(msg['data']));
                        if (self.stream_handlers.has(msg['name'])) {
                            self.stream_process(msg['name']);
                        }
                        break;
                    case 'base-url': {
                        self.upload_url = function (name) {
                            if (name.endsWith('.webm') ||
                                name.endsWith('.m4s') ||
                                name.endsWith('.ts') ||
                                name.endsWith('.tmp')) {
                                return msg['data'] + name.replace(/\.tmp$/, '').replace(/\.m4s$/, '.mp4');
                            }
                            return null;
                        };
                        self.upload_options = msg['options'];
                        break;
                    }
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
            self.postMessage({type: 'start-stream'});
            self.stream_started = true;
        }
        return Asyncify.handleSleep(wakeUp => {
            if (size <= 0) {
                return wakeUp(0);
            }
            const name = FS.streams[fd].node.name;
            self.stream_handlers.set(name, wakeUp);
            self.stream_bufs.set(name, buf);
            self.stream_sizes.set(name, size);
            self.stream_process(name);
        });
    },
    emscripten_close_async: function (fd) {
        return Asyncify.handleSleep(wakeUp => {
            const stream = FS.streams[fd];
            if (stream && stream.upload_url) {
                console.log("MAKING REQUEST TO", stream.upload_url);
                const options = Object.assign({
                    mode: 'no-cors',
                    method: 'POST',
                    body: new Blob(stream.upload_data)
                }, self.upload_options);
                fetch(stream.upload_url, options).then(response => {
                    // note: with no-cors, response is opaque and ok will always be false
                    if (!response.ok && (options.mode !== 'no-cors')) {
                        console.error("RESPONSE NOT OK", stream.upload_url, response);
                    }
                }).catch (err => {
                    console.error("REQUEST ERROR", stream.upload_url, err);
                });
            }
            wakeUp();
        });
    },
    emscripten_exit: function (code) {
        self.postMessage({
            type: 'ffexit',
            code
        });
        return code;
    }
});
