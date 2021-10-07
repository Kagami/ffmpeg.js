FROM ubuntu:rolling
RUN apt-get update
RUN DEBIAN_FRONTEND="noninteractive" apt-get install -y tzdata
RUN apt-get install -y git python3 build-essential automake libtool pkg-config && apt-get clean \
 && cd /root && git clone https://github.com/emscripten-core/emsdk.git \
 && cd /root/emsdk && ./emsdk install latest && ./emsdk activate latest
