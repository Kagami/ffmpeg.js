mergeInto(LibraryManager.library, {
    emscripten_stdin_async: function (buf, size) {
        if (!self.video_started) {
            FS.mkdir('/outbound');
            const intercept = {
                get: function (target, name, receiver) {
                    const r = Reflect.get(target, name, receiver);
                    if (r === undefined) {
                        console.log('Accessed missing property:', name);
                    }
                    return r;
                }
            };
            const files = new Set();
            const ops = new Proxy({
                mount: function (mount) {
                    //console.log("MOUNT CALLED");
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
                    //console.log("GETMODE", path);
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
                        //console.log("SETATTR", node, attr);
                    },
                    lookup: function (parent, name) {
                        //console.log("LOOKUP", name);
                        if (!files.has(name)) {
                            throw FS.genericErrors[{{{ cDefine('ENOENT') }}}];
                        }
                        const path = PATH.join2(ops.realPath(parent), name);
                        const mode = ops.getMode(path);
                        return ops.createNode(parent, name, mode);
                    },
                    mknod: function (parent, name, mode, dev) {
                        //console.log("MKNOD", name);
                        files.add(name);
                        return ops.createNode(parent, name, mode, dev);
                    },
                    rename: function (old_node, new_dir, new_name) {
                        console.log("RENAME", old_node.name, new_name);
                        files.delete(old_node.name);
                        old_node.parent.timestamp = Date.now();
                        old_node.name = new_name;
                    }
                }, intercept),
                stream_ops: new Proxy({
                    open: function (stream) {
                        stream.upload_url = self.upload_url(stream.node.name);
                        stream.upload_data = [];
                        console.log("OPEN", stream.path, stream.upload_url);
                    },
                    llseek: function (stream, offset, whence) {
                        console.log("LLSEEK", stream.path, offset, whence);
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
                        console.log("WRITE", stream.path, /*buffer,*/ offset, length, position);
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
                        console.log("CLOSE", stream.path, files.size);
                    }
                }, intercept)
            }, intercept);
            FS.mount(ops, {}, '/outbound');
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
                    // TOOD: Weird - Module.HEAPU8 is undefined but [] access works!
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
                } else if (msg.type === 'base-url') {
                    self.upload_url = function (name) {
                        if (name.endsWith('.ts') || name.endsWith('.tmp')) {
                            return msg.data + name.replace(/\.tmp$/, '');
                        }
                        return null;
                    };
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
