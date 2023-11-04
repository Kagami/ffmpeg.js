    return { PThread, FS, PATH };
}

// Shim for nodejs
if (typeof self === "undefined") {
    self = require("worker_threads")["parentPort"];
}

function setup_outbound(FS, PATH) {
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
                    throw FS.genericErrors[2/*ENOENT*/];
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
                if (whence === 1/*SEEK_CUR*/) {
                    position += stream.position;
                } else if (whence === 2/*SEEK_END*/) {
                    if (FS.isFile(stream.node.mode)) {
                        position += stream.node.usedBytes;
                    }
                }
                if (position < 0) {
                    throw new FS.ErrnoError(22/*EINVAL*/);
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
                        self.postMessage({'type': 'sending'});
                    }
/*#if ALLOW_MEMORY_GROWTH
                    if (buffer.buffer === HEAP8.buffer) {
                        canOwn = false;
                    }
#endif*/
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
                if (stream.upload_url) {
                    console.log("MAKING REQUEST TO", stream.upload_url);
                    const upload_data = new Blob(stream.upload_data);
                    const upload_options = Object.assign({
                        mode: 'no-cors',
                        method: 'POST'
                    }, self.upload_options);
                    if (stream.upload_url.startsWith('postMessage:')) {
                        upload_options.stream = upload_data.stream();
                        const transfer = [upload_options.stream];
                        self.postMessage({
                            'type': 'upload',
                            'url': stream.upload_url,
                            'options': upload_options,
                            'transfer': transfer
                        }, transfer);
                    } else {
                        upload_options.body = upload_data;
                        self.pending_fetches = (self.pending_fetches || 0) + 1;
                        function check_exit() {
                            if ((--self.pending_fetches === 0) &&
                                (self.pending_exit_code !== undefined)) {
                                self.postMessage({
                                    'type': 'ffexit',
                                    'code': self.pending_exit_code
                                });
                            }
                        }
                        fetch(stream.upload_url, upload_options).then(response => {
                            check_exit();
                            // note: with no-cors, response is opaque and ok will always be false
                            if (!response.ok && (upload_options.mode !== 'no-cors')) {
                                console.error("RESPONSE NOT OK", stream.upload_url, response);
                            }
                        }).catch (err => {
                            check_exit();
                            console.error("REQUEST ERROR", stream.upload_url, err);
                        });
                    }
                }
            }
        }, check_access)
    }, check_access);
    FS.mount(ops, {}, '/outbound');
}

if (self.onmessage) {
    __ffmpegjs();
} else {
    var __ffmpegjs_running = false;
    let main_worker;
    const stream_workers = new Map();
    const stream_queues = new Map();
    function process_queue(name) {
        const winfo = stream_workers.get(name);
        const qinfo = stream_queues.get(name);
        if (winfo && qinfo) {
            if (winfo.worker !== main_worker) {
                for (let data of qinfo.queue) {
                    winfo.worker.postMessage({
                        'type': 'stream-data',
                        'name': winfo.fd_name,
                        'data': data,
                        'is_main': false
                    });
                }
                stream_queues.delete(name);
            } else if (qinfo.size >= winfo.size) {
                const data = new Uint8Array(winfo.size);
                let pos = 0;
                while (winfo.size > 0) {
                    const head = qinfo.queue.shift();
                    const take = Math.min(head.length, winfo.size);
                    data.set(head.subarray(0, take), pos);
                    winfo.size -= take;
                    qinfo.size -= take;
                    pos += take;
                    if (take < head.length) {
                        qinfo.queue.unshift(head.subarray(take));
                    }
                }
                winfo.worker.postMessage({
                    'type': 'stream-data',
                    'name': winfo.fd_name,
                    'data': data,
                    'is_main': true
                });
                stream_workers.delete(name);
            }
        }
    }
    self.onmessage = function(e) {
        var msg = e['data'];
        if (msg["type"] == "run") {
            if (__ffmpegjs_running) {
                self.postMessage({"type": "error", "data": "already running"});
            } else {
                __ffmpegjs_running = true;
                self.postMessage({"type": "run"});
                var opts = {};
                Object.keys(msg).forEach(function(key) {
                    if (key !== "type") {
                        opts[key] = msg[key]
                    }
                });
                opts["print"] = function(line) {
                    self.postMessage({"type": "stdout", "data": line});
                };
                opts["printErr"] = function(line) {
                    self.postMessage({"type": "stderr", "data": line});
                };
                opts["onExit"] = function(code) {
                    self.postMessage({"type": "exit", "data": code});
                };
                opts["onAbort"] = function(reason) {
                    self.postMessage({"type": "abort", "data": reason});
                };
                // TODO(Kagami): Should we wrap this function into try/catch in
                // case of possible exception?
                const { PThread, FS, PATH } = __ffmpegjs(opts, function (result) {
                    var transfer = result["MEMFS"].map(function(file) {
                        return file["data"].buffer;
                    });
                    self.postMessage({"type": "done", "data": result}, transfer);
                        __ffmpegjs_running = false;
                    });
                setup_outbound(FS, PATH);
                for (worker of PThread.unusedWorkers) {
                    worker.addEventListener('message', function (ev) {
                        const msg = ev.data;
                        switch (msg['type']) {
                            case 'read':
                                const name = FS.streams[msg['fd']].node.name;
                                stream_workers.set(name, {
                                    worker: this,
                                    size: msg['size'],
                                    fd_name: `/${msg['fd']}`
                                });
                                process_queue(name);
                                break;
                            case 'start-stream':
                                if (main_worker) {
                                    break;
                                }
                                main_worker = this;
                                // falls through
                            default:
                                self.postMessage(msg);
                        }
                    });
                }
            }
        } else if (main_worker) {
            switch (msg['type']) {
                case 'stream-end':
                    for (let { worker } of stream_workers.values()) {
                        worker.postMessage(msg);
                    }
                    break;

                case 'stream-data':
                    const winfo = stream_workers.get(msg['name']);
                    if (!winfo || (winfo.worker === main_worker)) {
                        if (!stream_queues.has(msg['name'])) {
                            stream_queues.set(msg['name'], { queue: [], size: 0 });
                        }
                        const qinfo = stream_queues.get(msg['name']);
                        qinfo.queue.push(new Uint8Array(msg['data']));
                        qinfo.size += msg['data'].byteLength;
                        process_queue(msg['name']);
                    } else {
                        msg['name'] = winfo.fd_name;
                        msg['is_main'] = false;
                        winfo.worker.postMessage(msg);
                    }
                    break;

                case 'base-url':
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

                default:
                    main_worker.postMessage(msg);
                    break;
            }
        } else {
            self.postMessage({
                "type": "error",
                "data": {
                    "message": `unknown command : ${msg['type']}`
                }
            });
        }
    };

    self.postMessage({"type": "ready"});
}
