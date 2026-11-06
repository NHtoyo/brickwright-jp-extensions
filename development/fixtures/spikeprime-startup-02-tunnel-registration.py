"""No-hardware SPIKE startup probe: module_tunnel lookup and callback.

Do not transfer or start this program without the user's explicit approval.
It registers, but never invokes, a receive callback and never sends tunnel data.
It does not print or control hardware.
"""

import hub
import runloop

tunnel = hub.config["module_tunnel"]


def receive(_data):
    pass


tunnel.callback(receive)


async def main():
    while True:
        await runloop.sleep_ms(1000)


runloop.run(main())
