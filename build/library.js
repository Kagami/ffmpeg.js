mergeInto(LibraryManager.library, {
    emscripten_stdin_async: function (buf, size) {
        if (!self.video_started) {
            /*const outbound_dev = FS.makedev(64, 0);
            FS.registerDevice(outbound_dev, {
                open: function (stream) {
                    console.log("OPEN", stream);
                }

            });
            FS.mkdev('/outbound-dev', outbound_dev);*/
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
                        //console.log("RENAME", old_node.name, new_name);
                        files.delete(old_node.name);
                        old_node.parent.timestamp = Date.now();
                        old_node.name = new_name;
                        //files.add(new_name);
                    }
                }, intercept),
                stream_ops: new Proxy({
                    open: function (stream) {
                        console.log("OPEN", stream.path, self.upload_url(stream.node.name));
                        // for .webm, .webm.tmp and .mpd.tmp we should open http connection
                        // we have 3 second window so need to configure ffmpeg to batch in
                        // < 3 second chunks
                        // try sending in our order, might have to delay initial till after
                        // first segment though
                    },
                    llseek: function (stream, offset, whence) {
                        console.log("LLSEEK", stream.path, offset, whence);
                        const position = offset;
                        if (whence === {{{ cDefine('SEEK_CUR') }}}) {
                            position += stream.position;
                        } else if (whence === {{{ cDefine('SEEK_END') }}}) {
                            if (FS.isFile(stream.node.mode)) {
                                position += stream.node.usedBytes;
                            }
                        }
                        if (position < 0) {
                            throw new Fs.ErrnoError({{{ cDefine('EINVAL') }}});
                        }
                        return position;
                    },
                    write: function (stream, buffer, offset, length, position) {
                        console.log("WRITE", stream.path, offset, length, position);
                        if (!length) {
                            return 0;
                        }
                        const node = stream.node;
                        node.timestamp = Date.now();
                        node.usedBytes = Math.max(node.usedBytes, position + length);
                        return length;
                        // for .webm, .webm.tmp and .mpd.tmp we should write to opened http connection
                        // we get init-stream0.webm
                        // then chunkstream0-0001.webm.tmp which is then renamed to chunkstream0-0001.webm
                        // then output.mpd.tmp which is then renamed to output.mpd
                        // we keep getting writes to output.mpd - should we resend it?
                        // what does youtube want?
                        // 1179
                        // 1200
                    },
                    close: function (stream) {
                        console.log("CLOSE", stream.path);
                        // for .webm, .webm.tmp and .mpd.tmp we should close opened http connection
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
                        if (name.endsWith('.webm') || name.endsWith('.tmp')) {
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
    }
});
