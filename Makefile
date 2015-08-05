# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated, see:
# <https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html>.

MUXERS = webm null
DEMUXERS = matroska avi mov concat
ENCODERS = libvpx_vp8 libopus
DECODERS = \
	vp8 vp9 \
	vorbis opus \
	mpeg4 h264 \
	mp3 ac3 aac

CODEC_DEPS = build/opus/dist/lib/libopus.so build/libvpx/libvpx.so
FFMPEG_BC = build/ffmpeg/ffmpeg.bc
PRE_JS = build/pre.js
POST_JS_SYNC = build/post-sync.js
POST_JS_WORKER = build/post-worker.js

all: ffmpeg-webm.js ffmpeg-worker-webm.js

clean: clean-js clean-opus clean-libvpx clean-ffmpeg
clean-js:
	rm -f -- ffmpeg*.js
clean-opus:
	-cd build/opus && rm -rf dist && make clean
clean-libvpx:
	-cd build/libvpx && make clean
clean-ffmpeg:
	-cd build/ffmpeg && rm -f ffmpeg.bc && make clean

build/opus/configure:
	cd build/opus && ./autogen.sh

build/opus/dist/lib/libopus.so: build/opus/configure
	cd build/opus && \
	emconfigure ./configure \
		CFLAGS=-O3 \
		--prefix="$$(pwd)/dist" \
		--disable-static \
		--disable-doc \
		--disable-extra-programs \
		&& \
	emmake make -j8 && \
	emmake make install

build/libvpx/libvpx.so:
	cd build/libvpx && \
	emconfigure ./configure \
		--target=generic-gnu \
		--extra-cflags="-Wno-warn-absolute-paths" \
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
	emmake make -j8

# Build FFmpeg.
# TODO(Kagami): Emscripten documentation recommends to always use shared
# libraries but it's not possible in case of ffmpeg because it has
# multiple declarations of `ff_log2_tab` symbol. GCC builds FFmpeg fine
# though because it uses version scripts and so `ff_log2_tag` symbols
# are not exported to the shared libraries. Seems like `emcc` ignores
# them. We need to file bugreport to upstream. See also:
# - <https://kripken.github.io/emscripten-site/docs/compiling/Building-Projects.html>
# - <https://github.com/kripken/emscripten/issues/831>
# - <https://ffmpeg.org/pipermail/libav-user/2013-February/003698.html>
$(FFMPEG_BC): $(CODEC_DEPS)
	cd build/ffmpeg && \
	make clean; \
	EM_PKG_CONFIG_PATH=../opus/dist/lib/pkgconfig emconfigure ./configure \
		--cc=emcc \
		--enable-cross-compile \
		--target-os=none \
		--arch=x86 \
		--disable-runtime-cpudetect \
		--disable-asm \
		--disable-fast-unaligned \
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
		--enable-filter=aresample \
		--disable-bzlib \
		--disable-iconv \
		--enable-libopus \
		--enable-libvpx \
		--disable-libxcb \
		--disable-lzma \
		--disable-sdl \
		--disable-securetransport \
		--disable-xlib \
		--disable-zlib \
		--extra-cflags="-Wno-warn-absolute-paths -I../libvpx" \
		--extra-ldflags="-L../libvpx" \
		&& \
	emmake make -j8 && \
	cp ffmpeg ffmpeg.bc

# Compile bitcode to JavaScript.
# NOTE(Kagami): Bump heap size to 64M, default 16M is not enough even
# for simple tests and 32M tends to run slower than 64M.

ffmpeg-webm.js: $(FFMPEG_BC) \
		$(CODEC_DEPS) \
		$(PRE_JS) \
		$(POST_JS_SYNC)
	emcc $(FFMPEG_BC) $(CODEC_DEPS) \
		--closure 1 \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-s OUTLINING_LIMIT=20000 \
		-O3 --memory-init-file 0 \
		--pre-js $(PRE_JS) \
		--post-js $(POST_JS_SYNC) \
		-o $@

ffmpeg-worker-webm.js: $(FFMPEG_BC) \
			$(CODEC_DEPS) \
			$(PRE_JS) \
			$(POST_JS_WORKER)
	emcc $(FFMPEG_BC) $(CODEC_DEPS) \
		--closure 1 \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-s OUTLINING_LIMIT=20000 \
		-O3 --memory-init-file 0 \
		--pre-js $(PRE_JS) \
		--post-js $(POST_JS_WORKER) \
		-o $@
