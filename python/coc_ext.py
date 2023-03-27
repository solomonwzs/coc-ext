#!/usr/bin/python3
# -*- coding: utf-8 -*-
#
# @author   Solomon Ng <solomon.wzs@gmail.com>
# @date     2021-03-17
# @version  1.0
# @license  GPL-2.0+

# import pathlib
# sys.path.append(str(pathlib.Path(__file__).parent.absolute()))

import fcntl
import json
import os
import sys

import CocExt

if __name__ == "__main__":
    fcntl.fcntl(sys.stdin, fcntl.F_SETFL, os.O_NONBLOCK)
    msg = json.loads(sys.stdin.read())
    module = getattr(CocExt, msg.get("m"))
    function = getattr(module, msg.get("f"))
    argv = msg.get("a")
    function(*argv)
