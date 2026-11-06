"""Execute the embedded SPIKE controller against a fake Hub OS API.

This verifies source syntax, command parsing, hardware API dispatch, responses,
the command whitelist, queue handling, and the disconnect watchdog. It does not
claim Hub OS 1.6.62 or physical hardware compatibility.

Run with: python development/test-spikeprime-hub-controller.py
"""

import asyncio
import contextlib
import io
import json
import pathlib
import re
import sys
import types
import unittest
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extensions/CrispStrobe/legospike_turbowarp_transpile.js"
SMOKE_PROGRAM = ROOT / "development/fixtures/spikeprime-startup-smoke.py"
STARTUP_PROBES = {
    "00": ROOT / "development/fixtures/spikeprime-startup-00-runloop.py",
    "01": ROOT / "development/fixtures/spikeprime-startup-01-public-imports.py",
    "02": ROOT / "development/fixtures/spikeprime-startup-02-tunnel-registration.py",
}
SOURCE = EXTENSION.read_text(encoding="utf-8")
SOURCE_MATCH = re.search(
    r"const SPIKE3_CONTROLLER_SOURCE = String\.raw`(.*?)`;", SOURCE, re.DOTALL
)
if not SOURCE_MATCH:
    raise RuntimeError("embedded SPIKE controller source was not found")
CONTROLLER_SOURCE = SOURCE_MATCH.group(1)
compile(CONTROLLER_SOURCE, "brickwright_spike_controller.py", "exec")


class FakeTunnel:
    def __init__(self, callback_error=None):
        self.callback_handler = None
        self.events = []
        self.callback_error = callback_error

    def callback(self, handler):
        if self.callback_error:
            raise self.callback_error
        self.callback_handler = handler

    def send(self, data):
        self.events.append(json.loads(data.decode("utf-8").strip()))


class FakeRunloopStop(BaseException):
    """Deterministic test-only stop after proving the controller stayed alive."""


class FakeRunloop:
    def __init__(self, stop_after_sleeps=3):
        self.stop_after_sleeps = stop_after_sleeps
        self.sleep_calls = []
        self.run_calls = 0

    async def sleep_ms(self, milliseconds):
        self.sleep_calls.append(milliseconds)
        if len(self.sleep_calls) >= self.stop_after_sleeps:
            raise FakeRunloopStop()

    def run(self, coroutine):
        self.run_calls += 1
        asyncio.run(coroutine)


class FakeMotor:
    def __init__(self):
        self.calls = []
        self.fail = False

    def run(self, port, velocity):
        if self.fail:
            raise RuntimeError("motor API failure")
        self.calls.append(("run", port, velocity))

    def stop(self, port):
        self.calls.append(("stop", port))

    def set_duty_cycle(self, port, duty_cycle):
        self.calls.append(("set_duty_cycle", port, duty_cycle))

    def run_for_degrees(self, port, degrees, velocity):
        if self.fail:
            raise RuntimeError("motor API failure")
        self.calls.append(("run_for_degrees", port, degrees, velocity))

    def run_for_time(self, port, duration, velocity):
        self.calls.append(("run_for_time", port, duration, velocity))

    def run_to_absolute_position(self, port, position, velocity):
        self.calls.append(("run_to_absolute_position", port, position, velocity))


class FakeMatrix:
    def __init__(self):
        self.calls = []

    def set_pixel(self, x, y, brightness):
        self.calls.append(("set_pixel", x, y, brightness))

    def clear(self):
        self.calls.append(("clear",))


class FakeSound:
    def __init__(self):
        self.calls = []

    async def beep(self, frequency, duration, volume):
        self.calls.append(("beep", frequency, duration, volume))

    def stop(self):
        self.calls.append(("stop",))


def fake_hub_environment(
    include_module_tunnel=True,
    tunnel_callback_error=None,
    module_name="brickwright_controller_test",
    stop_after_sleeps=3,
):
    tunnel = FakeTunnel(tunnel_callback_error)
    motor = FakeMotor()
    matrix = FakeMatrix()
    sound = FakeSound()
    ports = types.SimpleNamespace(**{name: object() for name in "ABCDEF"})
    hub = types.ModuleType("hub")
    hub.config = {"module_tunnel": tunnel} if include_module_tunnel else {}
    hub.port = ports
    hub.light_matrix = matrix
    hub.sound = sound
    runloop = types.ModuleType("runloop")
    runloop_fake = FakeRunloop(stop_after_sleeps)
    runloop.sleep_ms = runloop_fake.sleep_ms
    runloop.run = runloop_fake.run
    motor_module = types.ModuleType("motor")
    for name in (
        "run",
        "stop",
        "set_duty_cycle",
        "run_for_degrees",
        "run_for_time",
        "run_to_absolute_position",
    ):
        setattr(motor_module, name, getattr(motor, name))
    fake_time = types.ModuleType("time")
    fake_time.now = 1000
    fake_time.ticks_ms = lambda: fake_time.now
    fake_time.ticks_diff = lambda new, old: new - old
    modules = {
        "hub": hub,
        "motor": motor_module,
        "runloop": runloop,
        "time": fake_time,
    }
    namespace = {"__name__": module_name}
    boot_output = io.StringIO()
    with contextlib.redirect_stdout(boot_output), patch.dict(sys.modules, modules):
        try:
            exec(
                compile(CONTROLLER_SOURCE, "brickwright_spike_controller.py", "exec"),
                namespace,
            )
        except FakeRunloopStop:
            # The fake runloop executes the real coroutine until this sentinel.
            # It is deliberately not a successful normal return from runloop.run.
            pass
    return (
        namespace,
        tunnel,
        motor,
        matrix,
        sound,
        fake_time,
        runloop_fake,
        boot_output.getvalue(),
    )


COMMAND_CODES = {
    "controller.hello": "h", "controller.ping": "p", "controller.stop_all": "x",
    "motor.run": "r", "motor.stop": "s", "motor.power": "u", "motor.run_degrees": "d",
    "motor.run_time": "t", "motor.run_to_position": "a",
    "matrix.pixel": "l", "matrix.pattern": "m", "matrix.clear": "c",
    "sound.beep": "b", "sound.stop": "q",
}
FIELD_CODES = {
    "port": "p", "velocity": "v", "degrees": "d", "duration_ms": "t", "power": "u",
    "position": "g", "x": "x", "y": "y", "brightness": "b",
    "pixels": "z", "frequency": "f",
}


def wire_command(command):
    name = command.get("cmd")
    encoded = {"i": command.get("request_id"), "c": COMMAND_CODES.get(name, name)}
    for key, value in command.items():
        if key in ("cmd", "request_id"):
            continue
        field = FIELD_CODES.get(key, key)
        if key == "pixels" and isinstance(value, list):
            value = "".join("9" if int(pixel) > 0 else "0" for pixel in value)
        encoded[field] = value
    return encoded


class SpikeControllerFakeHubTests(unittest.TestCase):
    def setUp(self):
        (
            self.controller,
            self.tunnel,
            self.motor,
            self.matrix,
            self.sound,
            self.clock,
            self.runloop,
            self.boot_output,
        ) = fake_hub_environment()

    def message(self, command):
        return json.dumps(wire_command(command), separators=(",", ":")).encode("utf-8")

    def dispatch(self, command):
        asyncio.run(self.controller["_dispatch"](wire_command(command)))

    def test_syntax_and_tunnel_initialization(self):
        self.controller["_initialize"]()
        self.assertTrue(callable(self.tunnel.callback_handler))
        self.tunnel.callback_handler(self.message({"cmd": "controller.hello", "request_id": "h1"}))
        asyncio.run(self.controller["_process_next"]())
        self.assertEqual(
            self.tunnel.events[-1],
            {"i": "h1", "ok": True, "result": "bw-spike-1"},
        )

    def test_entrypoint_executes_and_waits_in_the_main_program(self):
        controller, tunnel, _motor, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(module_name="__main__", stop_after_sleeps=3)
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls, [10, 10, 10])
        self.assertTrue(callable(tunnel.callback_handler))
        self.assertIn("BWCTRL:boot:entered", output)
        self.assertIn("BWCTRL:boot:runloop-entered", output)
        self.assertIn("BWCTRL:boot:tunnel-callback-registered", output)
        self.assertEqual(controller["_queue"], [])

    def test_entrypoint_does_not_depend_on_module_name(self):
        _controller, tunnel, _motor, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(
                module_name="brickwright_controller_test", stop_after_sleeps=2
            )
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls, [10, 10])
        self.assertTrue(callable(tunnel.callback_handler))
        self.assertIn("BWCTRL:boot:tunnel-callback-registered", output)

    def test_missing_module_tunnel_is_logged_and_program_stays_alive(self):
        _controller, tunnel, _motor, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(include_module_tunnel=False)
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls, [1000, 1000, 1000])
        self.assertIsNone(tunnel.callback_handler)
        self.assertIn("BWCTRL:boot:init-error:RuntimeError", output)
        self.assertIn("module_tunnel", output)

    def test_tunnel_callback_failure_is_logged_and_program_stays_alive(self):
        _controller, tunnel, _motor, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(
                tunnel_callback_error=RuntimeError("callback registration failed")
            )
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls, [1000, 1000, 1000])
        self.assertIsNone(tunnel.callback_handler)
        self.assertIn("BWCTRL:boot:init-error:RuntimeError", output)
        self.assertIn("callback registration failed", output)

    def test_startup_smoke_program_compiles_and_has_no_hardware_commands(self):
        smoke_source = SMOKE_PROGRAM.read_text(encoding="utf-8")
        compile(smoke_source, str(SMOKE_PROGRAM), "exec")
        for forbidden_call in (
            "motor.run(",
            "motor.stop(",
            "light_matrix.set_pixel(",
            "light_matrix.clear(",
            "sound.beep(",
            "tunnel.send(",
        ):
            self.assertNotIn(forbidden_call, smoke_source)

    def test_startup_probes_compile_and_do_not_control_hardware(self):
        forbidden_calls = (
            "motor.run(",
            "motor.stop(",
            "motor.run_for_degrees(",
            "light_matrix.set_pixel(",
            "light_matrix.clear(",
            "sound.beep(",
            "tunnel.send(",
            "runloop.run(_main())",
        )
        for probe_id, filename in STARTUP_PROBES.items():
            with self.subTest(probe=probe_id):
                probe_source = filename.read_text(encoding="utf-8")
                compile(probe_source, str(filename), "exec")
                self.assertIn("runloop.run(main())", probe_source)
                for forbidden_call in forbidden_calls:
                    self.assertNotIn(forbidden_call, probe_source)

    def test_fake_hub_imports_runtime_modules_and_hub_exports(self):
        self.assertIn("BWCTRL:boot:imports-ok", self.boot_output)
        for name in ("hub", "motor", "runloop", "time", "json"):
            self.assertIn(name, self.controller)
        for name in ("port", "light_matrix", "sound"):
            self.assertIn(name, self.controller)
        self.assertEqual(set("ABCDEF"), set(self.controller["PORTS"]))
        self.assertIsNotNone(self.controller["light_matrix"])
        self.assertIsNotNone(self.controller["sound"])

    def test_motor_start_stop_degrees_timed_and_absolute_position(self):
        self.dispatch({"cmd": "motor.run", "port": "A", "velocity": 180, "request_id": "1"})
        self.dispatch({"cmd": "motor.stop", "port": "A", "request_id": "2"})
        self.dispatch({"cmd": "motor.power", "port": "A", "power": 250, "request_id": "p"})
        self.dispatch({"cmd": "motor.run_degrees", "port": "B", "degrees": 90, "velocity": 100, "request_id": "3"})
        self.dispatch({"cmd": "motor.run_time", "port": "C", "duration_ms": 100, "velocity": -90, "request_id": "4"})
        self.dispatch({"cmd": "motor.run_to_position", "port": "D", "position": 45, "velocity": 120, "request_id": "5"})
        self.assertEqual(
            [call[0] for call in self.motor.calls],
            ["run", "stop", "set_duty_cycle", "run_for_degrees", "run_for_time", "run_to_absolute_position"],
        )
        self.assertEqual(self.motor.calls[2], ("set_duty_cycle", self.controller["PORTS"]["A"], 250))
        self.assertTrue(all(event["ok"] for event in self.tunnel.events))

    def test_matrix_pixel_on_off_pattern_and_clear(self):
        self.dispatch({"cmd": "matrix.pixel", "x": 0, "y": 0, "brightness": 100, "request_id": "1"})
        self.dispatch({"cmd": "matrix.pixel", "x": 0, "y": 0, "brightness": 0, "request_id": "2"})
        self.dispatch({"cmd": "matrix.pattern", "pixels": [100] + [0] * 24, "request_id": "3"})
        self.dispatch({"cmd": "matrix.clear", "request_id": "4"})
        self.assertIn(("set_pixel", 0, 0, 100), self.matrix.calls)
        self.assertIn(("set_pixel", 0, 0, 0), self.matrix.calls)
        self.assertIn(("clear",), self.matrix.calls)
        self.assertEqual(len([call for call in self.matrix.calls if call[0] == "set_pixel"]), 27)

    def test_sound_beep_and_stop(self):
        self.dispatch({"cmd": "sound.beep", "frequency": 440, "duration_ms": 150, "request_id": "b"})
        self.dispatch({"cmd": "sound.stop", "request_id": "s"})
        self.assertEqual(self.sound.calls, [("beep", 440, 150, 100), ("stop",)])

    def test_execution_errors_are_returned_without_false_success(self):
        self.motor.fail = True
        self.dispatch({"cmd": "motor.run", "port": "A", "velocity": 100, "request_id": "e"})
        self.assertFalse(self.tunnel.events[-1]["ok"])
        self.assertEqual(self.tunnel.events[-1]["error"], "execution_failed")
        self.assertIn("motor API failure", self.tunnel.events[-1]["detail"])

    def test_invalid_and_arbitrary_python_commands_are_rejected(self):
        self.controller["_initialize"]()
        self.tunnel.callback_handler(self.message({"cmd": "python.exec", "code": "motor.run(...)"}))
        self.assertEqual(self.tunnel.events[-1]["error"], "invalid_command")
        self.tunnel.callback_handler(b"not json")
        self.assertEqual(self.tunnel.events[-1]["error"], "invalid_command")
        self.assertEqual(self.motor.calls, [])

    def test_unverified_matrix_text_is_rejected(self):
        self.controller["_initialize"]()
        self.tunnel.callback_handler(
            json.dumps({"i": "text", "c": "w", "t": "Hello"}).encode("utf-8")
        )
        self.assertEqual(self.tunnel.events[-1]["error"], "invalid_command")
        self.assertEqual(self.matrix.calls, [])

    def test_ranges_and_ports_are_validated(self):
        self.dispatch({"cmd": "motor.run", "port": "__import__", "velocity": 100, "request_id": "p"})
        self.dispatch({"cmd": "matrix.pixel", "x": 9, "y": 0, "brightness": 100, "request_id": "x"})
        self.assertFalse(self.tunnel.events[-2]["ok"])
        self.assertFalse(self.tunnel.events[-1]["ok"])
        self.assertEqual(self.motor.calls, [])
        self.assertEqual(self.matrix.calls, [])

    def test_disconnect_watchdog_stops_motors_and_sound(self):
        self.controller["_active"] = True
        self.controller["_last_heartbeat"] = 1000
        self.clock.now = 4001
        stopped = asyncio.run(self.controller["_check_watchdog"]())
        self.assertTrue(stopped)
        self.assertEqual(len(self.motor.calls), 6)
        self.assertTrue(all(call[0] == "stop" for call in self.motor.calls))
        self.assertEqual(self.sound.calls, [("stop",)])
        self.assertFalse(self.controller["_active"])

    def test_tunnel_receive_queue_is_ordered_and_bounded(self):
        self.controller["_initialize"]()
        receive = self.tunnel.callback_handler
        receive(self.message({"cmd": "motor.run", "port": "A", "velocity": 100, "request_id": "1"}))
        receive(self.message({"cmd": "motor.stop", "port": "A", "request_id": "2"}))
        asyncio.run(self.controller["_process_next"]())
        asyncio.run(self.controller["_process_next"]())
        self.assertEqual([call[0] for call in self.motor.calls], ["run", "stop"])

        for _ in range(self.controller["MAX_QUEUE"]):
            receive(self.message({"cmd": "sound.stop"}))
        receive(self.message({"cmd": "sound.stop"}))
        self.assertEqual(self.tunnel.events[-1]["error"], "queue_full")
        self.assertEqual(len(self.controller["_queue"]), self.controller["MAX_QUEUE"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
