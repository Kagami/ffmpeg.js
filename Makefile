# Compile FFmpeg and all its dependencies to JavaScript.
# You need emsdk environment installed and activated, see:
# <https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html>.

MUXERS = webm ogg null
DEMUXERS = matroska avi mov concat
ENCODERS = libvpx_vp8 libopus
DECODERS = \
	vp8 vp9 \
	vorbis opus \
	mpeg4 h264 \
	mp3 ac3 aac \
	ass ssa srt webvtt

LIBASS_PC_PATH = \
	../freetype/dist/lib/pkgconfig:../fribidi/dist/lib/pkgconfig
FFMPEG_PC_PATH = \
	../opus/dist/lib/pkgconfig:../libass/dist/lib/pkgconfig:$(LIBASS_PC_PATH)
LIBASS_DEPS = \
	build/fribidi/dist/lib/libfribidi.so \
	build/freetype/dist/lib/libfreetype.so
SHARED_DEPS = \
	$(LIBASS_DEPS) \
	build/libass/dist/lib/libass.so \
	build/opus/dist/lib/libopus.so \
	build/libvpx/libvpx.so
FFMPEG_BC = build/ffmpeg/ffmpeg.bc
PRE_JS = build/pre.js
POST_JS_SYNC = build/post-sync.js
POST_JS_WORKER = build/post-worker.js

all: ffmpeg-webm.js ffmpeg-worker-webm.js

clean: clean-js clean-opus \
	clean-freetype clean-fribidi clean-libass \
	clean-libvpx clean-ffmpeg
clean-js:
	rm -f -- ffmpeg*.js
clean-opus:
	-cd build/opus && rm -rf dist && make clean
clean-freetype:
	-cd build/freetype && rm -rf dist && make clean
clean-fribidi:
	-cd build/fribidi && rm -rf dist && make clean
clean-libass:
	-cd build/libass && rm -rf dist && make clean
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

build/freetype/builds/unix/configure:
	cd build/freetype && ./autogen.sh

# TODO(Kagami): Optimized build? It seems to be broken:
# <https://github.com/kripken/emscripten/issues/3576>.
# XXX(Kagami): host/build flags are used to enable cross-compiling
# (values must differ) but there should be some better way to achieve
# that: now it probably won't be possible to build it on x86.
build/freetype/dist/lib/libfreetype.so: build/freetype/builds/unix/configure
	cd build/freetype && \
	emconfigure ./configure \
		CFLAGS="-Wno-warn-absolute-paths" \
		--prefix="$$(pwd)/dist" \
		--host=x86-none-linux \
		--build=x86_64 \
		--disable-static \
		--without-zlib \
		--without-bzip2 \
		--without-png \
		--without-harfbuzz \
		&& \
	emmake make -j8 && \
	emmake make install

build/fribidi/configure:
	cd build/fribidi && ./bootstrap

# TODO(Kagami): Report cross-compile hacks to upstream.
build/fribidi/dist/lib/libfribidi.so: build/fribidi/configure
	cd build/fribidi && \
	emconfigure ./configure \
		CFLAGS=-O3 \
		NM=llvm-nm \
		--prefix="$$(pwd)/dist" \
		--disable-dependency-tracking \
		--disable-debug \
		--without-glib \
		&& \
	sed -i 's/^SUBDIRS =.*/SUBDIRS=gen.tab charset lib/' Makefile && \
	sed -i 's/^CC =.*/CC=gcc/' gen.tab/Makefile && \
	emmake make -j8 && \
	emmake make install

build/libass/configure:
	cd build/libass && ./autogen.sh

build/libass/dist/lib/libass.so: build/libass/configure $(LIBASS_DEPS)
	cd build/libass && \
	EM_PKG_CONFIG_PATH=$(LIBASS_PC_PATH) emconfigure ./configure \
		CFLAGS="-O3 -Wno-warn-absolute-paths" \
		--prefix="$$(pwd)/dist" \
		--disable-static \
		--disable-enca \
		--disable-fontconfig \
		--disable-harfbuzz \
		--disable-asm \
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

# TODO(Kagami): Emscripten documentation recommends to always use shared
# libraries but it's not possible in case of ffmpeg because it has
# multiple declarations of `ff_log2_tab` symbol. GCC builds FFmpeg fine
# though because it uses version scripts and so `ff_log2_tag` symbols
# are not exported to the shared libraries. Seems like `emcc` ignores
# them. We need to file bugreport to upstream. See also:
# - <https://kripken.github.io/emscripten-site/docs/compiling/Building-Projects.html>
# - <https://github.com/kripken/emscripten/issues/831>
# - <https://ffmpeg.org/pipermail/libav-user/2013-February/003698.html>
build/ffmpeg/ffmpeg.bc: $(SHARED_DEPS)
	cd build/ffmpeg && \
	patch -p1 -N -r - < ../ffmpeg-default-font.patch; \
	EM_PKG_CONFIG_PATH=$(FFMPEG_PC_PATH) emconfigure ./configure \
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
		--enable-filter=subtitles \
		--disable-bzlib \
		--disable-iconv \
		--enable-libass \
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

ffmpeg-webm.js: $(FFMPEG_BC) $(PRE_JS) $(POST_JS_SYNC)
	emcc $(FFMPEG_BC) $(SHARED_DEPS) \
		--closure 1 \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-s OUTLINING_LIMIT=20000 \
		-O3 --memory-init-file 0 \
		--pre-js $(PRE_JS) \
		--post-js $(POST_JS_SYNC) \
		-o $@

ffmpeg-worker-webm.js: $(FFMPEG_BC) $(PRE_JS) $(POST_JS_WORKER)
	emcc $(FFMPEG_BC) $(SHARED_DEPS) \
		--closure 1 \
		-s NODE_STDOUT_FLUSH_WORKAROUND=0 \
		-s TOTAL_MEMORY=67108864 \
		-s OUTLINING_LIMIT=20000 \
		-O3 --memory-init-file 0 \
		--pre-js $(PRE_JS) \
		--post-js $(POST_JS_WORKER) \
		-o $@
