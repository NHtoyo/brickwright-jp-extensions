"""Safe SPIKE Prime runtime smoke program for a later user-authorized test.

This only imports the runtime APIs, inspects module_tunnel, registers a no-op
callback, and stays in runloop. It does not send tunnel data or control hardware.
Do not upload it over an existing slot without the user's explicit approval.
"""

print("BWSMOKE:stage=entered")

try:
    import hub
    import motor
    import runloop
    import time
    try:
        import json
    except ImportError:
        import ujson as json
    from hub import port, light_matrix, sound
except Exception as error:
    print("BWSMOKE:stage=import-error:" + type(error).__name__ + ":" + str(error))
    raise

print("BWSMOKE:stage=imports-ok")

try:
    tunnel = hub.config["module_tunnel"]

    def _receive(data):
        print("BWSMOKE:stage=tunnel-received:" + str(type(data).__name__))

    tunnel.callback(_receive)
except Exception as error:
    print("BWSMOKE:stage=tunnel-error:" + type(error).__name__ + ":" + str(error))
    raise

print("BWSMOKE:stage=callback-registered")


async def _main():
    print("BWSMOKE:stage=runloop-entered")
    count = 0
    while True:
        await runloop.sleep_ms(1000)
        count += 1
        print("BWSMOKE:stage=alive:" + str(count))


# The uploaded file is the program entry point; no __name__ guard is required.
runloop.run(_main())
