#!/bin/bash

# Remove some build artifacts to make the submodule directories clean.

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"
rm -f libvpx/vpx_dsp_rtcd.h
rm -f ffmpeg/ffmpeg.bc
