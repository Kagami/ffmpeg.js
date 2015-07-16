#!/bin/bash

# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated in order to build
# this, see <https://kripken.github.io/emscripten-site/>.
# See also: <https://github.com/bgrins/videoconverter.js/tree/master/build>.

set -ex

# Prepare to the build.
cd "$(dirname "${BASH_SOURCE[0]}")"
rm -rf tmp
mkdir tmp
rm -f -- ../ffmpeg*.js

# Build ffmpeg.
# TODO(Kagami): Try to optimize build:
# - pthreads is available in emscripten as experimental feature
# - SIMD is available in Firefox Nightly
# - Some additional optimizations may be enabled
# FIXME: O2, shared, deps, muxers, closure.
cd ffmpeg
make clean
emconfigure ./configure \
    --cc=emcc \
    --disable-optimizations \
    --enable-cross-compile \
    --target-os=none \
    --arch=x86_32 \
    --cpu=generic \
    --disable-runtime-cpudetect \
    --disable-asm \
    --disable-pthreads \
    --disable-w32threads \
    --disable-os2threads \
    --disable-debug \
    --disable-stripping \
    \
    --disable-all \
    --enable-ffmpeg \
    --enable-avcodec \
    --enable-avformat \
    --enable-avutil \
    --enable-swresample \
    --enable-avfilter \
    --disable-network \
    --disable-d3d11va \
    --disable-dxva2 \
    --disable-vaapi \
    --disable-vda \
    --disable-vdpau \
    --enable-protocol=file \
    --disable-bzlib \
    --disable-iconv \
    --disable-libxcb \
    --disable-lzma \
    --disable-sdl \
    --disable-securetransport \
    --disable-xlib \
    --disable-zlib
emmake make
cp ffmpeg ../tmp/ffmpeg-webm.bc

# Compile the linked bitcode to JavaScript.
cd ..
emcc tmp/ffmpeg-webm.bc \
    --pre-js pre.js \
    --post-js post-sync.js \
    -o ../ffmpeg-webm.js
emcc tmp/ffmpeg-webm.bc \
    --pre-js pre.js \
    --post-js post-worker.js \
    -o ../ffmpeg-worker-webm.js
