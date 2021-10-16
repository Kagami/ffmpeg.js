# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated, see:
# <https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html>.

PRE_JS = build/pre.js
POST_JS_SYNC = build/post-sync.js
POST_JS_WORKER = build/post-worker.js

# Components common to webm and mp4, not for hls and dash
COMMON_FILTERS = aresample scale crop overlay hstack vstack
COMMON_DEMUXERS = matroska ogg mov mp3 wav image2 concat
COMMON_DECODERS = vp8 h264 vorbis opus mp3 aac pcm_s16le mjpeg png

WEBM_MUXERS = webm ogg null
WEBM_ENCODERS = libvpx_vp8 libopus
FFMPEG_WEBM_BC = build/ffmpeg-webm/ffmpeg.bc
FFMPEG_WEBM_PC_PATH = ../opus/dist/lib/pkgconfig
WEBM_SHARED_DEPS = \
	build/opus/dist/lib/libopus.so \
	build/libvpx/dist/lib/libvpx.so

MP4_MUXERS = mp4 mp3 null
MP4_ENCODERS = libx264 libmp3lame aac
FFMPEG_MP4_BC = build/ffmpeg-mp4/ffmpeg.bc
FFMPEG_MP4_PC_PATH = ../x264/dist/lib/pkgconfig
MP4_SHARED_DEPS = \
	build/lame/dist/lib/libmp3lame.so \
	build/x264/dist/lib/libx264.so

LIBRARY_HLS_JS = build/library-hls.js
HLS_DEMUXERS = matroska pcm_f32le # add mov for Safari support but beware patents!
HLS_BSFS = # add h264_mp4toannexb for Safari support but beware patents!
HLS_MUXERS = hls
HLS_DECODERS = libopus pcm_f32le # add h264 to get rid of DTS warnings but beware patents!
HLS_ENCODERS = aac
HLS_FILTERS = aresample
HLS_PARSERS = opus
FFMPEG_HLS_BC = build/ffmpeg-hls/ffmpeg.bc
FFMPEG_HLS_PC_PATH = ../opus/dist/lib/pkgconfig
HLS_SHARED_DEPS = build/opus/dist/lib/libopus.so

LIBRARY_DASH_JS = build/library-dash.js
DASH_DEMUXERS = matroska
DASH_BSFS = vp9_superframe
DASH_MUXERS = dash webm
DASH_DECODERS =
DASH_ENCODERS =
DASH_FILTERS =
DASH_PARSERS = vp9 opus
FFMPEG_DASH_BC = build/ffmpeg-dash/ffmpeg.bc

all: webm mp4 hls dash
webm: ffmpeg-webm.js ffmpeg-worker-webm.js
mp4: ffmpeg-mp4.js ffmpeg-worker-mp4.js
hls: ffmpeg-worker-hls.js ffmpeg-worker-hls.wasm
dash: ffmpeg-worker-dash.js ffmpeg-worker-dash.wasm

clean: clean-js clean-wasm \
	clean-opus clean-libvpx clean-ffmpeg-webm \
	clean-lame clean-x264 clean-ffmpeg-mp4 \
	clean-ffmpeg-hls clean-ffmpeg-dash
clean-js:
	rm -f ffmpeg*.js
clean-wasm:
	rm -f ffmpeg*.wasm
clean-opus:
	cd build/opus && git clean -xdf
clean-libvpx:
	cd build/libvpx && git clean -xdf
clean-ffmpeg-webm:
	cd build/ffmpeg-webm && git clean -xdf
clean-lame:
	cd build/lame && git clean -xdf
clean-x264:
	cd build/x264 && git clean -xdf
clean-ffmpeg-mp4:
	cd build/ffmpeg-mp4 && git clean -xdf
clean-ffmpeg-hls:
	cd build/ffmpeg-hls && git clean -xdf
clean-ffmpeg-dash:
	cd build/ffmpeg-dash && git clean -xdf

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
		--disable-asm \
		--disable-rtcd \
		--disable-intrinsics \
		--disable-hardening \
		--disable-stack-protector \
		&& \
	emmake make -j && \
	emmake make install

build/libvpx/dist/lib/libvpx.so:
	cd build/libvpx && \
	git reset --hard && \
	patch -p1 < ../libvpx-fix-ld.patch && \
	emconfigure ./configure \
		--prefix="$$(pwd)/dist" \
		--target=generic-gnu \
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
	emmake make -j && \
	emmake make install

build/lame/dist/lib/libmp3lame.so:
	cd build/lame/lame && \
	git reset --hard && \
	patch -p2 < ../../lame-fix-ld.patch && \
	emconfigure ./configure \
		CFLAGS="-DNDEBUG -O3" \
		--prefix="$$(pwd)/../dist" \
		--host=x86-none-linux \
		--disable-static \
		\
		--disable-gtktest \
		--disable-analyzer-hooks \
		--disable-decoder \
		--disable-frontend \
		&& \
	emmake make -j && \
	emmake make install

build/x264/dist/lib/libx264.so:
	cd build/x264 && \
	emconfigure ./configure \
		--prefix="$$(pwd)/dist" \
		--extra-cflags="-Wno-unknown-warning-option" \
		--host=x86-none-linux \
		--disable-cli \
		--enable-shared \
		--disable-opencl \
		--disable-thread \
		--disable-interlaced \
		--bit-depth=8 \
		--chroma-format=420 \
		--disable-asm \
		\
		--disable-avs \
		--disable-swscale \
		--disable-lavf \
		--disable-ffms \
		--disable-gpac \
		--disable-lsmash \
		&& \
	emmake make -j && \
	emmake make install

# TODO(Kagami): Emscripten documentation recommends to always use shared
# libraries but it's not possible in case of ffmpeg because it has
# multiple declarations of `ff_log2_tab` symbol. GCC builds FFmpeg fine
# though because it uses version scripts and so `ff_log2_tag` symbols
# are not exported to the shared libraries. Seems like `emcc` ignores
# them. We need to file bugreport to upstream. See also:
# - <https://kripken.github.io/emscripten-site/docs/compiling/Building-Projects.html>
# - <https://github.com/kripken/emscripten/issues/831>
# - <https://ffmpeg.org/pipermail/libav-user/2013-February/003698.html>
FFMPEG_COMMON_CORE_ARGS = \
	--cc=emcc \
	--ranlib=emranlib \
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
	--disable-safe-bitstream-reader \
	\
	--disable-all \
	--enable-ffmpeg \
	--enable-avcodec \
	--enable-avformat \
	--enable-avfilter \
	--enable-swresample \
	--enable-swscale \
	--disable-network \
	--disable-d3d11va \
	--disable-dxva2 \
	--disable-vaapi \
	--disable-vdpau \
	--enable-protocol=file \
	--disable-bzlib \
	--disable-iconv \
	--disable-libxcb \
	--disable-lzma \
	--disable-sdl2 \
	--disable-securetransport \
	--disable-xlib

FFMPEG_COMMON_ARGS = \
	$(FFMPEG_COMMON_CORE_ARGS) \
	$(addprefix --enable-decoder=,$(COMMON_DECODERS)) \
	$(addprefix --enable-demuxer=,$(COMMON_DEMUXERS)) \
	$(addprefix --enable-filter=,$(COMMON_FILTERS)) \
	--enable-zlib

build/ffmpeg-webm/ffmpeg.bc: $(WEBM_SHARED_DEPS)
	cd build/ffmpeg-webm && \
	EM_PKG_CONFIG_PATH=$(FFMPEG_WEBM_PC_PATH) emconfigure ./configure \
		$(FFMPEG_COMMON_ARGS) \
		$(addprefix --enable-encoder=,$(WEBM_ENCODERS)) \
		$(addprefix --enable-muxer=,$(WEBM_MUXERS)) \
		--enable-libopus \
		--enable-libvpx \
		--extra-cflags="-s USE_ZLIB=1 -I../libvpx/dist/include" \
		--extra-ldflags="-r -L../libvpx/dist/lib" \
		&& \
	emmake make -j EXESUF=.bc

build/ffmpeg-mp4/ffmpeg.bc: $(MP4_SHARED_DEPS)
	cd build/ffmpeg-mp4 && \
	EM_PKG_CONFIG_PATH=$(FFMPEG_MP4_PC_PATH) emconfigure ./configure \
		$(FFMPEG_COMMON_ARGS) \
		$(addprefix --enable-encoder=,$(MP4_ENCODERS)) \
		$(addprefix --enable-muxer=,$(MP4_MUXERS)) \
		--enable-gpl \
		--enable-libmp3lame \
		--enable-libx264 \
		--extra-cflags="-s USE_ZLIB=1 -I../lame/dist/include" \
		--extra-ldflags="-r -L../lame/dist/lib" \
		&& \
	emmake make -j EXESUF=.bc

build/ffmpeg-hls/ffmpeg.bc: $(HLS_SHARED_DEPS)
	cd build/ffmpeg-hls && \
	git reset --hard && \
	patch -p1 < ../ffmpeg-async-io.patch && \
	patch -p1 < ../ffmpeg-hls-configure.patch && \
	patch -p1 < ../ffmpeg-exit.patch && \
	EM_PKG_CONFIG_PATH=$(FFMPEG_HLS_PC_PATH) emconfigure ./configure \
		$(FFMPEG_COMMON_CORE_ARGS) \
		$(addprefix --enable-demuxer=,$(HLS_DEMUXERS)) \
		$(addprefix --enable-muxer=,$(HLS_MUXERS)) \
		$(addprefix --enable-decoder=,$(HLS_DECODERS)) \
		$(addprefix --enable-encoder=,$(HLS_ENCODERS)) \
		$(addprefix --enable-bsf=,$(HLS_BSFS)) \
		$(addprefix --enable-filter=,$(HLS_FILTERS)) \
		$(addprefix --enable-parser=,$(HLS_PARSERS)) \
		--disable-zlib \
		--enable-libopus \
		--enable-protocol=pipe \
		--extra-ldflags="-r" \
		&& \
	emmake make -j EXESUF=.bc

build/ffmpeg-dash/ffmpeg.bc:
	cd build/ffmpeg-dash && \
	git reset --hard && \
	patch -p1 < ../ffmpeg-async-io.patch && \
	patch -p1 < ../ffmpeg-dash-configure.patch && \
	patch -p1 < ../ffmpeg-dash-codecs.patch && \
	patch -p1 < ../ffmpeg-exit.patch && \
	emconfigure ./configure \
		$(FFMPEG_COMMON_CORE_ARGS) \
		$(addprefix --enable-demuxer=,$(DASH_DEMUXERS)) \
		$(addprefix --enable-muxer=,$(DASH_MUXERS)) \
		$(addprefix --enable-decoder=,$(DASH_DECODERS)) \
		$(addprefix --enable-encoder=,$(DASH_ENCODERS)) \
		$(addprefix --enable-bsf=,$(DASH_BSFS)) \
		$(addprefix --enable-filter=,$(DASH_FILTERS)) \
		$(addprefix --enable-parser=,$(DASH_PARSERS)) \
		--disable-zlib \
		--enable-protocol=pipe \
		--extra-ldflags="-r" \
		&& \
	emmake make -j EXESUF=.bc

EMCC_COMMON_CORE_ARGS = \
	-O3 \
	--closure 1 \
	--memory-init-file 0 \
	-s WASM_ASYNC_COMPILATION=0 \
	-s ASSERTIONS=0 \
	-s EXIT_RUNTIME=1 \
	-s TOTAL_MEMORY=67108864 \
	--pre-js $(PRE_JS) \
	-o $@

EMCC_COMMON_ARGS = \
	$(EMCC_COMMON_CORE_ARGS) \
	-s NODEJS_CATCH_EXIT=0 \
	-s NODEJS_CATCH_REJECTION=0 \
	-lnodefs.js -lworkerfs.js \
	-s WASM=0

ffmpeg-webm.js: $(FFMPEG_WEBM_BC) $(PRE_JS) $(POST_JS_SYNC)
	emcc $(FFMPEG_WEBM_BC) $(WEBM_SHARED_DEPS) \
		--post-js $(POST_JS_SYNC) \
		$(EMCC_COMMON_ARGS)

ffmpeg-worker-webm.js: $(FFMPEG_WEBM_BC) $(PRE_JS) $(POST_JS_WORKER)
	emcc $(FFMPEG_WEBM_BC) $(WEBM_SHARED_DEPS) \
		--post-js $(POST_JS_WORKER) \
		$(EMCC_COMMON_ARGS)

ffmpeg-mp4.js: $(FFMPEG_MP4_BC) $(PRE_JS) $(POST_JS_SYNC)
	emcc $(FFMPEG_MP4_BC) $(MP4_SHARED_DEPS) \
		--post-js $(POST_JS_SYNC) \
		$(EMCC_COMMON_ARGS) -O2

ffmpeg-worker-mp4.js: $(FFMPEG_MP4_BC) $(PRE_JS) $(POST_JS_WORKER)
	emcc $(FFMPEG_MP4_BC) $(MP4_SHARED_DEPS) \
		--post-js $(POST_JS_WORKER) \
		$(EMCC_COMMON_ARGS) -O2

ffmpeg-worker-hls.js ffmpeg-worker-hls.wasm: $(FFMPEG_HLS_BC) $(PRE_JS) $(POST_JS_WORKER) $(LIBRARY_HLS_JS)
	emcc $(FFMPEG_HLS_BC) $(HLS_SHARED_DEPS) \
		--post-js $(POST_JS_WORKER) \
		$(EMCC_COMMON_CORE_ARGS) \
		--js-library $(LIBRARY_HLS_JS) \
		-s WASM=1 \
		-s ASYNCIFY \
	        -s 'ASYNCIFY_IMPORTS=["emscripten_read_async", "emscripten_close_async"]'

ffmpeg-worker-dash.js ffmpeg-worker-dash.wasm: $(FFMPEG_DASH_BC) $(PRE_JS) $(POST_JS_WORKER) $(LIBRARY_DASH_JS)
	emcc $(FFMPEG_DASH_BC) \
		--post-js $(POST_JS_WORKER) \
		$(EMCC_COMMON_CORE_ARGS) \
		--js-library $(LIBRARY_DASH_JS) \
		-s WASM=1 \
		-s ASYNCIFY \
	        -s 'ASYNCIFY_IMPORTS=["emscripten_read_async", "emscripten_close_async"]'
