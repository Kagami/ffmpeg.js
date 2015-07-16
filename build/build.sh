#!/bin/bash

# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated in order to build
# this, see <https://kripken.github.io/emscripten-site/>.
# See also: <https://github.com/bgrins/videoconverter.js/tree/master/build>.

SKIP_LIBVPX=0
SKIP_FFMPEG=0

while [ $# -gt 0 ]; do
    case $1 in
    -h|--help)
        echo "Usage: $0 [--skip-libvpx] [--skip-ffmpeg] [--skip-all]" >&2
        exit
        ;;
    --skip-libvpx)
        SKIP_LIBVPX=1
        ;;
    --skip-ffmpeg)
        SKIP_FFMPEG=1
        ;;
    --skip-all)
        SKIP_LIBVPX=1
        SKIP_FFMPEG=1
        ;;
    *)
        echo "Unknown option, see --help" >&2
        exit 1
        ;;
    esac
    shift
done

set -ex

# Prepare to the build.
cd "$(dirname "${BASH_SOURCE[0]}")"
rm -f -- ../ffmpeg*.js

if (( ! SKIP_LIBVPX )); then
# Build libvpx.
cd libvpx
make clean || true
emconfigure ./configure \
    --target=generic-gnu \
    --extra-cflags="-Wno-warn-absolute-paths" \
    --disable-optimizations \
    --disable-dependency-tracking \
    --disable-multithread \
    --disable-runtime-cpu-detect \
    --enable-shared \
    --disable-static \
    \
    --disable-examples \
    --disable-docs \
    --disable-webm-io \
    --disable-libyuv \
    --disable-vp8-decoder \
    --disable-vp9-decoder
emmake make
cd ..
fi

if (( ! SKIP_FFMPEG )); then
# Build ffmpeg.
# TODO(Kagami): Try to optimize build:
# - pthreads is available in emscripten as experimental feature
# - SIMD is available in Firefox Nightly
# - Some additional optimizations may be enabled
# - speedup ./configure (now it does a lot of compiler tests)
# NOTE(Kagami): Emscripten documentation recommends to always use shared
# libraries but it's not possible in case of ffmpeg because it has
# multiple declarations of `ff_log2_tab` symbol. See for details:
# * <https://kripken.github.io/emscripten-site/docs/compiling/Building-Projects.html>
# * <https://github.com/kripken/emscripten/issues/831>
# * <https://ffmpeg.org/pipermail/libav-user/2013-February/003698.html>
cd ffmpeg
make clean || true
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
    --enable-encoder=libvpx_vp8 \
    --enable-encoder=libvpx_vp9 \
    --enable-protocol=file \
    --disable-bzlib \
    --disable-iconv \
    --enable-libvpx \
    --disable-libxcb \
    --disable-lzma \
    --disable-sdl \
    --disable-securetransport \
    --disable-xlib \
    --disable-zlib \
    --extra-cflags="-I../libvpx" \
    --extra-ldflags="-L../libvpx"
emmake make
cd ..
fi

# Compile the linked bitcode to JavaScript.
cp ffmpeg/ffmpeg ffmpeg/ffmpeg.bc
emcc ffmpeg/ffmpeg.bc libvpx/libvpx.so \
    --pre-js pre.js \
    --post-js post-sync.js \
    -o ../ffmpeg-webm.js
emcc ffmpeg/ffmpeg.bc libvpx/libvpx.so \
    --pre-js pre.js \
    --post-js post-worker.js \
    -o ../ffmpeg-worker-webm.js

# Cleanup.
rm -f libvpx/vpx_dsp_rtcd.h
rm -f ffmpeg/ffmpeg.bc
