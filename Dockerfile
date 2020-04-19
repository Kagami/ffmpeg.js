FROM ubuntu:rolling

RUN sed -i 's|http://archive.ubuntu.com/ubuntu/|mirror://mirrors.ubuntu.com/mirrors.txt|g' /etc/apt/sources.list \
 && apt-get update && apt-get install -y git python build-essential automake libtool pkg-config && apt-get clean \
 && cd /root && git clone https://github.com/emscripten-core/emsdk.git \
 && cd /root/emsdk && ./emsdk install latest && ./emsdk activate latest \
 && sed -i 's|\]$|],"getrusage":["memset"]|' /root/emsdk/upstream/emscripten/src/deps_info.json