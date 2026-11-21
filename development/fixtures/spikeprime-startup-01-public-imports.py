"""No-hardware SPIKE startup probe: public API imports plus runloop.

Do not transfer or start this program without the user's explicit approval.
It does not access module_tunnel, print, or control hardware.
"""

import hub
import motor
import runloop
import time

try:
    import json
except ImportError:
    import ujson as json

from hub import light_matrix, port, sound

PORTS = {"A": port.A, "B": port.B, "C": port.C, "D": port.D, "E": port.E, "F": port.F}


async def main():
    while True:
        await runloop.sleep_ms(1000)


runloop.run(main())
