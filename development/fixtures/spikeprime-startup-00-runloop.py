"""No-hardware SPIKE startup probe: runloop only.

This probe prints unique stage markers but does not import hub APIs, access
module_tunnel, or control hardware. The uploader embeds a per-run marker ID.
"""

print("BWPROBE00:__RUN_ID__:TOP_LEVEL")
import runloop
print("BWPROBE00:__RUN_ID__:RUNLOOP_IMPORTED")


async def main():
    print("BWPROBE00:__RUN_ID__:MAIN_STARTED")
    await runloop.sleep_ms(2000)
    print("BWPROBE00:__RUN_ID__:SLEEP_COMPLETED")
    print("BWPROBE00:__RUN_ID__:MAIN_COMPLETED")


runloop.run(main())
