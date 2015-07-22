# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated, see
# <https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html>.

MUXERS = webm null
DEMUXERS = matroska avi mov
ENCODERS = libvpx_vp8
DECODERS = \
	vp8 \
	vorbis opus \
	mpeg4 h264 \
	mp3 ac3 aac

all: ffmpeg-webm.js ffmpeg-worker-webm.js

clean:
	rm -f -- ffmpeg*.js
	-cd build/libvpx && make clean
	-cd build/ffmpeg && rm -f ffmpeg.bc && make clean

build/libvpx/libvpx.so:
	cd build/libvpx && \
	emconfigure ./configure \
		--target=generic-gnu \
		--extra-cflags="-O3 -Wno-warn-absolute-paths" \
		--disable-optimizations \
		--disable-dependency-tracking \
		--disable-multithread \
		--disable-runtime-cpu-detect \
		--enable-shared \
		--disable-static \
		\
		--disable-examples \
		--disable-docs \
		--disable-unit-tests \
		--disable-webm-io \
		--disable-libyuv \
		--disable-vp8-decoder \
		--disable-vp9 \
		&& \
	emmake make

# Build ffmpeg.
# TODO(Kagami): Try to optimize build further:
# - pthreads is available in emscripten as experimental feature
# - SIMD is available in Firefox Nightly
# - Some additional optimizations may be enabled
# - Speedup ./configure (now it does a lot of compiler tests)
# TODO(Kagami): Emscripten documentation recommends to always use shared
# libraries but it's not possible in case of ffmpeg because it has
# multiple declarations of `ff_log2_tab` symbol. GCC builds ffmpeg fine
# though because it uses version scripts and so `ff_log2_tag` symbols
# are not exported to the shared libraries. Seems like `emcc` ignores
# them. We need to try to file bugreport to upstream. See also:
# - <https://kripken.github.io/emscripten-site/docs/compiling/Building-Projects.html>
# - <https://github.com/kripken/emscripten/issues/831>
# - <https://ffmpeg.org/pipermail/libav-user/2013-February/003698.html>
build/ffmpeg/ffmpeg.bc: build/libvpx/libvpx.so
	cd build/ffmpeg && \
	emconfigure ./configure \
		--cc=emcc \
		--optflags="-O3" \
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
		$(addprefix --enable-encoder=,$(ENCODERS)) \
		$(addprefix --enable-decoder=,$(DECODERS)) \
		$(addprefix --enable-muxer=,$(MUXERS)) \
		$(addprefix --enable-demuxer=,$(DEMUXERS)) \
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
		--extra-ldflags="-L../libvpx" \
		&& \
	emmake make && \
	cp ffmpeg ffmpeg.bc

# Compile bitcode to JavaScript.
# TODO(Kagami): Use `--closure 1` (saves ~90k). Blocked by:
# <https://github.com/kripken/emscripten/issues/3230>.
# NOTE(Kagami): Bump heap size to 64M, default 16M is not enough even
# for simple tests and 32M tends to run slower than 64M.

ffmpeg-webm.js: build/ffmpeg/ffmpeg.bc build/libvpx/libvpx.so
	emcc $^ \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-O3 --memory-init-file 0 \
		--pre-js build/pre.js \
		--post-js build/post-sync.js \
		-o $@

ffmpeg-worker-webm.js: build/ffmpeg/ffmpeg.bc build/libvpx/libvpx.so
	emcc $^ \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-O3 --memory-init-file 0 \
		--pre-js build/pre.js \
		--post-js build/post-worker.js \
		-o $@
