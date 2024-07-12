#!/usr/bin/python3
# -*- coding: utf-8 -*-
#
# @author   Solomon Ng <solomon.wzs@gmail.com>
# @date     2021-03-17
# @version  1.0
# @license  GPL-2.0+

import base64
import re
import sys


def encode_str(text: str, enc: str):
    bs = text.encode(enc)
    s = ""
    for byte in bs:
        if 0 <= byte and byte <= 127:
            s += chr(byte)
        else:
            s += "\\x%02x" % byte
    sys.stdout.write(s)


def decode_str(text: str, enc: str):
    if enc == "base64":
        b = base64.decodebytes(text.encode("utf8"))
        try:
            sys.stdout.write(b.decode("utf8"))
        except:
            sys.stdout.write(b.decode("gbk"))
    else:

        def _hex(matchobj):
            str_hex = matchobj.group(1)
            i = int(str_hex, base=16)
            return bytes([i])

        bs = re.sub(rb"\\x([a-fA-F0-9]{2})", _hex, text.encode("utf8"))
        sys.stdout.write(bs.decode(enc))


def encode_quotation_str(text: str, enc: str):
    def _encode(matchobj) -> str:
        bs = matchobj.group(2).encode(enc)
        s = ""
        for byte in bs:
            s += "\\x%02x" % byte
        return matchobj.group(1) + s + matchobj.group(3)

    sys.stdout.write(re.sub("(['\"])(.*?)(['\"])", _encode, text))
