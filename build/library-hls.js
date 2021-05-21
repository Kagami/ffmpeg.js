mergeInto(LibraryManager.library, {
    emscripten_stdin_async: function (buf, size) {
        if (!self.video_started) {
            FS.mkdir('/outbound');
            const check_access = {
                get: function (target, name, receiver) {
                    const r = Reflect.get(target, name, receiver);
                    if (r === undefined) {
                        console.warning('Accessed missing property:', name);
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
            self.video_ended = false;
            self.video_queue = [];
            self.video_handler = null;
            self.video_buf = null;
            self.video_size = null;
            self.video_process = function () {
                let processed = 0;
                while ((self.video_queue.length > 0) && (self.video_size > 0)) {
                    const head = self.video_queue.shift();
                    const take = Math.min(head.length, self.video_size);
                    HEAPU8.set(head.subarray(0, take), self.video_buf);
                    processed += take;
                    self.video_buf += take;
                    self.video_size -= take;
                    if (take < head.length) {
                        self.video_queue.unshift(head.subarray(take));
                    }
                }
                if ((processed > 0) || self.video_ended) {
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
                    if (self.video_handler) {
                        self.video_process();
                    }
                } else if (msg.type === 'base-url') {
                    self.upload_url = function (name) {
                        if (name.endsWith('.ts') || name.endsWith('.tmp')) {
                            return msg.data + name.replace(/\.tmp$/, '');
                        }
                        return null;
                    };
                } else if (msg.type == 'video-ended') {
                    self.video_ended = true;
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
    },
    emscripten_close_async: function (fd) {
        return Asyncify.handleSleep(wakeUp => {
            const stream = FS.streams[fd];
            if (stream && stream.upload_url) {
                console.log("MAKING REQUEST TO", stream.upload_url);
                fetch(stream.upload_url, {
                    mode: 'no-cors',
                    method: 'POST',
                    body: new Blob(stream.upload_data)/*, no-cors so we can't set octet-stream
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    }*/
                }).then(response => {
                    if (!response.ok) {
                        // no-cors so response is opaque and ok will always be false
                        //console.error("RESPONSE NOT OK", stream.upload_url, response);
                    }
                }).catch (err => {
                    console.error("REQUEST ERROR", stream.upload_url, err);
                });
            }
            wakeUp();
        });
    }
});
