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
import os
import pathlib
import re
import sys
import tempfile
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


class FakeRunloopStop(Exception):
    """Deterministic test-only stop after proving worker tasks stayed alive."""


class FakeRunloop:
    def __init__(self, stop_after_sleeps=3):
        self.stop_after_sleeps = stop_after_sleeps
        self.sleep_calls = []
        self.run_calls = 0

    async def sleep_ms(self, milliseconds):
        self.sleep_calls.append(milliseconds)
        if len(self.sleep_calls) >= self.stop_after_sleeps:
            raise FakeRunloopStop()

    def run(self, coroutine, *others):
        self.run_calls += 1

        async def run_tasks():
            await asyncio.gather(coroutine, *others)

        asyncio.run(run_tasks())


class FakeMotor:
    def __init__(self):
        self.calls = []
        self.fail = False

    def run(self, port, velocity):
        if self.fail:
            raise RuntimeError("motor API failure")
        self.calls.append(("run", port, velocity))

    def stop(self, port, *, stop=1):
        self.calls.append(("stop", port, stop))

    def set_duty_cycle(self, port, duty_cycle):
        self.calls.append(("set_duty_cycle", port, duty_cycle))

    async def run_for_degrees(self, port, degrees, velocity, *, stop=1):
        if self.fail:
            raise RuntimeError("motor API failure")
        self.calls.append(("run_for_degrees", port, degrees, velocity, stop))

    async def run_for_time(self, port, duration, velocity, *, stop=1):
        self.calls.append(("run_for_time", port, duration, velocity, stop))

    async def run_to_absolute_position(self, port, position, velocity, *, stop=1):
        self.calls.append(("run_to_absolute_position", port, position, velocity, stop))

    def reset_relative_position(self, port, position):
        self.calls.append(("reset_relative_position", port, position))


class FakeMatrix:
    def __init__(self):
        self.calls = []

    def set_pixel(self, x, y, brightness):
        self.calls.append(("set_pixel", x, y, brightness))

    def clear(self):
        self.calls.append(("clear",))

    async def write(self, text):
        self.calls.append(("write", text))

    def show_image(self, image_id):
        self.calls.append(("show_image", image_id))

    def set_orientation(self, value):
        self.calls.append(("set_orientation", value))


class FakeMotorPair:
    PAIR_1 = 0

    def __init__(self):
        self.calls = []

    def pair(self, pair_id, left, right):
        self.calls.append(("pair", pair_id, left, right))

    def move(self, pair_id, steering, *, velocity):
        self.calls.append(("move", pair_id, steering, velocity))

    async def move_for_degrees(self, pair_id, degrees, steering, *, velocity, stop):
        self.calls.append(("move_for_degrees", pair_id, degrees, steering, velocity, stop))

    async def move_for_time(self, pair_id, duration, steering, *, velocity, stop):
        self.calls.append(("move_for_time", pair_id, duration, steering, velocity, stop))

    def move_tank(self, pair_id, left_velocity, right_velocity):
        self.calls.append(("move_tank", pair_id, left_velocity, right_velocity))

    async def move_tank_for_degrees(self, pair_id, degrees, left_velocity, right_velocity):
        self.calls.append(("move_tank_for_degrees", pair_id, degrees, left_velocity, right_velocity))

    async def move_tank_for_time(self, pair_id, duration, left_velocity, right_velocity):
        self.calls.append(("move_tank_for_time", pair_id, duration, left_velocity, right_velocity))

    def stop(self, pair_id, *, stop):
        self.calls.append(("stop", pair_id, stop))


class FakeColorMatrix:
    def __init__(self):
        self.calls = []
        self.pixels = {}

    def show(self, port, pixels):
        self.calls.append(("show", port, pixels))

    def get_pixel(self, port, x, y):
        return self.pixels.get((port, x, y), (0, 0))

    def set_pixel(self, port, x, y, pixel):
        self.calls.append(("set_pixel", port, x, y, pixel))
        self.pixels[(port, x, y)] = pixel

    def clear(self, port):
        self.calls.append(("clear", port))


class FakeDistanceSensor:
    def __init__(self):
        self.calls = []

    def show(self, port, levels):
        self.calls.append(("show", port, levels))


class FakeLight:
    POWER = 0

    def __init__(self):
        self.calls = []

    def color(self, light_id, color_value):
        self.calls.append(("color", light_id, color_value))


class FakeSensorAPI:
    def __init__(self):
        self.reflection_value = 42
        self.force_value = 7
        self.pressed_value = True

    def reflection(self, port):
        return self.reflection_value

    def color(self, port):
        return 9

    def rgbi(self, port):
        return (100, 200, 300, 400)

    def force(self, port):
        return self.force_value

    def pressed(self, port):
        return self.pressed_value


class FakeMotionSensor:
    TAPPED = 0
    DOUBLE_TAPPED = 1
    SHAKEN = 2
    FALLING = 3
    TOP = 0
    FRONT = 1
    RIGHT = 2
    BOTTOM = 3
    BACK = 4
    LEFT = 5

    def __init__(self):
        self.calls = []

    def tilt_angles(self):
        return (10, 20, 30)

    def angular_velocity(self, raw):
        return (1, 2, 3) if raw else (4, 5, 6)

    def acceleration(self, raw):
        return (100, 200, 300) if raw else (400, 500, 600)

    def gesture(self):
        return self.SHAKEN

    def up_face(self):
        return self.TOP

    def reset_yaw(self, angle):
        self.calls.append(("reset_yaw", angle))


class FakeButton:
    LEFT = 1
    RIGHT = 2

    def pressed(self, button):
        return button == self.LEFT


class FakeSound:
    WAVEFORM_SINE = 1
    WAVEFORM_SQUARE = 2
    WAVEFORM_SAWTOOTH = 3
    WAVEFORM_TRIANGLE = 4

    def __init__(self):
        self.calls = []

    async def beep(self, frequency, duration, volume, *, waveform=None):
        self.calls.append(("beep", frequency, duration, volume, waveform))

    def volume(self, volume):
        self.calls.append(("volume", volume))

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
    motor_pair = FakeMotorPair()
    color_matrix = FakeColorMatrix()
    distance_sensor = FakeDistanceSensor()
    light = FakeLight()
    color_sensor = FakeSensorAPI()
    force_sensor = FakeSensorAPI()
    motion_sensor = FakeMotionSensor()
    button = FakeButton()
    ports = types.SimpleNamespace(**{name: object() for name in "ABCDEF"})
    hub = types.ModuleType("hub")
    hub.config = {"module_tunnel": tunnel} if include_module_tunnel else {}
    hub.port = ports
    hub.light_matrix = matrix
    hub.sound = sound
    hub.motion_sensor = motion_sensor
    hub.button = button
    hub.light = light
    hub.temperature = lambda: 237
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
    motor_module.COAST = 0
    motor_module.BRAKE = 1
    motor_module.HOLD = 2
    motor_module.READY = 0
    motor_module.CANCELLED = 3
    motor_pair_module = types.ModuleType("motor_pair")
    motor_pair_module.PAIR_1 = motor_pair.PAIR_1
    for name in (
        "pair",
        "move",
        "move_for_degrees",
        "move_for_time",
        "move_tank",
        "move_tank_for_degrees",
        "move_tank_for_time",
        "stop",
    ):
        setattr(motor_pair_module, name, getattr(motor_pair, name))
    color_matrix_module = types.ModuleType("color_matrix")
    color_matrix_module.calls = color_matrix.calls
    for name in ("show", "get_pixel", "set_pixel", "clear"):
        setattr(color_matrix_module, name, getattr(color_matrix, name))
    distance_sensor_module = types.ModuleType("distance_sensor")
    distance_sensor_module.calls = distance_sensor.calls
    distance_sensor_module.show = distance_sensor.show
    color_module = types.ModuleType("color")
    for index, name in enumerate(("BLACK", "MAGENTA", "PURPLE", "BLUE", "AZURE", "TURQUOISE", "GREEN", "YELLOW", "ORANGE", "RED", "WHITE")):
        setattr(color_module, name, index)
    orientation_module = types.ModuleType("orientation")
    for index, name in enumerate(("UP", "RIGHT", "DOWN", "LEFT")):
        setattr(orientation_module, name, index)
    color_sensor_module = types.ModuleType("color_sensor")
    for name in ("color", "reflection", "rgbi"):
        setattr(color_sensor_module, name, getattr(color_sensor, name))
    force_sensor_module = types.ModuleType("force_sensor")
    for name in ("force", "pressed"):
        setattr(force_sensor_module, name, getattr(force_sensor, name))
    fake_time = types.ModuleType("time")
    fake_time.now = 1000
    fake_time.ticks_ms = lambda: fake_time.now
    fake_time.ticks_diff = lambda new, old: new - old
    modules = {
        "hub": hub,
        "motor": motor_module,
        "motor_pair": motor_pair_module,
        "color_matrix": color_matrix_module,
        "distance_sensor": distance_sensor_module,
        "color": color_module,
        "orientation": orientation_module,
        "color_sensor": color_sensor_module,
        "force_sensor": force_sensor_module,
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
        motor_pair,
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
    "matrix.pixel": "l", "matrix.pattern": "m", "matrix.clear": "c", "matrix.text": "w",
    "sound.beep": "b", "sound.stop": "q",
}
FIELD_CODES = {
    "port": "p", "velocity": "v", "degrees": "d", "duration_ms": "t", "power": "u",
    "position": "g", "x": "x", "y": "y", "brightness": "b",
    "pixels": "z", "frequency": "f", "text": "t",
}


def wire_command(command):
    name = command.get("cmd")
    encoded = {"i": command.get("request_id"), "c": COMMAND_CODES.get(name, name)}
    for key, value in command.items():
        if key in ("cmd", "request_id"):
            continue
        field = FIELD_CODES.get(key, key)
        encoded[field] = value
    return encoded


class SpikeControllerFakeHubTests(unittest.TestCase):
    def setUp(self):
        (
            self.controller,
            self.tunnel,
            self.motor,
            self.motor_pair,
            self.matrix,
            self.sound,
            self.clock,
            self.runloop,
            self.boot_output,
        ) = fake_hub_environment()

    def message(self, command):
        return json.dumps(wire_command(command), separators=(",", ":")).encode("utf-8")

    def dispatch(self, command):
        async def run_dispatch():
            await self.controller["_dispatch"](wire_command(command))
            while self.controller["_job_queue"]:
                await self.controller["_run_job"](
                    self.controller["_job_queue"].pop(0)
                )
            if self.controller.get("_text_job") is not None:
                await self.controller["_process_text"]()

        asyncio.run(run_dispatch())

    def dispatch_wire(self, command):
        async def run_dispatch():
            await self.controller["_dispatch"](command)
            while self.controller["_job_queue"]:
                await self.controller["_run_job"](
                    self.controller["_job_queue"].pop(0)
                )
            if self.controller.get("_text_job") is not None:
                await self.controller["_process_text"]()

        asyncio.run(run_dispatch())

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
        controller, tunnel, _motor, _motor_pair, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(module_name="__main__", stop_after_sleeps=3)
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertGreaterEqual(loop.sleep_calls.count(10), 3)
        self.assertIn(250, loop.sleep_calls)
        self.assertTrue(callable(tunnel.callback_handler))
        self.assertIn("BWCTRL:boot:entered", output)
        self.assertIn("BWCTRL:boot:runloop-entered", output)
        self.assertIn("BWCTRL:boot:tunnel-callback-registered", output)
        self.assertEqual(controller["_queue"], [])

    def test_entrypoint_does_not_depend_on_module_name(self):
        _controller, tunnel, _motor, _motor_pair, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(
                module_name="brickwright_controller_test", stop_after_sleeps=2
            )
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertGreaterEqual(loop.sleep_calls.count(10), 2)
        self.assertIn(250, loop.sleep_calls)
        self.assertTrue(callable(tunnel.callback_handler))
        self.assertIn("BWCTRL:boot:tunnel-callback-registered", output)

    def test_missing_module_tunnel_is_logged_and_program_stays_alive(self):
        _controller, tunnel, _motor, _motor_pair, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(include_module_tunnel=False)
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls[:3], [1000, 1000, 1000])
        self.assertIn(250, loop.sleep_calls)
        self.assertIsNone(tunnel.callback_handler)
        self.assertIn("BWCTRL:boot:init-error:RuntimeError", output)
        self.assertIn("module_tunnel", output)

    def test_tunnel_callback_failure_is_logged_and_program_stays_alive(self):
        _controller, tunnel, _motor, _motor_pair, _matrix, _sound, _clock, loop, output = (
            fake_hub_environment(
                tunnel_callback_error=RuntimeError("callback registration failed")
            )
        )

        self.assertEqual(loop.run_calls, 1)
        self.assertEqual(loop.sleep_calls[:3], [1000, 1000, 1000])
        self.assertIn(250, loop.sleep_calls)
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
        for name in ("port", "light_matrix", "sound", "motion_sensor", "button", "light"):
            self.assertIn(name, self.controller)
        for name in ("motor_pair", "color_matrix", "distance_sensor", "color_sensor", "force_sensor", "orientation"):
            self.assertIsNotNone(self.controller[name])
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
        self.assertEqual(self.sound.calls, [("beep", 440, 150, 100, None), ("stop",)])

    def test_motor_pair_api_and_all_blocking_motion_completions(self):
        self.dispatch_wire({"i": 1, "c": "P", "q": "A", "r": "B"})
        self.dispatch_wire({"i": 2, "c": "M", "e": 10, "v": 200})
        self.dispatch_wire({"i": 3, "c": "G", "d": 90, "e": 0, "v": 150, "n": "hold"})
        self.dispatch_wire({"i": 4, "c": "T", "t": 100, "e": 5, "v": 150})
        self.dispatch_wire({"i": 5, "c": "K", "j": 100, "k": -100})
        self.dispatch_wire({"i": 6, "c": "L", "d": 180, "j": 100, "k": 90})
        self.dispatch_wire({"i": 7, "c": "Y", "t": 100, "j": 100, "k": 90})
        self.dispatch_wire({"i": 8, "c": "Z", "n": "brake"})
        self.assertEqual(
            [call[0] for call in self.motor_pair.calls],
            ["pair", "move", "move_for_degrees", "move_for_time", "move_tank",
             "move_tank_for_degrees", "move_tank_for_time", "stop"],
        )
        self.assertIn(("move_for_degrees", 0, 90, 0, 150, 2), self.motor_pair.calls)
        successful_states = [
            event["result"]["state"]
            for event in self.tunnel.events
            if event.get("ok") and isinstance(event.get("result"), dict)
        ]
        self.assertEqual(
            successful_states,
            ["configured", "started", "started", "completed", "started",
             "completed", "started", "started", "completed", "started",
             "completed", "stopped"],
        )

    def test_lights_color_matrix_distance_lights_and_yaw_use_public_apis(self):
        self.dispatch_wire({"i": 1, "c": "I", "g": 67})
        self.dispatch_wire({"i": 2, "c": "O", "o": "right"})
        self.dispatch_wire({"i": 3, "c": "H", "n": 9})
        pixels = [[9, 10]] * 9
        self.dispatch_wire({"i": 4, "c": "3", "p": "A", "z": pixels})
        self.dispatch_wire({"i": 5, "c": "4", "p": "A", "x": 1, "y": 2, "n": 5})
        self.dispatch_wire({"i": 6, "c": "5", "p": "A"})
        self.dispatch_wire({"i": 7, "c": "6", "p": "B", "z": [0, 25, 50, 100]})
        self.dispatch_wire({"i": 8, "c": "N", "a": 450})
        self.assertIn(("show_image", 67), self.matrix.calls)
        self.assertIn(("set_orientation", 1), self.matrix.calls)
        self.assertEqual(self.controller["light"].calls, [("color", 0, 9)])
        self.assertEqual(
            self.controller["color_matrix"].calls[0],
            ("show", self.controller["PORTS"]["A"], [(9, 10)] * 9),
        )
        self.assertIn(
            ("clear", self.controller["PORTS"]["A"]),
            self.controller["color_matrix"].calls,
        )
        self.assertEqual(
            self.controller["distance_sensor"].calls,
            [("show", self.controller["PORTS"]["B"], [0, 25, 50, 100])],
        )
        self.assertEqual(self.controller["motion_sensor"].calls, [("reset_yaw", 450)])

    def test_sensor_snapshot_contains_filtered_imu_buttons_temperature_and_reflection(self):
        self.dispatch_wire({"i": 1, "c": "R", "z": ["C"]})
        self.assertEqual(self.tunnel.events[-1]["result"]["state"], "configured")
        self.dispatch_wire({"i": 2, "c": "R"})
        snapshot = self.tunnel.events[-1]["result"]
        self.assertEqual(snapshot["angles"], [10, 20, 30])
        self.assertEqual(snapshot["gyro_filtered"], [4, 5, 6])
        self.assertEqual(snapshot["acceleration_filtered"], [400, 500, 600])
        self.assertEqual(snapshot["gesture"], "shake")
        self.assertEqual(snapshot["up_face"], "top")
        self.assertEqual(snapshot["buttons"], {"left": True, "right": False})
        self.assertEqual(snapshot["hub_temperature"], 237)
        self.assertEqual(snapshot["ports"]["C"]["reflection"], 42)

    def test_sound_wave_volume_and_restricted_log_files(self):
        self.dispatch_wire({"i": 1, "c": "W", "f": 660, "t": 120, "n": 75, "w": "square"})
        self.dispatch_wire({"i": 2, "c": "V", "n": 60})
        self.assertEqual(
            self.sound.calls[:2],
            [("beep", 660, 120, 75, self.sound.WAVEFORM_SQUARE), ("volume", 60)],
        )
        with tempfile.TemporaryDirectory() as directory:
            previous = os.getcwd()
            try:
                os.chdir(directory)
                self.dispatch_wire({"i": 3, "c": "F", "k": "write", "n": "session", "z": "héllo"})
                self.dispatch_wire({"i": 4, "c": "F", "k": "read", "n": "session", "g": 0, "u": 256})
                self.assertEqual(self.tunnel.events[-1]["result"]["text"], "héllo")
                self.dispatch_wire({"i": 5, "c": "F", "k": "list", "n": "logs"})
                self.assertEqual(self.tunnel.events[-1]["result"]["files"], ["brickwright-log-session"])
                self.dispatch_wire({"i": 6, "c": "F", "k": "delete", "n": "session"})
                self.assertFalse(os.path.exists("brickwright-log-session"))
            finally:
                os.chdir(previous)

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

    def test_matrix_text_is_acknowledged_after_display_and_validated(self):
        self.controller["_initialize"]()
        self.tunnel.callback_handler(memoryview(b'{"i":1,"c":"w","t":"Hello"}'))
        asyncio.run(self.controller["_process_next"]())
        self.assertEqual(self.tunnel.events, [])
        asyncio.run(self.controller["_process_text"]())
        self.assertEqual(self.matrix.calls[-1], ("write", "Hello"))
        self.assertEqual(self.tunnel.events[-1]["i"], 1)
        self.assertTrue(self.tunnel.events[-1]["ok"])
        self.dispatch({"cmd": "matrix.text", "text": "", "request_id": 2})
        asyncio.run(self.controller["_process_text"]())
        self.assertEqual(self.matrix.calls[-1], ("clear",))
        for bad in (42, "x" * 33):
            self.dispatch({"cmd": "matrix.text", "text": bad, "request_id": 3})
            self.assertEqual(self.tunnel.events[-1]["error"], "execution_failed")

    def test_heartbeat_is_processed_during_long_text_display(self):
        async def scenario():
            started = asyncio.Event()
            finish = asyncio.Event()
            async def delayed_write(text):
                started.set()
                await finish.wait()
            self.matrix.write = delayed_write
            self.controller["_initialize"]()
            self.tunnel.callback_handler(b'{"i":1,"c":"w","t":"Hello"}')
            await self.controller["_process_next"]()
            task = asyncio.create_task(self.controller["_process_text"]())
            await started.wait()
            self.clock.now = 5000
            self.tunnel.callback_handler(b'{"c":"p"}')
            await self.controller["_process_next"]()
            self.assertEqual(self.tunnel.events[-1]["c"], "o")
            self.assertFalse(await self.controller["_check_watchdog"]())
            self.assertFalse(
                any(
                    event.get("i") == 1
                    and event.get("result", {}).get("state") == "displayed"
                    for event in self.tunnel.events
                )
            )
            finish.set()
            await task
            self.assertTrue(self.tunnel.events[-1]["ok"])
            self.assertEqual(self.tunnel.events[-1]["i"], 1)
        asyncio.run(scenario())

    def test_ranges_and_ports_are_validated(self):
        self.dispatch({"cmd": "motor.run", "port": "__import__", "velocity": 100, "request_id": "p"})
        self.dispatch({"cmd": "matrix.pixel", "x": 9, "y": 0, "brightness": 100, "request_id": "x"})
        self.assertFalse(self.tunnel.events[-2]["ok"])
        self.assertFalse(self.tunnel.events[-1]["ok"])
        self.assertEqual(self.motor.calls, [])
        self.assertEqual(self.matrix.calls, [])

    def test_disconnect_watchdog_stops_motors_and_sound(self):
        self.controller["_active_motor_ports"].update(("A", "F"))
        self.controller["_active"] = True
        self.controller["_last_heartbeat"] = 1000
        self.clock.now = 4001
        stopped = asyncio.run(self.controller["_check_watchdog"]())
        self.assertTrue(stopped)
        self.assertEqual(len(self.motor.calls), 2)
        self.assertTrue(all(call[0] == "stop" for call in self.motor.calls))
        self.assertEqual(self.sound.calls, [("stop",)])
        self.assertFalse(self.controller["_active"])

    def test_tunnel_receive_accepts_text_and_bytes_like_values(self):
        self.controller["_initialize"]()
        receive = self.tunnel.callback_handler
        raw = b'{"i":42,"c":"h"}'
        for payload in (raw.decode("utf-8"), raw, bytearray(raw), memoryview(raw)):
            with self.subTest(payload_type=type(payload).__name__):
                receive(payload)
                asyncio.run(self.controller["_process_next"]())
                while self.controller["_job_queue"]:
                    asyncio.run(
                        self.controller["_run_job"](
                            self.controller["_job_queue"].pop(0)
                        )
                    )
                self.assertEqual(self.tunnel.events[-1]["i"], 42)
                self.assertTrue(self.tunnel.events[-1]["ok"])
                self.assertEqual(self.tunnel.events[-1]["result"], "bw-spike-1")

    def test_tunnel_receive_queue_is_ordered_and_bounded(self):
        self.controller["_initialize"]()
        receive = self.tunnel.callback_handler
        receive(self.message({"cmd": "motor.run", "port": "A", "velocity": 100, "request_id": "1"}))
        receive(self.message({"cmd": "motor.stop", "port": "A", "request_id": "2"}))
        asyncio.run(self.controller["_process_next"]())
        if self.controller["_job_queue"]:
            asyncio.run(self.controller["_run_job"](self.controller["_job_queue"].pop(0)))
        asyncio.run(self.controller["_process_next"]())
        self.assertEqual([call[0] for call in self.motor.calls], ["run", "stop"])

        for _ in range(self.controller["MAX_QUEUE"]):
            receive(self.message({"cmd": "sound.stop"}))
        receive(self.message({"cmd": "sound.stop"}))
        self.assertEqual(self.tunnel.events[-1]["error"], "queue_full")
        self.assertEqual(len(self.controller["_queue"]), self.controller["MAX_QUEUE"])

    def test_emergency_stop_bypasses_and_clears_the_command_queue(self):
        self.controller["_initialize"]()
        receive = self.tunnel.callback_handler
        self.controller["_queue"].append(
            {"c": "r", "i": "queued-motor", "p": "A", "v": 100}
        )
        self.controller["_queue"].append(
            {"c": "b", "i": "queued-sound", "f": 440, "t": 1000}
        )
        self.controller["_active"] = True
        self.controller["_active_motor_ports"].add("A")
        self.controller["_last_heartbeat"] = 1000

        receive(self.message({"cmd": "controller.stop_all", "request_id": 9}))

        self.assertEqual(self.controller["_queue"], [])
        self.assertEqual(len(self.motor.calls), 1)
        self.assertTrue(all(call[0] == "stop" for call in self.motor.calls))
        self.assertEqual(self.sound.calls, [("stop",)])
        self.assertFalse(self.controller["_active"])
        self.assertIsNone(self.controller["_last_heartbeat"])
        self.assertEqual(
            self.tunnel.events[-1],
            {"i": 9, "ok": True, "result": {"state": "stopped"}},
        )

        receive(self.message({"cmd": "motor.run", "port": "A", "velocity": 100, "request_id": "late"}))
        self.assertEqual(self.controller["_queue"], [])
        self.assertEqual(self.tunnel.events[-1]["i"], "late")
        self.assertEqual(self.tunnel.events[-1]["error"], "controller_stopped")
        self.assertEqual(len(self.motor.calls), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
