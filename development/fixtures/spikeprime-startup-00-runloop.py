"""No-hardware SPIKE startup probe: runloop only.

Do not transfer or start this program without the user's explicit approval.
It does not import hub APIs, access module_tunnel, print, or control hardware.
"""

import runloop


async def main():
    while True:
        await runloop.sleep_ms(1000)


runloop.run(main())
