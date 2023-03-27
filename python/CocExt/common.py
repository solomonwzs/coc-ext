#!/usr/bin/python3
# -*- coding: utf-8 -*-
#
# @author   Solomon Ng <solomon.wzs@gmail.com>
# @date     2022-01-25
# @version  1.0
# @license  GPL-2.0+

import sys


def change_name_rule(name: str):
    if name.find("_") == -1:
        arr = []
        left = 0
        for right in range(1, len(name)):
            if "A" <= name[right] and name[right] <= "Z":
                arr.append(name[left:right].lower())
                left = right
        if left < len(name):
            arr.append(name[left:].lower())
        sys.stdout.write("_".join(arr))
    else:
        arr0 = name.split("_")
        arr = []
        for i in arr0:
            if len(i) > 0 and "a" <= i[0] and i[0] <= "z":
                arr.append(i[0].upper() + i[1:].lower())
            else:
                arr.append(i)
        sys.stdout.write("".join(arr))
