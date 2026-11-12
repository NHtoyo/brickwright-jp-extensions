// Name: LEGO SPIKE Prime / Robot Inventor
// ID: spikeprime
// Description: Control a SPIKE Prime or Robot Inventor hub over Scratch Link, Web Bluetooth or a local bridge, on either firmware generation, and transpile blocks to SPIKE Python.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
//
// This replaces five extensions that were one hub reached four ways:
// spikeprimeBTC, spikeprimeBridge (firmware 2.x REPL over Scratch Link BT and
// a local WebSocket relay) and spikeprimeble, legospikeprimeBLE (the SPIKE 3
// binary protocol on GATT FD02 over Web Bluetooth and Scratch Link BLE).
// Between them: 236 blocks, of which exactly one appeared in all five.
//
// The transport is detected rather than configured, and a route that finds
// nothing advances to the next; the firmware is then confirmed by the hub
// itself, from the SPIKE 3 InfoResponse or a 2.x hub.info() line. SPIKE Prime
// (45678) and Robot Inventor (51515) are the same hardware and are told apart
// by the variant the hub reports, never by the advertised Bluetooth name.
(function (Scratch) {
  "use strict";

  if (!Scratch.extensions.unsandboxed) {
    throw new Error("SPIKE Prime BTC extension must run unsandboxed");
  }

  console.log("🤖 [SPIKE] Extension loading with transpilation support...");

  const ArgumentType = Scratch.ArgumentType;
  const BlockType = Scratch.BlockType;
  const Cast = Scratch.Cast;

  // ============================================================================
  // YES/NO QUESTIONS
  // ----------------------------------------------------------------------------
  // The browser's confirm() blocks and answers true or false, but a host may
  // replace it. In BrickWright Lite's desktop and iOS app the dialog plugin
  // turns window.confirm into an async function, so confirm(...) returns a
  // Promise, which is always truthy: "if (confirm(...))" went ahead without
  // asking. A host that can ask and wait provides
  //     Scratch.BWConfirm(message) -> Promise<boolean>
  // (the same pattern as Scratch.BWValues); anywhere else the browser's own
  // confirm is used. Either way the answer is awaited, and only exactly true
  // is a yes: a Promise, a rejection or a missing dialog is a no.
  // ============================================================================
  const askYesNo = (message) => {
    const text = String(message);
    const host =
      typeof Scratch !== "undefined" &&
      Scratch &&
      typeof Scratch.BWConfirm === "function"
        ? Scratch.BWConfirm
        : null;
    let answer;
    try {
      if (host) answer = host(text);
      else if (typeof confirm === "function") answer = confirm(text);
      else answer = false;
    } catch (error) {
      answer = false;
    }
    return Promise.resolve(answer).then(
      (value) => value === true,
      () => false
    );
  };

  // This diagnostic-only block is deliberately absent from ordinary builds.
  // A developer must opt in by opening the editor with
  // ?spikePrimeDiagnostics=1 before loading the extension.
  const isStartupProbeDeveloperMode = () => {
    try {
      return /(?:^|[?&])spikePrimeDiagnostics=1(?:&|$)/.test(
        window.location.search
      );
    } catch (error) {
      return false;
    }
  };

  // ============================================================================
  // TRANSLATIONS
  // ============================================================================
  const translations = {
    en: {
      extensionName: "LEGO SPIKE Prime",
      // Connection & modes — the blocks the four folded-in extensions had
      connectionLabel: "🔌 Connection",
      connectHub: "connect to hub",
      connectHubAt: "connect to bridge at [URL]",
      disconnectHub: "disconnect",
      isConnected: "connected?",
      getHubType: "hub type",
      getFirmwareVersion: "hub firmware version",
      getConnectionMode: "connection mode",
      getCommunicationDiagnostics: "communication diagnostics (JSON)",
      getCommunicationDiagnosticsSummary: "communication diagnostics (text)",
      openCommunicationDiagnosticsLog: "open communication diagnostics log",
      diagnosticsDialogTitle: "SPIKE Prime communication diagnostics",
      diagnosticsCopyJson: "Copy full JSON",
      diagnosticsSaveJson: "Save JSON file",
      diagnosticsJsonCopied: "Full JSON copied to the clipboard.",
      diagnosticsManualCopy:
        "Clipboard access is unavailable. The full log is selected; press Ctrl+C (or ⌘+C) to copy.",
      diagnosticsJsonSaved: "JSON file download started.",
      diagnosticsJsonSaveFailed: "Could not save the JSON file.",
      diagnosticsDialogUnavailable:
        "The diagnostics dialog is unavailable in this environment.",
      startupProbeBlock: "run SPIKE startup probe [PROBE] in slot [SLOT]",
      startupProbe00Label: "Probe 00 — runloop only",
      startupProbe01Label: "Probe 01 — public API imports",
      startupProbe02Label: "Probe 02 — module_tunnel callback",
      startupProbeConfirmOverwrite:
        "This will clear and replace hub slot {0} with {1} ({2}), file {3}. Brickwright cannot inspect or restore the program currently in that slot. Check in the SPIKE app that this slot is safe to overwrite. The probe sends no motor, LED, or sound commands. Brickwright waits up to 7 seconds for a start notification. Probe 00 normally ends after its 2-second wait; probes that are still running after observation receive a stop request. If start is not reported, the result is indeterminate and Brickwright attempts a stop request to this slot. Continue?",
      startupProbeInvalid: "Unknown startup probe or invalid slot.",
      startupProbeFinished:
        "Probe {0}: {1}. Open Communication diagnostics (JSON) for transfer responses, notifications, elapsed time, and console output.",
      "diag.startupProbeOutcome.success": "success",
      "diag.startupProbeOutcome.failure": "failure",
      "diag.startupProbeOutcome.indeterminate": "indeterminate",
      "diag.startupProbeOutcome.running": "running",
      startupProbeExecutionFailed: "Startup probe failed: {0}",
      installHubController:
        "install / start Brickwright controller in slot [SLOT]",
      checkHubController: "check Brickwright controller response",
      controllerConfirmOverwrite:
        "This will clear and replace the program in hub slot {0}. Back it up first. Continue?",
      controllerReady:
        "Brickwright SPIKE controller is running and acknowledged.",
      controllerFailed: "Could not start the Brickwright SPIKE controller: {0}",
      controllerInvalidSlot: "Program slot must be between 0 and 19.",
      operationFailed: "SPIKE operation failed: {0}",
      controllerNotReady:
        "Install and start the Brickwright SPIKE controller first.",
      controllerTimeout:
        "The hub controller did not acknowledge the command in time.",
      controllerStartNotificationTimeout:
        "The hub accepted ProgramFlowRequest but did not report that the program started.",
      controllerStoppedBeforeReady:
        "The Brickwright controller stopped before it completed its startup handshake.",
      hubDisconnectedBeforeControllerStart:
        "The hub disconnected before the controller start was verified ({0}).",
      hubDisconnectedAfterProgramStart:
        "The hub disconnected after the start notification and before the controller replied ({0}).",
      hubDisconnectedDuringControllerCommand:
        "The hub disconnected during a controller command ({0}).",
      controllerCommandFailed: "The hub could not execute the command",
      controllerUnsupported:
        "This SPIKE operation is not supported by the controller",
      controllerUnsupportedStopAction:
        "This motor stop action has not been verified on SPIKE 3.x",
      pythonExecutionUnsupported:
        "Raw Python is not executed by TunnelMessage. Use a supported SPIKE block or upload a Python program explicitly.",
      "diag.controller": "Hub controller",
      "diag.controllerVersion": "Controller version",
      "diag.controllerStatus.not-installed": "not installed",
      "diag.controllerStatus.installing": "installing",
      "diag.controllerStatus.starting": "starting",
      "diag.controllerStatus.ready": "ready and responding",
      "diag.controllerStatus.timeout": "response timed out",
      "diag.controllerStatus.error": "error",
      "diag.controllerStatus.disconnected": "disconnected",
      "diag.controllerStatus.not-verified": "not verified",
      "diag.controllerStatus.checking": "checking",
      "diag.controllerStatus.startup-error": "program stopped during startup",
      "diag.controllerStatus.stopped": "program stopped",
      "diag.controllerOutcome.in-progress": "in progress",
      "diag.controllerOutcome.interrupted": "interrupted",
      "diag.controllerOutcome.startup-error": "startup error",
      "diag.controllerOutcome.not-verified": "not verified",
      "diag.controllerOutcome.ready": "verified ready",
      "diag.controllerOutcome.failed": "failed",
      "diag.writeStatus.pending": "pending",
      "diag.writeStatus.write-completed": "write completed",
      "diag.writeStatus.failed": "failed",
      "diag.controllerStage.waiting-info-response":
        "waiting for hub information",
      "diag.controllerStage.info-response-received": "hub information received",
      "diag.controllerStage.slot-clear-response-received":
        "slot clear response received",
      "diag.controllerStage.file-upload-accepted": "file upload accepted",
      "diag.controllerStage.transfer-chunk-acknowledged":
        "program data chunk acknowledged",
      "diag.controllerStage.program-upload-complete":
        "program transfer complete",
      "diag.controllerStage.program-flow-request-sent": "start request sent",
      "diag.controllerStage.program-flow-response-accepted":
        "start request accepted",
      "diag.controllerStage.program-start-notified":
        "program start notification received",
      "diag.controllerStage.controller-hello-acknowledged":
        "controller version response received",
      "diag.controllerStage.start-notification-timeout":
        "start notification timed out",
      "diag.controllerStage.program-stopped-before-handshake":
        "program stopped before controller response",
      "diag.lastControllerStage": "Controller installation stage",
      "diag.lastSuccessfulControllerStage": "Last successful stage",
      "diag.lastDisconnectOrigin": "Last disconnect origin",
      "diag.lastWrite": "Last BLE write",
      "diag.lastConsoleOutput": "Recent hub console output",
      "diag.recentEvents": "Recent communication events",
      "diag.lastWriteError": "Last BLE write error and stack",
      "diag.disconnectOrigin.gattserverdisconnected": "GATT disconnect event",
      "diag.disconnectOrigin.ble-write-exception": "BLE write exception",
      "diag.disconnectOrigin.write-precondition-failure":
        "BLE write precondition",
      "diag.disconnectOrigin.user-requested": "user requested",
      "diag.disconnectOrigin.transport-reset": "transport reset",
      "diag.connection": "Bluetooth connection",
      "diag.connected": "connected",
      "diag.disconnected": "not connected",
      "diag.firmware": "Hub OS version",
      "diag.unavailable": "not received",
      "diag.notification": "Sensor notification request",
      "diag.notification.not-requested": "not requested",
      "diag.notification.pending": "waiting for response",
      "diag.notification.acknowledged": "acknowledged",
      "diag.notification.not-acknowledged": "rejected",
      "diag.notification.timeout": "timed out",
      "diag.notification.write-error": "write failed",
      "diag.notification.not-connected": "not connected",
      "diag.notification.disconnected": "disconnected",
      "diag.notification.unknown-response-status": "unknown response",
      "diag.notification.malformed-response": "malformed response",
      "diag.notification.superseded": "superseded",
      "diag.notApplicable": "not available for this protocol",
      "diag.imuCount": "IMU notifications",
      "diag.lastImu": "Last IMU notification",
      "diag.angles": "Angles",
      "diag.pitch": "Pitch",
      "diag.roll": "Roll",
      "diag.yaw": "Yaw",
      "diag.motorPorts": "Motor ports seen in notifications",
      "diag.motorPosition": "relative position",
      "diag.motorAbsolutePosition": "absolute position",
      "diag.motorSpeed": "speed value",
      "diag.noMotorPorts": "no motor record received",
      "diag.cobsErrors": "COBS decode errors",
      "diag.unsupportedRecords": "Unsupported records",
      "diag.lastError": "Communication error summary",
      "diag.technicalDetail": "Technical detail",
      "diag.error.notAcknowledged":
        "The hub rejected the sensor notification request. Check firmware support and the selected transport.",
      "diag.error.timeout":
        "The hub did not respond to the sensor notification request in time.",
      "diag.error.disconnected":
        "The connection to the hub was lost while waiting for a response.",
      "diag.error.notConnected": "The SPIKE hub is not connected.",
      "diag.error.unknownResponse":
        "The hub returned an unrecognized response status ({0}).",
      "diag.error.cobs": "A Bluetooth frame could not be decoded ({0}).",
      "diag.error.unsupportedRecord":
        "The hub sent a notification record this extension does not support ({0}).",
      "diag.error.infoResponse":
        "The firmware information response from the hub was incomplete.",
      "diag.error.notificationHeader":
        "The sensor notification header from the hub was incomplete.",
      "diag.error.imuRecord": "The IMU data from the hub was incomplete.",
      "diag.error.motorRecord": "The motor data from the hub was incomplete.",
      "diag.error.otherRecord":
        "The {0} sensor data from the hub was incomplete.",
      "diag.error.payloadSize":
        "The sensor notification length did not match its declared size (expected {0} bytes, received {1}).",
      "diag.error.emptyMessage": "The hub sent an empty Bluetooth message.",
      "diag.error.bluetoothUnavailable":
        "Web Bluetooth is unavailable in this browser.",
      "diag.error.other":
        "A communication error occurred. See the technical detail below.",
      "diag.none": "none",
      setConnectionMode: "set connection mode to [MODE]",
      enableStreamingMode: "enable streaming mode",
      disableStreamingMode: "disable streaming mode",
      "mode.auto": "auto-detect",
      "mode.scratchlinkBle": "Scratch Link (BLE)",
      "mode.scratchlinkBt": "Scratch Link (Bluetooth Classic)",
      "mode.webBle": "Web Bluetooth",
      "mode.bridge": "local bridge",
      // Blocks carried over from the BLE extensions
      startMotor: "start motor [PORT] at [SPEED]%",
      stopMotor: "stop motor [PORT] with [ACTION]",
      motorPairMove: "start steering [STEERING] speed [SPEED]%",
      displayShowImage: "show built-in image [IMAGE]",
      setLightMatrixPixel:
        "set 3x3 light [PORT] pixel x:[X] y:[Y] brightness [BRIGHTNESS]%",
      getFaceUp: "hub face up",
      getDistanceIn: "[PORT] distance in [UNIT]",
      // Transpilation Section
      transpilationLabel: "📝 Code Generation",
      transpileProject: "transpile project to SPIKE Python",
      showCode: "show generated code",
      downloadCode: "download as .py file",
      uploadToHub: "upload code to hub via Bluetooth",
      getTranspiledCode: "transpiled code",
      // File Management Section
      fileManagementLabel: "📁 Hub File Management",
      uploadScriptToHub: "upload script to hub as [NAME]",
      runScriptOnHub: "run script [NAME] on hub",
      renameScriptOnHub: "rename hub script [OLD] to [NEW]",
      deleteScriptOnHub: "delete script [NAME] from hub",
      listScriptsOnHub: "list all scripts on hub",
      stopRunningScript: "stop currently running script",
      // File Management - Default Values
      scriptName: "my_program.py",
      oldScriptName: "old.py",
      newScriptName: "new.py",
      // Movement
      setMovementMotors: "set movement motors [PORT_A] and [PORT_B]",
      moveForward: "move [DIRECTION] for [VALUE] [UNIT]",
      steer: "start steering [STEERING]",
      startTank: "start tank drive left [LEFT_SPEED] right [RIGHT_SPEED]",
      setMovementSpeed: "set movement speed to [SPEED]%",
      stopMovement: "stop movement",
      // Motors
      motorRunFor: "[PORT] run [DIRECTION] for [VALUE] [UNIT]",
      motorRunToPosition: "[PORT] run to position [POSITION] degrees",
      motorStart: "[PORT] start motor [DIRECTION]",
      motorStop: "[PORT] stop motor",
      motorSetSpeed: "[PORT] set speed to [SPEED] %",
      motorStartPower: "[PORT] start motor at [POWER] % power",
      motorSetStopAction: "[PORT] set stop action to [ACTION]",
      getPosition: "[PORT] position",
      getRelativePosition: "[PORT] relative position",
      getAbsolutePosition: "[PORT] absolute position",
      getSpeed: "[PORT] speed (deg/s)",
      resetMotorPosition: "reset [PORT] motor position to [POSITION]",
      // Display
      displayText: "write [TEXT]",
      displayTextUnsupported:
        "Text display is unavailable on SPIKE 3.x. No unverified Python command was sent.",
      displayImage: "turn on [MATRIX]",
      displayPattern: "display pattern [PATTERN]",
      displayClear: "turn off pixels",
      setPixel: "set pixel [X] [Y] to [BRIGHTNESS] %",
      rotateDisplay: "rotate display [ANGLE] degrees",
      setCenterButtonColor: "set center button to [COLOR]",
      // IMU
      getAngle: "[AXIS] angle",
      getGyroRate: "gyro rate [AXIS] (deg/s)",
      getFilteredGyroRate: "filtered gyro rate [AXIS] (deg/s)",
      getAcceleration: "acceleration [AXIS] (milli-g)",
      getFilteredAcceleration: "filtered acceleration [AXIS] (milli-g)",
      resetYaw: "reset yaw angle",
      presetYaw: "preset yaw to [ANGLE] degrees",
      // 3x3 Matrix
      setMatrix3x3ColorGrid:
        "set [PORT] 3x3 colors: [P1][P2][P3] [P4][P5][P6] [P7][P8][P9]",
      setMatrix3x3Custom: "set [PORT] 3x3 custom pattern [PATTERN]",
      setMatrix3x3SolidColor:
        "set [PORT] 3x3 matrix all [COLOR] brightness [BRIGHTNESS]",
      clearMatrix3x3: "clear [PORT] 3x3 matrix",
      // Gestures
      whenGesture: "when hub [GESTURE]",
      isGesture: "hub [GESTURE]?",
      getOrientation: "orientation",
      // Sound
      playHubSound: "play hub sound [SOUND]",
      playBeep: "beep [FREQUENCY] Hz for [DURATION] ms",
      playNote: "play note [NOTE] for [SECS] seconds",
      playWaveBeep: "beep [WAVEFORM] [FREQUENCY] Hz for [DURATION] ms",
      setVolume: "set volume to [VOLUME]%",
      stopSound: "stop all sounds",
      // Status
      getBatteryLevel: "battery level %",
      getBatteryTemperature: "battery temperature",
      getHubTemperature: "hub temperature",
      getHubCurrent: "hub current (mA)",
      getHubVoltage: "hub voltage (mV)",
      // Timer
      getTimer: "timer",
      resetTimer: "reset timer",
      // Sensors
      getDistance: "[PORT] distance",
      setDistanceLights: "set [PORT] distance lights [TL] [TR] [BL] [BR]",
      getColor: "[PORT] color",
      getReflection: "[PORT] reflection",
      getAmbientLight: "[PORT] ambient light",
      getColorRGB: "[PORT] raw [CHANNEL]",
      getForce: "[PORT] force",
      isForceSensorPressed: "[PORT] force sensor pressed?",
      whenColor: "when [PORT] sees [COLOR]",
      isColor: "[PORT] sees [COLOR]?",
      whenForceSensor: "when [PORT] is [STATE]",
      // Buttons
      isButtonPressed: "[BUTTON] button pressed?",
      whenButtonPressed: "when [BUTTON] button pressed",
      // File System
      writeLogFile: "append [TEXT] to log file [FILENAME]",
      readLogFile: "read log file [FILENAME]",
      deleteLogFile: "delete file [FILENAME]",
      listFiles: "list files",
      // Python
      runReplCommand: "run Python REPL: [CODE]",
      getReplOutput: "REPL output",
      clearReplOutput: "clear REPL output",
      getReplHistory: "REPL command [INDEX]",
      runPythonCommand: "run Python: [CODE]",
      runHubCommand: "run hub command: [CODE]",
      exitScript: "exit Python script",
      // Messages
      codeGenerated:
        "Code generated! Use 'show code' or 'download code' to view.",
      noCodeGenerated: "No code generated yet!",
      generateFirst: "Generate code first!",
      notConnected: "Not connected to SPIKE Prime hub!",
      uploadFailed: "Upload failed",
      uploadSuccess: "Uploaded successfully!",
      uploadScriptSuccess:
        'Uploaded {0} to the hub!\n\nUse the "run script" block to execute it.',
      uploadScriptFailed: "Upload failed: {0}",
      runScriptFailed: "Failed to run script: {0}",
      renameScriptSuccess: "Renamed {0} to {1}.",
      renameScriptFailed: "Rename failed: {0}",
      deleteScriptSuccess: "Deleted {0}.",
      deleteScriptFailed: "Delete failed: {0}",
      checkReplOutput: "Check the REPL output block.",
      downloaded: "Downloaded",
      generatedCode: "Generated SPIKE Python Code",
      close: "Close",
      uploadInstructions:
        "To upload to SPIKE Prime:\n1. Save project as .llsp file\n2. Open in SPIKE Prime app\n3. Upload to hub\n\nOr use Bluetooth file transfer if available.",
      confirmDelete: "Delete {0} from hub?",
    },
    ja: {
      extensionName: "LEGO SPIKE Prime",
      connectionLabel: "🔌 接続",
      connectHub: "ハブに接続",
      connectHubAt: "ブリッジに接続 [URL]",
      disconnectHub: "切断",
      isConnected: "接続中？",
      getHubType: "ハブの種類",
      getFirmwareVersion: "ハブのファームウェアバージョン",
      getConnectionMode: "接続モード",
      getCommunicationDiagnostics: "通信診断（JSON）",
      getCommunicationDiagnosticsSummary: "通信診断（表示用）",
      openCommunicationDiagnosticsLog: "通信診断ログを開く",
      diagnosticsDialogTitle: "SPIKE Prime 通信診断ログ",
      diagnosticsCopyJson: "JSON全文をコピー",
      diagnosticsSaveJson: "JSONファイルを保存",
      diagnosticsJsonCopied: "JSON全文をクリップボードにコピーしました。",
      diagnosticsManualCopy:
        "クリップボードを使えません。ログ全文を選択しました。Ctrl+C（Macでは⌘+C）でコピーしてください。",
      diagnosticsJsonSaved: "JSONファイルのダウンロードを開始しました。",
      diagnosticsJsonSaveFailed: "JSONファイルを保存できませんでした。",
      diagnosticsDialogUnavailable:
        "この環境では通信診断ダイアログを表示できません。",
      startupProbeBlock: "SPIKE起動プローブ[PROBE]をスロット[SLOT]で実行",
      startupProbe00Label: "プローブ00 — runloopのみ",
      startupProbe01Label: "プローブ01 — 公開APIのimport",
      startupProbe02Label: "プローブ02 — module_tunnelの登録",
      startupProbeConfirmOverwrite:
        "ハブのスロット{0}を消去し、{1}（{2}、ファイル名 {3}）で置き換えます。Brickwrightから現在のスロット内容を確認・復元することはできません。SPIKEアプリで上書きしてよいスロットか確認してください。このプローブはモーター・LED・音を操作しません。起動通知を最大7秒待ちます。プローブ00は通常2秒の待機後に終了します。観測後も動作中のプローブには停止要求を送ります。起動通知が届かない場合は判定不能と記録し、指定スロットへ停止要求を試みます。続けますか？",
      startupProbeInvalid: "プローブまたはスロット番号が正しくありません。",
      startupProbeFinished:
        "プローブ{0}の判定: {1}。転送応答・通知・経過時間・コンソール出力は「通信診断（JSON）」で確認できます。",
      "diag.startupProbeOutcome.success": "成功",
      "diag.startupProbeOutcome.failure": "失敗",
      "diag.startupProbeOutcome.indeterminate": "判定不能",
      "diag.startupProbeOutcome.running": "実行中",
      startupProbeExecutionFailed: "起動プローブに失敗しました: {0}",
      installHubController:
        "スロット [SLOT] にBrickwright制御プログラムを転送して起動",
      checkHubController: "Brickwright制御プログラムの応答を確認",
      controllerConfirmOverwrite:
        "ハブのスロット{0}にあるプログラムを消去して置き換えます。先にバックアップしてください。続けますか？",
      controllerReady:
        "Brickwright SPIKE制御プログラムが起動し、応答しました。",
      controllerFailed:
        "Brickwright SPIKE制御プログラムを起動できませんでした: {0}",
      controllerInvalidSlot: "プログラムスロットは0〜19で指定してください。",
      operationFailed: "SPIKEの操作に失敗しました: {0}",
      controllerNotReady:
        "先にBrickwright SPIKE制御プログラムを転送して起動してください。",
      controllerTimeout: "制御プログラムから時間内に応答がありませんでした。",
      controllerStartNotificationTimeout:
        "ProgramFlowRequestは受理されましたが、プログラム起動通知が届きませんでした。",
      controllerStoppedBeforeReady:
        "Brickwright制御プログラムは、起動確認を完了する前に停止しました。",
      hubDisconnectedBeforeControllerStart:
        "制御プログラムの起動確認前にハブとの接続が切れました（{0}）。",
      hubDisconnectedAfterProgramStart:
        "起動通知の後、制御プログラムの応答前にハブとの接続が切れました（{0}）。",
      hubDisconnectedDuringControllerCommand:
        "制御プログラムへの命令中にハブとの接続が切れました（{0}）。",
      controllerCommandFailed: "ハブが命令を実行できませんでした",
      controllerUnsupported: "このSPIKE命令は制御プログラムで未対応です",
      controllerUnsupportedStopAction:
        "SPIKE 3.xでは、このモーター停止方法は未検証です。",
      pythonExecutionUnsupported:
        "TunnelMessageはPythonを実行しません。対応するSPIKEブロックを使うか、Pythonプログラムを明示的に転送してください。",
      "diag.controller": "ハブ制御プログラム",
      "diag.controllerVersion": "制御プログラムのバージョン",
      "diag.controllerStatus.not-installed": "未転送",
      "diag.controllerStatus.installing": "転送中",
      "diag.controllerStatus.starting": "起動中",
      "diag.controllerStatus.ready": "応答あり・動作中",
      "diag.controllerStatus.timeout": "応答タイムアウト",
      "diag.controllerStatus.error": "エラー",
      "diag.controllerStatus.disconnected": "切断済み",
      "diag.controllerStatus.not-verified": "未確認",
      "diag.controllerStatus.checking": "応答確認中",
      "diag.controllerStatus.startup-error": "起動中にプログラムが停止",
      "diag.controllerStatus.stopped": "プログラム停止",
      "diag.controllerOutcome.in-progress": "処理中",
      "diag.controllerOutcome.interrupted": "中断",
      "diag.controllerOutcome.startup-error": "起動エラー",
      "diag.controllerOutcome.not-verified": "未確認",
      "diag.controllerOutcome.ready": "応答確認済み",
      "diag.controllerOutcome.failed": "失敗",
      "diag.writeStatus.pending": "送信中",
      "diag.writeStatus.write-completed": "書き込み完了",
      "diag.writeStatus.failed": "失敗",
      "diag.controllerStage.waiting-info-response": "ハブ情報の応答待ち",
      "diag.controllerStage.info-response-received": "ハブ情報を受信",
      "diag.controllerStage.slot-clear-response-received":
        "スロット消去の応答を受信",
      "diag.controllerStage.file-upload-accepted": "ファイル転送を受理",
      "diag.controllerStage.transfer-chunk-acknowledged":
        "プログラムデータのチャンクに応答",
      "diag.controllerStage.program-upload-complete": "プログラム転送完了",
      "diag.controllerStage.program-flow-request-sent": "起動要求を送信",
      "diag.controllerStage.program-flow-response-accepted": "起動要求を受理",
      "diag.controllerStage.program-start-notified": "プログラム起動通知を受信",
      "diag.controllerStage.controller-hello-acknowledged":
        "制御プログラムの応答を受信",
      "diag.controllerStage.start-notification-timeout":
        "起動通知がタイムアウト",
      "diag.controllerStage.program-stopped-before-handshake":
        "応答前にプログラムが停止",
      "diag.lastControllerStage": "制御プログラムの起動段階",
      "diag.lastSuccessfulControllerStage": "最後に成功した段階",
      "diag.lastDisconnectOrigin": "最後の切断元",
      "diag.lastWrite": "最後のBLE書き込み",
      "diag.lastConsoleOutput": "ハブの直近のコンソール出力",
      "diag.recentEvents": "直近の通信イベント",
      "diag.lastWriteError": "最後のBLE書き込みエラーとスタック",
      "diag.disconnectOrigin.gattserverdisconnected": "GATT切断イベント",
      "diag.disconnectOrigin.ble-write-exception": "BLE書き込み例外",
      "diag.disconnectOrigin.write-precondition-failure":
        "BLE書き込み前提条件エラー",
      "diag.disconnectOrigin.user-requested": "ユーザー操作",
      "diag.disconnectOrigin.transport-reset": "通信経路のリセット",
      "diag.connection": "Bluetooth 接続",
      "diag.connected": "接続中",
      "diag.disconnected": "未接続",
      "diag.firmware": "Hub OS バージョン",
      "diag.unavailable": "未受信",
      "diag.notification": "センサー通知要求",
      "diag.notification.not-requested": "未要求",
      "diag.notification.pending": "応答待ち",
      "diag.notification.acknowledged": "応答あり",
      "diag.notification.not-acknowledged": "拒否",
      "diag.notification.timeout": "タイムアウト",
      "diag.notification.write-error": "送信失敗",
      "diag.notification.not-connected": "未接続",
      "diag.notification.disconnected": "切断済み",
      "diag.notification.unknown-response-status": "不明な応答",
      "diag.notification.malformed-response": "不正な応答",
      "diag.notification.superseded": "新しい要求に置換",
      "diag.notApplicable": "この通信方式では対象外",
      "diag.imuCount": "IMU通知件数",
      "diag.lastImu": "最終IMU通知",
      "diag.angles": "角度",
      "diag.pitch": "Pitch",
      "diag.roll": "Roll",
      "diag.yaw": "Yaw",
      "diag.motorPorts": "通知で検出したモーターポート",
      "diag.motorPosition": "相対位置",
      "diag.motorAbsolutePosition": "絶対位置",
      "diag.motorSpeed": "速度値",
      "diag.noMotorPorts": "モーター通知は未受信",
      "diag.cobsErrors": "COBS解析エラー",
      "diag.unsupportedRecords": "未対応レコード",
      "diag.lastError": "通信エラーの概要",
      "diag.technicalDetail": "技術詳細",
      "diag.error.notAcknowledged":
        "ハブがセンサー通知要求を受け付けませんでした。ファームウェアの対応状況と接続方式を確認してください。",
      "diag.error.timeout":
        "センサー通知要求に対するハブの応答が時間内にありませんでした。",
      "diag.error.disconnected":
        "応答を待っている間にハブとの接続が切れました。",
      "diag.error.notConnected": "SPIKEハブに接続されていません。",
      "diag.error.unknownResponse":
        "ハブから未対応の応答状態（{0}）が返されました。",
      "diag.error.cobs": "Bluetoothフレームを解析できませんでした（{0}）。",
      "diag.error.unsupportedRecord":
        "この拡張機能が未対応の通知レコード（{0}）をハブから受信しました。",
      "diag.error.infoResponse":
        "ハブから受信したファームウェア情報が途中で途切れています。",
      "diag.error.notificationHeader":
        "ハブから受信したセンサー通知のヘッダーが途中で途切れています。",
      "diag.error.imuRecord":
        "ハブから受信したIMUデータが途中で途切れています。",
      "diag.error.motorRecord":
        "ハブから受信したモーターデータが途中で途切れています。",
      "diag.error.otherRecord":
        "ハブから受信した{0}センサーのデータが途中で途切れています。",
      "diag.error.payloadSize":
        "センサー通知の長さが申告されたサイズと一致しません（申告値 {0} バイト、受信値 {1} バイト）。",
      "diag.error.emptyMessage":
        "ハブから空のBluetoothメッセージを受信しました。",
      "diag.error.bluetoothUnavailable":
        "このブラウザーではWeb Bluetoothを利用できません。",
      "diag.error.other":
        "通信エラーが発生しました。詳しい内容は下の技術詳細を確認してください。",
      "diag.none": "なし",
      setConnectionMode: "接続モードを [MODE] にする",
      enableStreamingMode: "センサー通知を有効にする",
      disableStreamingMode: "センサー通知を無効にする",
      "mode.auto": "自動検出",
      "mode.scratchlinkBle": "Scratch Link（BLE）",
      "mode.scratchlinkBt": "Scratch Link（Bluetooth Classic）",
      "mode.webBle": "Web Bluetooth",
      "mode.bridge": "ローカルブリッジ",
      displayText: "ハブに [TEXT] と表示する",
      displayTextUnsupported:
        "SPIKE 3.xでは文字表示を利用できません。未検証のPython命令は送信しませんでした。",
      startMotor: "モーター [PORT] を [SPEED]% の回転速度で動かす",
      stopMotor: "モーター [PORT] を [ACTION] で止める",
      motorPairMove: "ステアリング [STEERING]、速さ [SPEED]% で動かす",
      displayShowImage: "ハブのLEDライトマトリクスに画像 [IMAGE] を表示する",
      setLightMatrixPixel:
        "[PORT] のカラー・ライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする",
      getFaceUp: "ハブの上向き面",
      getDistanceIn: "[PORT] の距離（[UNIT]）",
      transpilationLabel: "📝 コード生成",
      transpileProject: "プロジェクトをSPIKE Pythonコードに変換する",
      showCode: "生成したコードを表示する",
      downloadCode: "Pythonファイル（.py）としてダウンロードする",
      uploadToHub: "Bluetoothでコードをハブに送信する",
      getTranspiledCode: "変換後のコード",
      fileManagementLabel: "📁 ハブ内のファイル",
      uploadScriptToHub: "スクリプトを [NAME] としてハブに保存する",
      runScriptOnHub: "ハブ上のスクリプト [NAME] を実行する",
      renameScriptOnHub: "ハブ上のスクリプト [OLD] の名前を [NEW] に変更する",
      deleteScriptOnHub: "ハブ上のスクリプト [NAME] を削除する",
      listScriptsOnHub: "ハブ上のスクリプト一覧を表示する",
      stopRunningScript: "実行中のスクリプトを停止する",
      scriptName: "my_program.py",
      oldScriptName: "old.py",
      newScriptName: "new.py",
      setMovementMotors: "移動用モーターを [PORT_A] と [PORT_B] に設定する",
      moveForward: "[DIRECTION] に [VALUE] [UNIT] 進む",
      steer: "ステアリング [STEERING] で動かす",
      startTank: "左 [LEFT_SPEED]%、右 [RIGHT_SPEED]% の速さで動かす",
      setMovementSpeed: "移動速度を [SPEED]% に設定する",
      stopMovement: "移動を停止する",
      motorRunFor: "[PORT] のモーターを [DIRECTION] に [VALUE] [UNIT] 動かす",
      motorRunToPosition: "[PORT] のモーターを位置 [POSITION] 度まで動かす",
      motorStart: "[PORT] のモーターを [DIRECTION] に回転させる",
      motorStop: "[PORT] のモーターを止める",
      motorSetSpeed: "[PORT] モーターの回転速度を [SPEED]% に設定する",
      motorStartPower: "[PORT] のモーターを出力 [POWER]% で回転させる",
      motorSetStopAction: "[PORT] モーターの停止方法を [ACTION] にする",
      getPosition: "[PORT] モーターの位置（度）",
      getRelativePosition: "[PORT] モーターの相対位置（度）",
      getAbsolutePosition: "[PORT] モーターの絶対位置（度）",
      getSpeed: "[PORT] モーターの回転速度（度/秒）",
      resetMotorPosition: "[PORT] モーターの位置を [POSITION] 度に設定する",
      displayImage: "ハブのLEDライトマトリクスに [MATRIX] を表示する",
      displayPattern:
        "ハブのLEDライトマトリクスにパターン [PATTERN] を表示する",
      displayClear: "ハブのLEDライトマトリクスを消灯する",
      setPixel:
        "ハブのLEDライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする",
      rotateDisplay: "ハブのLEDライトマトリクスを [ANGLE] 度回転する",
      setCenterButtonColor: "ハブ中央のボタンを [COLOR] に光らせる",
      getAngle: "[AXIS] の角度",
      getGyroRate: "[AXIS] のジャイロ角速度（度/秒）",
      getFilteredGyroRate: "[AXIS] のフィルター済みジャイロ角速度（度/秒）",
      getAcceleration: "[AXIS] の加速度（ミリg）",
      getFilteredAcceleration: "[AXIS] のフィルター済み加速度（ミリg）",
      resetYaw: "Yaw角を0にする",
      presetYaw: "Yaw角を [ANGLE] 度に設定する",
      setMatrix3x3ColorGrid:
        "[PORT] のカラー・ライトマトリクスを色設定する：[P1][P2][P3] [P4][P5][P6] [P7][P8][P9]",
      setMatrix3x3Custom:
        "[PORT] のカラー・ライトマトリクスにパターン [PATTERN] を表示する",
      setMatrix3x3SolidColor:
        "[PORT] のカラー・ライトマトリクスを [COLOR]、明るさ [BRIGHTNESS] にする",
      clearMatrix3x3: "[PORT] のカラー・ライトマトリクスを消灯する",
      whenGesture: "ハブが [GESTURE] したとき",
      isGesture: "ハブは [GESTURE] していますか？",
      getOrientation: "ハブの向き",
      playHubSound: "ハブのサウンド [SOUND] を再生する",
      playBeep: "[FREQUENCY] Hz の音を [DURATION] ms 鳴らす",
      playNote: "音符 [NOTE] を [SECS] 秒鳴らす",
      playWaveBeep:
        "[WAVEFORM] 波形の [FREQUENCY] Hz の音を [DURATION] ms 鳴らす",
      setVolume: "音量を [VOLUME]% に設定する",
      stopSound: "すべての音を止める",
      getBatteryLevel: "バッテリー残量（%）",
      getBatteryTemperature: "バッテリーの温度",
      getHubTemperature: "ハブの温度",
      getHubCurrent: "ハブの電流（mA）",
      getHubVoltage: "ハブの電圧（mV）",
      getTimer: "タイマーの値",
      resetTimer: "タイマーをリセットする",
      getDistance: "[PORT] の距離",
      setDistanceLights:
        "[PORT] の距離センサーのライトを [TL] [TR] [BL] [BR] に設定する",
      getColor: "[PORT] の色",
      getReflection: "[PORT] の反射光",
      getAmbientLight: "[PORT] の周囲の明るさ",
      getColorRGB: "[PORT] の生の [CHANNEL] 値",
      getForce: "[PORT] のフォースセンサーの値",
      isForceSensorPressed: "[PORT] のフォースセンサーは押されていますか？",
      whenColor: "[PORT] が [COLOR] を検出したとき",
      isColor: "[PORT] は [COLOR] を検出していますか？",
      whenForceSensor: "[PORT] が [STATE] のとき",
      isButtonPressed: "[BUTTON] ボタンは押されていますか？",
      whenButtonPressed: "[BUTTON] ボタンが押されたとき",
      writeLogFile: "[TEXT] をログファイル [FILENAME] に追加する",
      readLogFile: "ログファイル [FILENAME] を読み込む",
      deleteLogFile: "ファイル [FILENAME] を削除する",
      listFiles: "ファイル一覧を表示する",
      runReplCommand: "Python REPLで実行：[CODE]",
      getReplOutput: "REPLの出力",
      clearReplOutput: "REPLの出力を消去する",
      getReplHistory: "REPLの [INDEX] 番目のコマンド",
      runPythonCommand: "Pythonを実行：[CODE]",
      runHubCommand: "ハブのコマンドを実行：[CODE]",
      exitScript: "Pythonスクリプトを終了する",
      noCodeGenerated: "コードはまだ生成されていません。",
      generateFirst: "先にコードを生成してください。",
      notConnected: "SPIKE Primeハブに接続されていません。",
      uploadFailed: "送信に失敗しました。",
      uploadSuccess: "送信しました。",
      codeGenerated:
        "コードを生成しました。「生成したコードを表示する」または「Pythonファイルとしてダウンロードする」から確認できます。",
      uploadScriptSuccess:
        "{0} をハブに送信しました。\n\n実行するには「スクリプトを実行」ブロックを使ってください。",
      uploadScriptFailed: "送信に失敗しました：{0}",
      runScriptFailed: "スクリプトを実行できませんでした：{0}",
      renameScriptSuccess: "ファイル名を {0} から {1} に変更しました。",
      renameScriptFailed: "名前の変更に失敗しました：{0}",
      deleteScriptSuccess: "{0} を削除しました。",
      deleteScriptFailed: "削除に失敗しました：{0}",
      checkReplOutput: "REPLの出力ブロックを確認してください。",
      downloaded: "ダウンロードしました。",
      generatedCode: "生成したSPIKE Pythonコード",
      close: "閉じる",
      uploadInstructions:
        "SPIKE Primeにコードを転送する方法：\n1. プロジェクトを .llsp ファイルとして保存します。\n2. SPIKEアプリでファイルを開きます。\n3. ハブにプログラムを転送します。\n\n利用できる場合は、Bluetoothでファイルを転送する方法もあります。",
      confirmDelete: "ハブから {0} を削除しますか？",
    },
    de: {
      // Verbindung & Modi
      connectionLabel: "🔌 Verbindung",
      connectHub: "mit Hub verbinden",
      connectHubAt: "mit Bridge verbinden unter [URL]",
      disconnectHub: "Verbindung trennen",
      isConnected: "verbunden?",
      getHubType: "Hub-Typ",
      getFirmwareVersion: "Hub-Firmware-Version",
      getConnectionMode: "Verbindungsmodus",
      getCommunicationDiagnostics: "Kommunikationsdiagnose (JSON)",
      setConnectionMode: "Verbindungsmodus auf [MODE] setzen",
      enableStreamingMode: "Streaming-Modus einschalten",
      disableStreamingMode: "Streaming-Modus ausschalten",
      "mode.auto": "automatisch erkennen",
      "mode.scratchlinkBle": "Scratch Link (BLE)",
      "mode.scratchlinkBt": "Scratch Link (Bluetooth Classic)",
      "mode.webBle": "Web Bluetooth",
      "mode.bridge": "lokale Bridge",
      startMotor: "Motor [PORT] mit [SPEED]% starten",
      stopMotor: "Motor [PORT] mit [ACTION] stoppen",
      motorPairMove: "Lenkung [STEERING] mit Tempo [SPEED]% starten",
      displayShowImage: "eingebautes Bild [IMAGE] anzeigen",
      setLightMatrixPixel:
        "Setze 3x3-Matrix [PORT] Pixel x:[X] y:[Y] Helligkeit [BRIGHTNESS]%",
      getFaceUp: "Hub-Oberseite",
      getDistanceIn: "[PORT] Abstand in [UNIT]",
      extensionName: "LEGO SPIKE Prime",
      // Transpilation Section
      transpilationLabel: "📝 Code-Generierung",
      transpileProject: "Projekt zu SPIKE Python transpilieren",
      showCode: "generierten Code anzeigen",
      downloadCode: "als .py Datei herunterladen",
      uploadToHub: "Code via Bluetooth zum Hub hochladen",
      getTranspiledCode: "transpilierter Code",

      // File Management Section
      fileManagementLabel: "📁 Hub-Dateiverwaltung",
      uploadScriptToHub: "Skript als [NAME] zum Hub hochladen",
      runScriptOnHub: "Skript [NAME] auf Hub ausführen",
      renameScriptOnHub: "Hub-Skript [OLD] in [NEW] umbenennen",
      deleteScriptOnHub: "Skript [NAME] vom Hub löschen",
      listScriptsOnHub: "alle Skripte auf Hub auflisten",
      stopRunningScript: "laufendes Skript stoppen",

      // Movement
      setMovementMotors: "setze Bewegungsmotoren [PORT_A] und [PORT_B]",
      moveForward: "bewege [DIRECTION] für [VALUE] [UNIT]",
      steer: "starte Lenkung [STEERING]",
      startTank: "starte Kettenantrieb links [LEFT_SPEED] rechts [RIGHT_SPEED]",
      setMovementSpeed: "setze Bewegungsgeschwindigkeit auf [SPEED]%",
      stopMovement: "stoppe Bewegung",
      // Motors
      motorRunFor: "[PORT] läuft [DIRECTION] für [VALUE] [UNIT]",
      motorRunToPosition: "[PORT] läuft zu Position [POSITION] Grad",
      motorStart: "[PORT] starte Motor [DIRECTION]",
      motorStop: "[PORT] stoppe Motor",
      motorSetSpeed: "[PORT] setze Geschwindigkeit auf [SPEED] %",
      motorStartPower: "[PORT] starte Motor mit [POWER] % Leistung",
      motorSetStopAction: "[PORT] setze Stopp-Aktion auf [ACTION]",
      getPosition: "[PORT] Position",
      getRelativePosition: "[PORT] relative Position",
      getAbsolutePosition: "[PORT] absolute Position",
      getSpeed: "[PORT] Geschwindigkeit (Grad/s)",
      resetMotorPosition: "setze [PORT] Motorposition auf [POSITION] zurück",
      // Display
      displayText: "schreibe [TEXT]",
      displayImage: "schalte [MATRIX] ein",
      displayPattern: "zeige Muster [PATTERN]",
      displayClear: "schalte Pixel aus",
      setPixel: "setze Pixel [X] [Y] auf [BRIGHTNESS] %",
      rotateDisplay: "drehe Display um [ANGLE] Grad",
      setCenterButtonColor: "setze mittlere Taste auf [COLOR]",
      // IMU
      getAngle: "[AXIS] Winkel",
      getGyroRate: "Gyro-Rate [AXIS] (Grad/s)",
      getFilteredGyroRate: "gefilterte Gyro-Rate [AXIS] (Grad/s)",
      getAcceleration: "Beschleunigung [AXIS] (Milli-g)",
      getFilteredAcceleration: "gefilterte Beschleunigung [AXIS] (Milli-g)",
      resetYaw: "setze Gier-Winkel zurück",
      presetYaw: "setze Gier-Winkel auf [ANGLE] Grad",
      // 3x3 Matrix
      setMatrix3x3ColorGrid:
        "setze [PORT] 3x3 Farben: [P1][P2][P3] [P4][P5][P6] [P7][P8][P9]",
      setMatrix3x3Custom: "setze [PORT] 3x3 eigenes Muster [PATTERN]",
      setMatrix3x3SolidColor:
        "setze [PORT] 3x3 Matrix alle [COLOR] Helligkeit [BRIGHTNESS]",
      clearMatrix3x3: "lösche [PORT] 3x3 Matrix",
      // Gestures
      whenGesture: "wenn Hub [GESTURE]",
      isGesture: "Hub [GESTURE]?",
      getOrientation: "Ausrichtung",
      // Sound
      playHubSound: "spiele Hub-Sound [SOUND]",
      playBeep: "Piep [FREQUENCY] Hz für [DURATION] ms",
      playNote: "spiele Note [NOTE] für [SECS] Sekunden",
      playWaveBeep: "Piep [WAVEFORM] [FREQUENCY] Hz für [DURATION] ms",
      setVolume: "setze Lautstärke auf [VOLUME]%",
      stopSound: "stoppe alle Töne",
      // Status
      getBatteryLevel: "Batteriestand %",
      getBatteryTemperature: "Batterietemperatur",
      getHubTemperature: "Hub-Temperatur",
      getHubCurrent: "Hub-Strom (mA)",
      getHubVoltage: "Hub-Spannung (mV)",
      // Timer
      getTimer: "Timer",
      resetTimer: "setze Timer zurück",
      // Sensors
      getDistance: "[PORT] Abstand",
      setDistanceLights: "setze [PORT] Abstandslichter [TL] [TR] [BL] [BR]",
      getColor: "[PORT] Farbe",
      getReflection: "[PORT] Reflexion",
      getAmbientLight: "[PORT] Umgebungslicht",
      getColorRGB: "[PORT] Rohwert [CHANNEL]",
      getForce: "[PORT] Kraft",
      isForceSensorPressed: "[PORT] Kraftsensor gedrückt?",
      whenColor: "wenn [PORT] sieht [COLOR]",
      isColor: "[PORT] sieht [COLOR]?",
      whenForceSensor: "wenn [PORT] ist [STATE]",
      // Buttons
      isButtonPressed: "[BUTTON] Taste gedrückt?",
      whenButtonPressed: "wenn [BUTTON] Taste gedrückt",
      // File System
      writeLogFile: "füge [TEXT] zu Log-Datei [FILENAME] hinzu",
      readLogFile: "lese Log-Datei [FILENAME]",
      deleteLogFile: "lösche Datei [FILENAME]",
      listFiles: "liste Dateien auf",
      // Python
      runReplCommand: "führe Python REPL aus: [CODE]",
      getReplOutput: "REPL-Ausgabe",
      clearReplOutput: "lösche REPL-Ausgabe",
      getReplHistory: "REPL-Befehl [INDEX]",
      runPythonCommand: "führe Python aus: [CODE]",
      runHubCommand: "führe Hub-Befehl aus: [CODE]",
      exitScript: "beende Python-Skript",
      // Messages
      noCodeGenerated: "Noch kein Code generiert!",
      generateFirst: "Generiere zuerst Code!",
      notConnected: "Nicht mit SPIKE Prime Hub verbunden!",
      uploadFailed: "Upload fehlgeschlagen",
      uploadSuccess: "Erfolgreich hochgeladen!",
      downloaded: "Heruntergeladen",
      generatedCode: "Generierter SPIKE Python Code",
      close: "Schließen",
      uploadInstructions:
        "Zum Hochladen auf SPIKE Prime:\n1. Projekt als .llsp Datei speichern\n2. In SPIKE Prime App öffnen\n3. Zum Hub hochladen\n\nOder Bluetooth-Dateiübertragung nutzen, falls verfügbar.",
      confirmDelete: "{0} vom Hub löschen?",
    },
    fr: {
      // Carried over from the two folded-in extensions that shipped French
      // (legospike_bridge and legospike_ble), re-keyed onto the unified block
      // names. Keys without a French original fall back to English in t().
      extensionName: "SPIKE Prime",
      connectionLabel: "🔌 Connexion",
      connectHub: "se connecter au SPIKE Prime",
      connectHubAt: "🔌 se connecter à [URL]",
      disconnectHub: "déconnecter",
      isConnected: "connecté ?",
      getHubType: "type de hub",
      getFirmwareVersion: "version du micrologiciel du hub",
      getConnectionMode: "mode de connexion",
      getCommunicationDiagnostics: "diagnostics de communication (JSON)",
      setConnectionMode: "définir le mode de connexion sur [MODE]",
      enableStreamingMode: "activer le mode diffusion",
      disableStreamingMode: "désactiver le mode diffusion",
      "mode.auto": "détection automatique",
      "mode.scratchlinkBle": "Scratch Link (BLE)",
      "mode.scratchlinkBt": "Scratch Link (Bluetooth Classic)",
      "mode.webBle": "Web Bluetooth",
      "mode.bridge": "pont local",
      motorRunFor: "[PORT] tourne [DIRECTION] pendant [VALUE] [UNIT]",
      motorStart: "[PORT] démarrer moteur [DIRECTION]",
      motorStop: "[PORT] arrêter moteur",
      motorSetSpeed: "[PORT] définir vitesse sur [SPEED] %",
      motorStartPower: "[PORT] démarrer moteur à [POWER] % de puissance",
      getPosition: "[PORT] position",
      getRelativePosition: "position du moteur [PORT]",
      startMotor: "démarrer moteur [PORT] à [SPEED]%",
      stopMotor: "arrêter moteur [PORT] avec [ACTION]",
      displayText: "écrire [TEXT]",
      displayImage: "allumer [MATRIX]",
      displayPattern: "afficher motif [PATTERN]",
      displayClear: "éteindre les pixels",
      setPixel: "définir pixel [X] [Y] sur [BRIGHTNESS] %",
      setLightMatrixPixel:
        "définir matrice 3x3 [PORT] pixel x:[X] y:[Y] luminosité [BRIGHTNESS]%",
      getAngle: "angle [AXIS]",
      getAcceleration: "accélération [AXIS]",
      resetYaw: "réinitialiser l'angle de lacet",
      getDistance: "[PORT] distance",
      getDistanceIn: "[PORT] distance en [UNIT]",
      getColor: "[PORT] couleur",
      getForce: "[PORT] force",
      isForceSensorPressed: "capteur de force [PORT] pressé ?",
      getFaceUp: "hub face en haut",
      whenGesture: "quand le hub [GESTURE]",
      playBeep: "bip [FREQUENCY] Hz pendant [DURATION] ms",
      runPythonCommand: "exécuter Python : [CODE]",
      stopSound: "arrêter tous les sons",
      getBatteryLevel: "niveau de batterie %",
      getTimer: "minuteur",
      resetTimer: "réinitialiser minuteur",
      getReplOutput: "sortie REPL",
      clearReplOutput: "effacer la sortie REPL",
    },
  };

  // ============================================================================
  // LANGUAGE DETECTION
  // ============================================================================
  /**
   * Which translation table a BCP-47 locale tag should use.
   *
   * Two of the extensions folded into this one shipped French; the SPIKE
   * extension this file grew from only ever chose between German and English,
   * so a French user would have silently lost their translations in the merge.
   * Deciding it once, from the tables that actually exist, is also what stops
   * the next added language from needing seven edits.
   */
  const pickLang = (tag) => {
    const lower = String(tag || "").toLowerCase();
    const match = Object.keys(translations).find(
      (code) => code !== "en" && lower.startsWith(code)
    );
    return match || "en";
  };

  function detectLanguage() {
    const results = {};
    let finalLanguage = "en";

    console.log("🌍 [SPIKE] === LANGUAGE DETECTION DEBUG ===");

    try {
      results.navigatorLanguage = navigator.language;
      console.log("🌍 [SPIKE] 1. navigator.language:", navigator.language);
    } catch (e) {
      results.navigatorLanguage = "error: " + e.message;
    }

    try {
      results.navigatorLanguages = navigator.languages;
      console.log("🌍 [SPIKE] 2. navigator.languages:", navigator.languages);
    } catch (e) {
      results.navigatorLanguages = "error: " + e.message;
    }

    try {
      const twSettings = localStorage.getItem("tw:language");
      results.turboWarpLocalStorage = twSettings;
      console.log("🌍 [SPIKE] 3. TurboWarp localStorage:", twSettings);
    } catch (e) {
      results.turboWarpLocalStorage = "error: " + e.message;
    }

    try {
      if (typeof Scratch !== "undefined" && Scratch.vm && Scratch.vm.runtime) {
        const vmLocale = Scratch.vm.runtime.getLocale
          ? Scratch.vm.runtime.getLocale()
          : null;
        results.scratchVMLocale = vmLocale;
        console.log("🌍 [SPIKE] 4. Scratch VM locale:", vmLocale);
      } else {
        results.scratchVMLocale = null;
      }
    } catch (e) {
      results.scratchVMLocale = "error: " + e.message;
    }

    try {
      if (
        typeof window !== "undefined" &&
        window.ReduxStore &&
        window.ReduxStore.getState
      ) {
        const state = window.ReduxStore.getState();
        const reduxLocale = state.locales?.locale;
        results.reduxStore = reduxLocale;
        console.log("🌍 [SPIKE] 5. Redux store locale:", reduxLocale);
      } else {
        results.reduxStore = "not available";
      }
    } catch (e) {
      results.reduxStore = "error: " + e.message;
    }

    try {
      const htmlLang = document.documentElement.lang;
      results.documentLang = htmlLang;
      console.log(
        "🌍 [SPIKE] 6. document.documentElement.lang:",
        htmlLang || "(empty)"
      );
    } catch (e) {
      results.documentLang = "error: " + e.message;
    }

    console.log("\n🌍 [SPIKE] === ALL DETECTION RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

    console.log("\n🌍 [SPIKE] === DECISION LOGIC ===");

    // Priority order for language detection
    if (
      results.reduxStore &&
      typeof results.reduxStore === "string" &&
      !results.reduxStore.includes("error") &&
      results.reduxStore !== "not available"
    ) {
      console.log("🌍 [SPIKE] ✓ Using Redux store locale:", results.reduxStore);
      finalLanguage = pickLang(results.reduxStore);
    } else if (
      results.turboWarpLocalStorage &&
      typeof results.turboWarpLocalStorage === "string" &&
      !results.turboWarpLocalStorage.includes("error")
    ) {
      console.log(
        "🌍 [SPIKE] ✓ Using TurboWarp localStorage:",
        results.turboWarpLocalStorage
      );
      finalLanguage = pickLang(results.turboWarpLocalStorage);
    } else if (
      results.scratchVMLocale &&
      typeof results.scratchVMLocale === "string" &&
      !results.scratchVMLocale.includes("error")
    ) {
      console.log(
        "🌍 [SPIKE] ✓ Using Scratch VM locale:",
        results.scratchVMLocale
      );
      finalLanguage = pickLang(results.scratchVMLocale);
    } else if (
      results.documentLang &&
      typeof results.documentLang === "string" &&
      results.documentLang !== "" &&
      !results.documentLang.includes("error")
    ) {
      console.log(
        "🌍 [SPIKE] ✓ Using document.documentElement.lang:",
        results.documentLang
      );
      finalLanguage = pickLang(results.documentLang);
    } else if (
      results.navigatorLanguage &&
      typeof results.navigatorLanguage === "string" &&
      !results.navigatorLanguage.includes("error")
    ) {
      console.log(
        "🌍 [SPIKE] ✓ Using navigator.language:",
        results.navigatorLanguage
      );
      finalLanguage = pickLang(results.navigatorLanguage);
    } else if (
      results.navigatorLanguages &&
      Array.isArray(results.navigatorLanguages) &&
      results.navigatorLanguages.length > 0
    ) {
      console.log(
        "🌍 [SPIKE] ✓ Using navigator.languages[0]:",
        results.navigatorLanguages[0]
      );
      finalLanguage = pickLang(results.navigatorLanguages[0]);
    } else {
      console.log("🌍 [SPIKE] ✗ No locale detected, using default: en");
    }

    console.log("\n🌍 [SPIKE] === FINAL DECISION ===");
    console.log("🌍 [SPIKE] Selected language:", finalLanguage);
    console.log("🌍 [SPIKE] ================================\n");

    return finalLanguage;
  }

  let currentLang = detectLanguage();

  function t(key, ...values) {
    let message =
      translations[currentLang]?.[key] || translations["en"][key] || key;
    values.forEach((value, index) => {
      message = message.replaceAll(`{${index}}`, String(value));
    });
    return message;
  }

  function summarizeCommunicationError(error) {
    const message = String(error || "");
    if (message === "hub did not acknowledge device notifications") {
      return t("diag.error.notAcknowledged");
    }
    if (message === "device notification response timed out") {
      return t("diag.error.timeout");
    }
    if (
      message === "disconnected while awaiting device notification response"
    ) {
      return t("diag.error.disconnected");
    }
    if (message === "not connected to SPIKE hub") {
      return t("diag.error.notConnected");
    }
    const unknownResponse = message.match(
      /^unknown device notification response status: (.+)$/i
    );
    if (unknownResponse) {
      return t("diag.error.unknownResponse", unknownResponse[1]);
    }
    const cobsFailure = message.match(/^COBS decode failed: (.+)$/i);
    if (cobsFailure) {
      return t("diag.error.cobs", cobsFailure[1]);
    }
    const unsupportedRecord = message.match(
      /^unsupported device record: (0x[\da-f]+)$/i
    );
    if (unsupportedRecord) {
      return t("diag.error.unsupportedRecord", unsupportedRecord[1]);
    }
    if (message === "truncated InfoResponse") {
      return t("diag.error.infoResponse");
    }
    if (message === "truncated DeviceNotification header") {
      return t("diag.error.notificationHeader");
    }
    const truncatedRecord = message.match(/^truncated (.+) record$/i);
    if (truncatedRecord) {
      const record = truncatedRecord[1].toLowerCase();
      const key =
        record === "imu"
          ? "diag.error.imuRecord"
          : record === "motor"
            ? "diag.error.motorRecord"
            : "diag.error.otherRecord";
      return key === "diag.error.otherRecord" ? t(key, record) : t(key);
    }
    const payloadMismatch = message.match(
      /^DeviceNotification payload size mismatch: expected (\d+), received (\d+)$/
    );
    if (payloadMismatch) {
      return t(
        "diag.error.payloadSize",
        payloadMismatch[1],
        payloadMismatch[2]
      );
    }
    if (message === "COBS frame decoded to an empty message") {
      return t("diag.error.emptyMessage");
    }
    if (message === "Web Bluetooth is not available in this browser") {
      return t("diag.error.bluetoothUnavailable");
    }
    return t("diag.error.other");
  }

  // Localize menu labels separately from their stored values. Scratch saves a
  // menu's value into the project, so the labels may change by locale while the
  // values must remain the English protocol identifiers already used by blocks.
  const menuLabels = {
    en: {
      "unit.rotations": "rotations",
      "unit.degrees": "degrees",
      "unit.seconds": "seconds",
      "color.red": "Red",
      "color.green": "Green",
      "color.blue": "Blue",
      "color.yellow": "Yellow",
      "color.cyan": "Cyan",
      "color.magenta": "Magenta",
      "color.white": "White",
      "color.black": "Black",
      "state.pressed": "pressed",
      "state.hardPressed": "hard pressed",
      "state.released": "released",
      "action.coast": "coast",
      "action.brake": "brake",
      "action.hold": "hold",
      "button.center": "center",
      "button.connect": "connect",
      left: "left",
      right: "right",
      forward: "forward",
      backward: "backward",
      tapped: "tapped",
      doubletapped: "double tapped",
      shake: "shake",
      freefall: "free fall",
      "matrix.off": "Off",
      "matrix.magenta": "Magenta",
      "matrix.violet": "Violet",
      "matrix.blue": "Blue",
      "matrix.turquoise": "Turquoise",
      "matrix.mint": "Mint",
      "matrix.green": "Green",
      "matrix.yellow": "Yellow",
      "matrix.orange": "Orange",
      "matrix.red": "Red",
      "matrix.white": "White",
      "center.off": "Off",
      "center.pink": "Pink",
      "center.purple": "Purple",
      "center.blue": "Blue",
      "center.teal": "Teal",
      "center.green": "Green",
      "center.lime": "Lime",
      "center.yellow": "Yellow",
      "center.orange": "Orange",
      "center.red": "Red",
      "center.white": "White",
      "center.grey": "Grey",
      "pattern.heart": "heart",
      "pattern.smile": "smile",
      "pattern.sad": "sad",
      "pattern.angry": "angry",
      "pattern.surprised": "surprised",
      "pattern.wink": "wink",
      "pattern.arrow_up": "arrow up",
      "pattern.arrow_down": "arrow down",
      "pattern.arrow_left": "arrow left",
      "pattern.arrow_right": "arrow right",
      "pattern.check": "check",
      "pattern.x": "cross",
      "pattern.square": "square",
      "pattern.triangle": "triangle",
      "pattern.diamond": "diamond",
      "pattern.plus": "plus",
      "pattern.minus": "minus",
      "pattern.dot": "dot",
      "pattern.frame": "frame",
      "pattern.spiral": "spiral",
    },
    ja: {
      "unit.rotations": "回転",
      "unit.degrees": "度",
      "unit.seconds": "秒",
      "color.red": "赤",
      "color.green": "緑",
      "color.blue": "青",
      "color.yellow": "黄",
      "color.cyan": "シアン",
      "color.magenta": "マゼンタ",
      "color.white": "白",
      "color.black": "黒",
      "state.pressed": "押されている",
      "state.hardPressed": "強く押されている",
      "state.released": "離されている",
      "action.coast": "惰性",
      "action.brake": "ブレーキ",
      "action.hold": "保持",
      "button.center": "中央",
      "button.connect": "接続",
      left: "左",
      right: "右",
      forward: "前進",
      backward: "後退",
      tapped: "タップされたとき",
      doubletapped: "2回タップされたとき",
      shake: "振られたとき",
      freefall: "自由落下したとき",
      "matrix.off": "消灯",
      "matrix.magenta": "マゼンタ",
      "matrix.violet": "紫",
      "matrix.blue": "青",
      "matrix.turquoise": "ターコイズ",
      "matrix.mint": "ミント",
      "matrix.green": "緑",
      "matrix.yellow": "黄",
      "matrix.orange": "オレンジ",
      "matrix.red": "赤",
      "matrix.white": "白",
      "center.off": "消灯",
      "center.pink": "ピンク",
      "center.purple": "紫",
      "center.blue": "青",
      "center.teal": "青緑",
      "center.green": "緑",
      "center.lime": "黄緑",
      "center.yellow": "黄",
      "center.orange": "オレンジ",
      "center.red": "赤",
      "center.white": "白",
      "center.grey": "灰色",
      "pattern.heart": "ハート",
      "pattern.smile": "笑顔",
      "pattern.sad": "悲しい顔",
      "pattern.angry": "怒った顔",
      "pattern.surprised": "驚いた顔",
      "pattern.wink": "ウィンク",
      "pattern.arrow_up": "上矢印",
      "pattern.arrow_down": "下矢印",
      "pattern.arrow_left": "左矢印",
      "pattern.arrow_right": "右矢印",
      "pattern.check": "チェック",
      "pattern.x": "バツ印",
      "pattern.square": "四角形",
      "pattern.triangle": "三角形",
      "pattern.diamond": "ひし形",
      "pattern.plus": "プラス",
      "pattern.minus": "マイナス",
      "pattern.dot": "点",
      "pattern.frame": "枠",
      "pattern.spiral": "らせん",
    },
  };
  const mt = (key) =>
    menuLabels[currentLang]?.[key] || menuLabels.en[key] || key;
  const menuItem = (key, value) => ({ text: mt(key), value });

  // Watch for language changes
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === "tw:language") {
        console.log("🌍 [SPIKE] TurboWarp language changed, re-detecting...");
        const newLang = detectLanguage();
        if (newLang !== currentLang) {
          currentLang = newLang;
          console.log("🌍 [SPIKE] Language updated to:", currentLang);
        }
      }
    });

    let lastKnownLocale = null;
    setInterval(() => {
      try {
        if (window.ReduxStore && window.ReduxStore.getState) {
          const state = window.ReduxStore.getState();
          const currentLocale = state.locales?.locale;
          if (currentLocale && currentLocale !== lastKnownLocale) {
            lastKnownLocale = currentLocale;
            const newLang = pickLang(currentLocale);
            if (newLang !== currentLang) {
              currentLang = newLang;
              console.log(
                "🌍 [SPIKE] Extension language updated to:",
                currentLang
              );
            }
          }
        }
      } catch (e) {}
    }, 1000);
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  /**
   * A Python string literal for an arbitrary Scratch value.
   *
   * Every call site used to build one by concatenation -- `'"' + value + '"'`
   * -- which emits broken Python the moment a value contains a double quote,
   * a backslash, or a newline. A sprite named `say "hi"` produced
   * `"say "hi""`. Two call sites half-knew this and stripped quotes with
   * .replace(/"/g, ""), which mangles the user's text instead of escaping it.
   *
   * JSON.stringify is the right primitive: it emits a double-quoted literal
   * with ", \\ and control characters escaped, and Python accepts that same
   * escape vocabulary for str. The value is coerced first so null/undefined
   * become "" rather than the words "null"/"undefined".
   */
  const pyStringLiteral = (value) => JSON.stringify(String(value ?? ""));

  const MathUtil = {
    clamp: (val, min, max) => Math.max(min, Math.min(val, max)),
    wrapClamp: (val, min, max) => {
      const range = max - min;
      return ((((val - min) % range) + range) % range) + min;
    },
  };

  const Base64Util = {
    uint8ArrayToBase64: (array) => btoa(String.fromCharCode.apply(null, array)),
    base64ToUint8Array: (base64) => {
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return array;
    },
  };

  class RateLimiter {
    constructor(maxRate) {
      this._maxRate = maxRate;
      this._lastSendTime = 0;
      this._sendInterval = 1000 / maxRate;
    }
    /**
     * Reserves the next send slot and returns how many milliseconds to wait
     * for it (0 = send now). Slots are handed out in call order, so commands
     * keep their order and none is lost.
     *
     * The limiter used to DROP a command that came too soon after the previous
     * one (okayToSend() returned false and the send was skipped), and said so
     * to nobody. Two blocks that run within 25 ms of each other --
     * which happens whenever a busy browser fires two VM steps back to back --
     * lost the second: "start moving" vanished after "set movement speed",
     * and the robot never moved. A command is a request the program made; it
     * is delayed, never discarded. The caller's promise resolves when it is
     * actually sent, so a block that sends in a loop waits for its slot
     * instead of queueing without bound.
     */
    reserve() {
      const now = Date.now();
      const slot = Math.max(now, this._lastSendTime + this._sendInterval);
      this._lastSendTime = slot;
      return slot - now;
    }
  }

  /** Runs send() in the limiter's next slot; see RateLimiter.reserve. */
  const whenSlot = (limiter, isConnected, send) => {
    const wait = limiter.reserve();
    if (wait <= 0) return send();
    return new Promise((resolve) => setTimeout(resolve, wait)).then(() =>
      isConnected() ? send() : undefined
    );
  };

  // ============================================================================
  // JSONRPC CLASS
  // ============================================================================
  class JSONRPC {
    constructor() {
      this._requestID = 0;
      this._openRequests = {};
    }

    sendRemoteRequest(method, params) {
      const requestID = this._requestID++;
      const promise = new Promise((resolve, reject) => {
        this._openRequests[requestID] = { resolve, reject };
      });
      this._sendRequest(method, params, requestID);
      return promise;
    }

    sendRemoteNotification(method, params) {
      this._sendRequest(method, params);
    }

    didReceiveCall(/* method, params */) {
      throw new Error("Must override didReceiveCall");
    }

    _sendMessage(/* jsonMessageObject */) {
      throw new Error("Must override _sendMessage");
    }

    _sendRequest(method, params, id) {
      const request = { jsonrpc: "2.0", method, params };
      if (id !== null && typeof id !== "undefined") {
        request.id = id;
      }
      this._sendMessage(request);
    }

    _handleMessage(json) {
      if (json.jsonrpc !== "2.0") {
        throw new Error(
          `Bad or missing JSON-RPC version in message: ${JSON.stringify(json)}`
        );
      }
      if (Object.prototype.hasOwnProperty.call(json, "method")) {
        this._handleRequest(json);
      } else {
        this._handleResponse(json);
      }
    }

    _sendResponse(id, result, error) {
      const response = { jsonrpc: "2.0", id };
      if (error) {
        response.error = error;
      } else {
        response.result = result || null;
      }
      this._sendMessage(response);
    }

    _handleResponse(json) {
      const { result, error, id } = json;
      const openRequest = this._openRequests[id];
      delete this._openRequests[id];
      if (openRequest) {
        if (error) {
          openRequest.reject(error);
        } else {
          openRequest.resolve(result);
        }
      }
    }

    _handleRequest(json) {
      const { method, params, id } = json;
      const rawResult = this.didReceiveCall(method, params);
      if (id !== null && typeof id !== "undefined") {
        Promise.resolve(rawResult).then(
          (result) => {
            this._sendResponse(id, result);
          },
          (error) => {
            this._sendResponse(id, null, error);
          }
        );
      }
    }
  }

  // ============================================================================
  // BT CLASS
  // ============================================================================
  class BT extends JSONRPC {
    constructor(
      runtime,
      extensionId,
      peripheralOptions,
      connectCallback,
      resetCallback = null,
      messageCallback
    ) {
      super();
      this._socket = runtime.getScratchLinkSocket("BT");
      this._socket.setOnOpen(this.requestPeripheral.bind(this));
      this._socket.setOnClose(this.handleDisconnectError.bind(this));
      this._socket.setOnError(this._handleRequestError.bind(this));
      this._socket.setHandleMessage(this._handleMessage.bind(this));
      this._sendMessage = this._socket.sendMessage.bind(this._socket);
      this._availablePeripherals = {};
      this._connectCallback = connectCallback;
      this._connected = false;
      this._resetCallback = resetCallback;
      this._discoverTimeoutID = null;
      this._extensionId = extensionId;
      this._peripheralOptions = peripheralOptions;
      this._messageCallback = messageCallback;
      this._runtime = runtime;
      this._socket.open();
    }

    requestPeripheral() {
      this._availablePeripherals = {};
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._discoverTimeoutID = window.setTimeout(
        this._handleDiscoverTimeout.bind(this),
        15000
      );
      this.sendRemoteRequest("discover", this._peripheralOptions).catch((e) =>
        this._handleRequestError(e)
      );
    }

    connectPeripheral(id, pin = null) {
      const params = { peripheralId: id };
      if (pin) params.pin = pin;
      this.sendRemoteRequest("connect", params)
        .then(() => {
          this._connected = true;
          this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
          this._connectCallback();
        })
        .catch((e) => this._handleRequestError(e));
    }

    disconnect() {
      if (this._connected) this._connected = false;
      if (this._socket.isOpen()) this._socket.close();
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    isConnected() {
      return this._connected;
    }

    sendMessage(options) {
      return this.sendRemoteRequest("send", options).catch((e) =>
        this.handleDisconnectError(e)
      );
    }

    didReceiveCall(method, params) {
      switch (method) {
        case "didDiscoverPeripheral":
          this._availablePeripherals[params.peripheralId] = params;
          this._runtime.emit(
            this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
            this._availablePeripherals
          );
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "userDidPickPeripheral":
          this._availablePeripherals[params.peripheralId] = params;
          this._runtime.emit(
            this._runtime.constructor.USER_PICKED_PERIPHERAL,
            this._availablePeripherals
          );
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "userDidNotPickPeripheral":
          this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "didReceiveMessage":
          if (this._messageCallback) this._messageCallback(params);
          break;
        case "ping":
          return 42;
      }
    }

    handleDisconnectError(/* e */) {
      if (!this._connected) return;
      this.disconnect();
      if (this._resetCallback) this._resetCallback();
      this._runtime.emit(
        this._runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR,
        {
          message: `Scratch lost connection to`,
          extensionId: this._extensionId,
        }
      );
    }

    _handleRequestError(/* e */) {
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
        message: `Scratch lost connection to`,
        extensionId: this._extensionId,
      });
    }

    _handleDiscoverTimeout() {
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
    }
  }

  // ============================================================================
  // SPIKE 3 WIRE FORMAT
  //
  // Hub firmware 3.x does not speak the MicroPython REPL the 2.x hubs speak. It
  // exposes one GATT service (FD02) carrying length-delimited binary messages:
  // COBS-encoded, then XORed with 0x03 so no encoded byte can collide with the
  // 0x02 frame delimiter. `COBS_CODE_OFFSET` of 2 keeps the run-length codes
  // clear of both 0x00 and the delimiter.
  //
  // Lifted from the two BLE extensions this one replaces, with one correction:
  // legospike_ble.js read the motor record as 11 bytes while taking a 32-bit
  // position from offset 8, which needs a twelfth byte and so both over-read
  // the record and mis-strode to the next one. legospikeprime_ble.js had the
  // layout right — 12 bytes, speed at +7, position at +8 — and that is what is
  // used here.
  // ============================================================================
  const SPIKE3 = {
    SERVICE: "0000FD02-0000-1000-8000-00805F9B34FB",
    RX_CHAR: "0000FD02-0001-1000-8000-00805F9B34FB",
    TX_CHAR: "0000FD02-0002-1000-8000-00805F9B34FB",
    // Web Bluetooth normalises UUIDs to lower case and rejects upper case.
    SERVICE_LC: "0000fd02-0000-1000-8000-00805f9b34fb",
    RX_CHAR_LC: "0000fd02-0001-1000-8000-00805f9b34fb",
    TX_CHAR_LC: "0000fd02-0002-1000-8000-00805f9b34fb",

    DELIMITER: 0x02,
    XOR: 0x03,
    MAX_BLOCK_SIZE: 84,

    // Message types
    INFO_REQUEST: 0x00,
    INFO_RESPONSE: 0x01,
    CLEAR_SLOT_REQUEST: 0x46,
    START_FILE_UPLOAD_REQUEST: 0x0c,
    TRANSFER_CHUNK_REQUEST: 0x10,
    PROGRAM_FLOW_REQUEST: 0x1e,
    PROGRAM_FLOW_RESPONSE: 0x1f,
    PROGRAM_FLOW_NOTIFICATION: 0x20,
    CONSOLE_NOTIFICATION: 0x21,
    DEVICE_NOTIFICATION_REQUEST: 0x28,
    DEVICE_NOTIFICATION_RESPONSE: 0x29,
    TUNNEL: 0x32,
    DEVICE_NOTIFICATION: 0x3c,
    START_FILE_UPLOAD_RESPONSE: 0x0d,
    TRANSFER_CHUNK_RESPONSE: 0x11,
    CLEAR_SLOT_RESPONSE: 0x47,

    // Device record types inside a DEVICE_NOTIFICATION payload
    DEV_BATTERY: 0x00,
    DEV_IMU: 0x01,
    DEV_MATRIX_5X5: 0x02,
    DEV_MOTOR: 0x0a,
    DEV_FORCE: 0x0b,
    DEV_COLOR: 0x0c,
    DEV_DISTANCE: 0x0d,
    DEV_MATRIX_3X3: 0x0e,
    NOTIFICATION_RESPONSE_TIMEOUT_MS: 2000,
    CONTROLLER_START_NOTIFICATION_TIMEOUT_MS: 7000,
  };

  // The wire protocol only carries TunnelMessage payloads; it does not define
  // their meaning. This allow-listed controller is uploaded as a hub program
  // and is the interpreter for Brickwright's private JSON command protocol.
  // Its module_tunnel API is based on an independent third-party implementation
  // and is checked at runtime by a versioned hello/acknowledgement. LEGO's
  // published protocol does not guarantee this Python API on every Hub OS.
  const SPIKE3_CONTROLLER_SOURCE = String.raw`print("BWCTRL:boot:entered")
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
    print("BWCTRL:boot:import-error:" + type(error).__name__ + ":" + str(error))
    raise

print("BWCTRL:boot:imports-ok")

CONTROLLER_PROTOCOL = "brickwright-spike-controller"
CONTROLLER_VERSION = 1
MAX_QUEUE = 32
MAX_VELOCITY = 720
HEARTBEAT_TIMEOUT_MS = 3000
try:
    PORTS = {"A": port.A, "B": port.B, "C": port.C, "D": port.D, "E": port.E, "F": port.F}
except Exception as error:
    print("BWCTRL:boot:hub-api-error:" + type(error).__name__ + ":" + str(error))
    raise
try:
    _tunnel = hub.config["module_tunnel"]
    _tunnel_error = None
except Exception as error:
    _tunnel = None
    _tunnel_error = error
_queue = []
_active = False
_last_heartbeat = None
_text_job = None


def _ticks_diff(new, old):
    return time.ticks_diff(new, old)


def _send(value):
    _tunnel.send((json.dumps(value) + "\n").encode("utf-8"))


def _error(request_id, code, message):
    _send({"i": request_id, "ok": False, "error": code,
           "detail": str(message)[:40]})


def _success(request_id, result=None):
    _send({"i": request_id, "ok": True, "result": result or 1})


def _integer(value, name, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(name + " must be an integer")
    if value < minimum or value > maximum:
        raise ValueError(name + " is outside its allowed range")
    return value


def _stop_all_motors():
    for port_name in ("A", "B", "C", "D", "E", "F"):
        try:
            motor.stop(PORTS[port_name])
        except Exception:
            # Empty ports are expected; a later connection can still be safe.
            pass


def _receive(data):
    global _active, _last_heartbeat
    try:
        if not isinstance(data, str):
            data = bytes(data).decode("utf-8")
        command = json.loads(data.strip())
        if not isinstance(command, dict):
            raise ValueError("command must be an object")
        name = command.get("c")
        if name in ("h", "p"):
            _active = True
            _last_heartbeat = time.ticks_ms()
        if name not in (
            "h", "p", "x",
            "r", "s", "u", "d",
            "t", "a",
            "l", "m", "c", "w",
            "b", "q",
        ):
            raise ValueError("unsupported command")
        if len(_queue) >= MAX_QUEUE:
            _error(command.get("i"), "queue_full", "command queue is full")
            return
        _queue.append(command)
    except Exception as error:
        _error(None, "invalid_command", str(error))


async def _dispatch(command):
    global _active, _last_heartbeat, _text_job
    request_id = command.get("i")
    name = command.get("c")
    try:
        if name == "h":
            _active = True
            _last_heartbeat = time.ticks_ms()
            _success(request_id, "bw-spike-1")
        elif name == "p":
            _last_heartbeat = time.ticks_ms()
            _active = True
            _send({"c": "o", "version": CONTROLLER_VERSION})
        elif name == "x":
            _stop_all_motors()
            sound.stop()
            _success(request_id)
        elif name == "r":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            velocity = _integer(command.get("v"), "velocity", -MAX_VELOCITY, MAX_VELOCITY)
            if velocity == 0:
                motor.stop(PORTS[port_name])
            else:
                motor.run(PORTS[port_name], velocity)
            _success(request_id, {"state": "accepted"})
        elif name == "s":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            motor.stop(PORTS[port_name])
            _success(request_id, {"state": "stopped"})
        elif name == "u":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            duty_cycle = _integer(command.get("u"), "duty_cycle", -10000, 10000)
            motor.set_duty_cycle(PORTS[port_name], duty_cycle)
            _success(request_id, {"state": "started"})
        elif name == "d":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            degrees = _integer(command.get("d"), "degrees", -36000, 36000)
            velocity = _integer(command.get("v"), "velocity", -MAX_VELOCITY, MAX_VELOCITY)
            if velocity == 0:
                raise ValueError("velocity must not be zero")
            # SPIKE's native operation starts when called; its returned awaitable
            # can be awaited by a standalone program to wait for completion.
            # Keeping this command non-blocking lets a later stop command run.
            motor.run_for_degrees(PORTS[port_name], degrees, velocity)
            _success(request_id, {"state": "started"})
        elif name == "t":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            duration = _integer(command.get("t"), "duration_ms", 1, 60000)
            velocity = _integer(command.get("v"), "velocity", -MAX_VELOCITY, MAX_VELOCITY)
            if velocity == 0:
                raise ValueError("velocity must not be zero")
            motor.run_for_time(PORTS[port_name], duration, velocity)
            _success(request_id, {"state": "started"})
        elif name == "a":
            port_name = command.get("p")
            if port_name not in PORTS:
                raise ValueError("unknown motor port")
            position = _integer(command.get("g"), "position", -36000, 36000)
            velocity = _integer(command.get("v"), "velocity", 1, MAX_VELOCITY)
            motor.run_to_absolute_position(PORTS[port_name], position, velocity)
            _success(request_id, {"state": "started"})
        elif name == "l":
            x = _integer(command.get("x"), "x", 0, 4)
            y = _integer(command.get("y"), "y", 0, 4)
            brightness = _integer(command.get("b"), "brightness", 0, 100)
            light_matrix.set_pixel(x, y, brightness)
            _success(request_id, {"state": "updated"})
        elif name == "c":
            light_matrix.clear()
            _success(request_id, {"state": "cleared"})
        elif name == "w":
            text = command.get("t")
            if not isinstance(text, str) or len(text.encode("utf-8")) > 32:
                raise ValueError("text must be a string of at most 32 UTF-8 bytes")
            if _text_job is not None:
                raise ValueError("text display is busy")
            _text_job = (request_id, text)
        elif name == "m":
            pixels = command.get("z")
            if not isinstance(pixels, str) or len(pixels) != 25 or not pixels.isdigit():
                raise ValueError("pixel pattern must contain 25 digits")
            for index in range(25):
                brightness = int(pixels[index]) * 100 // 9
                light_matrix.set_pixel(index % 5, index // 5, brightness)
            _success(request_id, {"state": "updated"})
        elif name == "b":
            frequency = _integer(command.get("f"), "frequency", 100, 2000)
            duration = _integer(command.get("t"), "duration_ms", 20, 2000)
            await sound.beep(frequency, duration, 100)
            _success(request_id, {"state": "played"})
        elif name == "q":
            sound.stop()
            _success(request_id, {"state": "stopped"})
        else:
            raise ValueError("unsupported command")
    except Exception as error:
        _error(request_id, "execution_failed", str(error))


async def _process_next():
    if _queue:
        await _dispatch(_queue.pop(0))


async def _process_text():
    global _text_job
    if _text_job is None:
        return
    request_id, text = _text_job
    try:
        if text:
            await light_matrix.write(text)
        else:
            light_matrix.clear()
        _success(request_id, {"state": "displayed"})
    except Exception as error:
        _error(request_id, "execution_failed", str(error))
    finally:
        _text_job = None


async def _text_worker():
    while True:
        await _process_text()
        await runloop.sleep_ms(10)


async def _check_watchdog(now=None):
    global _active, _last_heartbeat
    if not _active or _last_heartbeat is None:
        return False
    current = time.ticks_ms() if now is None else now
    if _ticks_diff(current, _last_heartbeat) <= HEARTBEAT_TIMEOUT_MS:
        return False
    _stop_all_motors()
    sound.stop()
    _active = False
    _last_heartbeat = None
    return True


def _initialize():
    if _tunnel is None:
        raise RuntimeError("hub.config['module_tunnel'] unavailable: " + str(_tunnel_error))
    _tunnel.callback(_receive)


async def _main():
    print("BWCTRL:boot:runloop-entered")
    try:
        _initialize()
    except Exception as error:
        print("BWCTRL:boot:init-error:" + type(error).__name__ + ":" + str(error))
        # Keep a failed startup observable through ConsoleNotification (0x21)
        # instead of exiting before the host can collect the initialization error.
        while True:
            await runloop.sleep_ms(1000)
    print("BWCTRL:boot:tunnel-callback-registered")
    while True:
        await _check_watchdog()
        await _process_next()
        await runloop.sleep_ms(10)


try:
    # A transferred Hub program is already the program entry point. Invoke the
    # run loop unconditionally so startup does not depend on the runtime's
    # __name__ binding (LEGO's own uploaded example follows this pattern).
    runloop.run(_main(), _text_worker())
except Exception as error:
    print("BWCTRL:fatal:" + type(error).__name__ + ":" + str(error))
    raise
else:
    # _main is intended to stay alive. A normal return from runloop is a fault.
    print("BWCTRL:fatal:runloop-returned")
    raise RuntimeError("runloop.run returned before the controller stopped")
`;

  // These are intentionally the same three no-hardware probes kept in
  // development/fixtures. A transport test asserts byte-for-byte source
  // equivalence so the UI cannot silently drift from the reviewed fixtures.
  const SPIKE_STARTUP_PROBES = {
    "00": {
      labelKey: "startupProbe00Label",
      fileName: "program.py",
      pythonStages: [
        { id: "top-level", marker: "BWPROBE00:__RUN_ID__:TOP_LEVEL" },
        {
          id: "runloop-imported",
          marker: "BWPROBE00:__RUN_ID__:RUNLOOP_IMPORTED",
        },
        {
          id: "main-started",
          marker: "BWPROBE00:__RUN_ID__:MAIN_STARTED",
        },
        {
          id: "sleep-completed",
          marker: "BWPROBE00:__RUN_ID__:SLEEP_COMPLETED",
        },
        {
          id: "main-completed",
          marker: "BWPROBE00:__RUN_ID__:MAIN_COMPLETED",
        },
      ],
      source: String.raw`"""No-hardware SPIKE startup probe: runloop only.

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
`,
    },
    "01": {
      labelKey: "startupProbe01Label",
      fileName: "program.py",
      source: String.raw`"""No-hardware SPIKE startup probe: public API imports plus runloop.

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
`,
    },
    "02": {
      labelKey: "startupProbe02Label",
      fileName: "program.py",
      source: String.raw`"""No-hardware SPIKE startup probe: module_tunnel lookup and callback.

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
`,
    },
  };

  const COBS = {
    /**
     * COBS with the run codes offset by 3, so that no code can be 0x00, 0x01
     * or the 0x02 delimiter. 0xff marks a block that ends without a delimiter
     * byte of its own.
     *
     * This is byte-for-byte the algorithm in
     * overlay/scratch-gui/src/lib/virtual-hub/spike-prime-peripheral.js, which
     * is checked against test/fixtures/spike-cobs-v1.json. Sharing the
     * algorithm is what lets the same fixture judge both, so the extension and
     * the virtual hub cannot drift into agreeing only with themselves.
     */
    encode(input) {
      const output = [0xff];
      let codeIndex = 0;
      let block = 1;
      for (const byte of input) {
        if (byte <= 2) {
          output[codeIndex] = block + 2 + byte * SPIKE3.MAX_BLOCK_SIZE;
          codeIndex = output.length;
          output.push(0xff);
          block = 1;
        } else {
          output.push(byte);
          block++;
          if (block > SPIKE3.MAX_BLOCK_SIZE) {
            codeIndex = output.length;
            output.push(0xff);
            block = 1;
          }
        }
      }
      output[codeIndex] = block + 2;
      return Uint8Array.from(output);
    },

    decode(input) {
      if (!input.length) throw new Error("empty COBS payload");
      const output = [];
      for (let offset = 0; offset < input.length; ) {
        const code = input[offset++];
        if (code <= 2) throw new Error("reserved COBS code");
        const adjusted = code === 0xff ? null : code - 3;
        const delimiter =
          adjusted === null
            ? null
            : Math.floor(adjusted / SPIKE3.MAX_BLOCK_SIZE);
        const block =
          adjusted === null
            ? SPIKE3.MAX_BLOCK_SIZE
            : adjusted % SPIKE3.MAX_BLOCK_SIZE;
        if (delimiter !== null && delimiter > 2)
          throw new Error("invalid COBS delimiter");
        if (offset + block > input.length)
          throw new Error("truncated COBS block");
        for (let i = 0; i < block; i++) output.push(input[offset++]);
        if (delimiter !== null && offset < input.length) output.push(delimiter);
      }
      return Uint8Array.from(output);
    },

    /** Frame a message for the wire: COBS, XOR 0x03, then the 0x02 delimiter. */
    pack(data) {
      const encoded = COBS.encode(data);
      return Uint8Array.from(
        [...encoded].map((byte) => byte ^ SPIKE3.XOR).concat(SPIKE3.DELIMITER)
      );
    },

    /**
     * Undo `pack`. Throws on a frame that is not well formed rather than
     * returning something plausible — a mis-decoded frame becomes wrong sensor
     * values, which is worse than a dropped one.
     */
    unpack(frame) {
      const start = frame[0] === 1 ? 1 : 0;
      if (
        frame.length - start < 2 ||
        frame[frame.length - 1] !== SPIKE3.DELIMITER
      ) {
        throw new Error("unterminated frame");
      }
      const encoded = frame.slice(start, -1);
      for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] >= 1 && encoded[i] <= 3)
          throw new Error("unescaped control byte");
        encoded[i] ^= SPIKE3.XOR;
      }
      return COBS.decode(encoded);
    },
  };

  // ============================================================================
  // TRANSPORTS
  //
  // Four ways to reach a hub, behind two interfaces.
  //
  //   STREAM  (connectPeripheral, disconnect, isConnected, sendMessage{message})
  //           carries the 2.x REPL byte stream. Scratch Link BT (RFCOMM) and
  //           the local WebSocket bridge both provide it.
  //
  //   GATT    (connectPeripheral, disconnect, isConnected, startNotifications,
  //           write) carries SPIKE 3 frames. Scratch Link BLE and the browser's
  //           own Web Bluetooth both provide it.
  //
  // Nothing above this layer knows which of the four is in use; it knows only
  // which of the two interfaces it holds. That is what lets one extension speak
  // to a hub over whichever route the machine actually has.
  // ============================================================================

  /** GATT over Scratch Link. */
  class BLELink extends JSONRPC {
    constructor(
      runtime,
      extensionId,
      peripheralOptions,
      connectCallback,
      resetCallback = null
    ) {
      super();
      this._runtime = runtime;
      this._extensionId = extensionId;
      this._peripheralOptions = peripheralOptions;
      this._connectCallback = connectCallback;
      this._resetCallback = resetCallback;
      this._socket = runtime.getScratchLinkSocket("BLE");
      this._socket.setOnOpen(this.requestPeripheral.bind(this));
      this._socket.setOnClose(this.handleDisconnectError.bind(this));
      this._socket.setOnError(this._handleRequestError.bind(this));
      this._socket.setHandleMessage(this._handleMessage.bind(this));
      this._sendMessage = this._socket.sendMessage.bind(this._socket);
      this._availablePeripherals = {};
      this._connected = false;
      this._characteristicDidChangeCallback = null;
      this._discoverTimeoutID = null;
      this._socket.open();
    }

    get kind() {
      return "gatt";
    }

    requestPeripheral() {
      this._availablePeripherals = {};
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._discoverTimeoutID = window.setTimeout(
        this._handleDiscoverTimeout.bind(this),
        15000
      );
      this.sendRemoteRequest("discover", this._peripheralOptions).catch((e) =>
        this._handleRequestError(e)
      );
    }

    connectPeripheral(id) {
      this.sendRemoteRequest("connect", { peripheralId: id })
        .then(() => {
          this._connected = true;
          this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
          this._connectCallback();
        })
        .catch((e) => this._handleRequestError(e));
    }

    disconnect() {
      if (this._connected) this._connected = false;
      if (this._socket.isOpen()) this._socket.close();
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    isConnected() {
      return this._connected;
    }

    startNotifications(
      serviceId,
      characteristicId,
      onCharacteristicChanged = null
    ) {
      this._characteristicDidChangeCallback = onCharacteristicChanged;
      return this.sendRemoteRequest("startNotifications", {
        serviceId,
        characteristicId,
      }).catch((e) => this.handleDisconnectError(e));
    }

    write(
      serviceId,
      characteristicId,
      message,
      encoding = null,
      withResponse = null
    ) {
      const params = { serviceId, characteristicId, message };
      if (encoding) params.encoding = encoding;
      if (withResponse !== null) params.withResponse = withResponse;
      return this.sendRemoteRequest("write", params).catch((e) =>
        this.handleDisconnectError(e)
      );
    }

    didReceiveCall(method, params) {
      switch (method) {
        case "didDiscoverPeripheral":
          this._availablePeripherals[params.peripheralId] = params;
          this._runtime.emit(
            this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
            this._availablePeripherals
          );
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "userDidPickPeripheral":
          this._availablePeripherals[params.peripheralId] = params;
          this._runtime.emit(
            this._runtime.constructor.USER_PICKED_PERIPHERAL,
            this._availablePeripherals
          );
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "userDidNotPickPeripheral":
          this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
          if (this._discoverTimeoutID)
            window.clearTimeout(this._discoverTimeoutID);
          break;
        case "characteristicDidChange":
          if (this._characteristicDidChangeCallback) {
            this._characteristicDidChangeCallback(params.message);
          }
          break;
        case "ping":
          return 42;
        default:
          break;
      }
      return null;
    }

    handleDisconnectError() {
      if (!this._connected) return;
      this.disconnect();
      if (this._resetCallback) this._resetCallback();
      this._runtime.emit(
        this._runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR,
        {
          message: `Scratch lost connection to`,
          extensionId: this._extensionId,
        }
      );
    }

    _handleRequestError() {
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
        message: `Scratch lost connection to`,
        extensionId: this._extensionId,
      });
    }

    _handleDiscoverTimeout() {
      if (this._discoverTimeoutID) window.clearTimeout(this._discoverTimeoutID);
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
    }
  }

  /**
   * GATT over the browser's own Web Bluetooth.
   *
   * Unlike the Scratch Link transports this one cannot enumerate peripherals
   * into Scratch's chooser: `navigator.bluetooth.requestDevice` opens the
   * browser's own chooser and must be called from a user gesture. So `scan()`
   * here goes straight to that chooser and reports the single device the user
   * picked as both the discovery result and the connection.
   */
  class WebBLELink {
    constructor(
      runtime,
      extensionId,
      connectCallback,
      resetCallback = null,
      errorCallback = null
    ) {
      this._runtime = runtime;
      this._extensionId = extensionId;
      this._connectCallback = connectCallback;
      this._resetCallback = resetCallback;
      this._errorCallback = errorCallback;
      this._device = null;
      this._server = null;
      this._rx = null;
      this._tx = null;
      this._connected = false;
      this._characteristicDidChangeCallback = null;
      this._deviceDisconnectListener = null;
      this._characteristicChangedListener = null;
      this._writeChain = Promise.resolve();
      this._maxPacketSize = 20;
      this._activeWriteContext = null;
      this._lastWriteContext = null;
    }

    get kind() {
      return "gatt";
    }

    static available() {
      return typeof navigator !== "undefined" && Boolean(navigator.bluetooth);
    }

    async requestPeripheral() {
      if (!WebBLELink.available()) {
        throw new Error("Web Bluetooth is not available in this browser");
      }
      this._device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SPIKE3.SERVICE_LC] }],
        optionalServices: [SPIKE3.SERVICE_LC],
      });
      this._deviceDisconnectListener = (event) => {
        this._connected = false;
        this._removeListeners();
        if (this._resetCallback) {
          this._resetCallback({
            origin: "gattserverdisconnected",
            requested: false,
            eventType: event?.type || "gattserverdisconnected",
            messageContext:
              this._activeWriteContext || this._lastWriteContext || null,
          });
        }
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
      };
      this._device.addEventListener(
        "gattserverdisconnected",
        this._deviceDisconnectListener
      );
      return this._device;
    }

    async connectPeripheral() {
      if (!this._device) await this.requestPeripheral();
      this._server = await this._device.gatt.connect();
      const service = await this._server.getPrimaryService(SPIKE3.SERVICE_LC);
      this._rx = await service.getCharacteristic(SPIKE3.RX_CHAR_LC);
      this._tx = await service.getCharacteristic(SPIKE3.TX_CHAR_LC);
      await this._tx.startNotifications();
      this._characteristicChangedListener = (event) => {
        if (!this._characteristicDidChangeCallback) return;
        const view = event.target.value;
        const bytes = new Uint8Array(
          view.buffer,
          view.byteOffset,
          view.byteLength
        );
        this._characteristicDidChangeCallback(
          Base64Util.uint8ArrayToBase64(bytes)
        );
      };
      this._tx.addEventListener(
        "characteristicvaluechanged",
        this._characteristicChangedListener
      );
      this._connected = true;
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
      if (this._connectCallback) this._connectCallback();
    }

    disconnect({
      origin = "user-requested",
      error = null,
      messageContext = null,
    } = {}) {
      const wasConnected = this._connected;
      this._connected = false;
      // Remove the listener before calling GATT.disconnect(). That call can
      // synchronously trigger gattserverdisconnected in test doubles and may
      // otherwise make our own write failure or user request look like a
      // remote disconnect.
      this._removeListeners();
      try {
        if (this._device && this._device.gatt && this._device.gatt.connected) {
          this._device.gatt.disconnect();
        }
      } catch (e) {
        // A disconnect that fails because the device already went away is the
        // outcome we wanted.
      }
      if (wasConnected && this._resetCallback) {
        this._resetCallback({
          origin,
          requested: origin === "user-requested",
          error,
          messageContext,
        });
      }
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_DISCONNECTED);
    }

    _removeListeners() {
      if (
        this._device &&
        typeof this._device.removeEventListener === "function" &&
        this._deviceDisconnectListener
      ) {
        this._device.removeEventListener(
          "gattserverdisconnected",
          this._deviceDisconnectListener
        );
      }
      if (
        this._tx &&
        typeof this._tx.removeEventListener === "function" &&
        this._characteristicChangedListener
      ) {
        this._tx.removeEventListener(
          "characteristicvaluechanged",
          this._characteristicChangedListener
        );
      }
      this._deviceDisconnectListener = null;
      this._characteristicChangedListener = null;
      this._characteristicDidChangeCallback = null;
    }

    isConnected() {
      return this._connected;
    }

    startNotifications(
      serviceId,
      characteristicId,
      onCharacteristicChanged = null
    ) {
      this._characteristicDidChangeCallback = onCharacteristicChanged;
      return Promise.resolve();
    }

    /**
     * Writes are serialised and split to the negotiated packet size: a GATT
     * write longer than the MTU is rejected outright rather than fragmented.
     */
    write(
      serviceId,
      characteristicId,
      message,
      encoding = null,
      messageContext = null
    ) {
      const bytes =
        encoding === "base64"
          ? Base64Util.base64ToUint8Array(message)
          : Uint8Array.from(message);
      let writeAttempted = false;
      this._writeChain = this._writeChain
        .catch(() => {})
        .then(async () => {
          if (!this._rx || !this._connected) {
            const error = new Error(
              "SPIKE BLE RX characteristic is unavailable"
            );
            error.code = "ERR_HUB_NOT_CONNECTED";
            throw error;
          }
          // The official BLE transport permits one encoded frame to be sent
          // as sequential writes no larger than max_packet_size.
          const packetCount = Math.ceil(bytes.length / this._maxPacketSize);
          for (let i = 0; i < bytes.length; i += this._maxPacketSize) {
            const chunk = bytes.slice(i, i + this._maxPacketSize);
            const context = {
              ...messageContext,
              packetIndex: Math.floor(i / this._maxPacketSize),
              packetCount,
              packetLength: chunk.length,
            };
            this._activeWriteContext = context;
            this._lastWriteContext = context;
            writeAttempted = true;
            if (this._rx.writeValueWithoutResponse) {
              await this._rx.writeValueWithoutResponse(chunk);
            } else {
              await this._rx.writeValue(chunk);
            }
            this._lastWriteContext = {
              ...context,
              status: "write-completed",
              completedAt: Date.now(),
            };
            this._activeWriteContext = null;
          }
        })
        .catch((error) => {
          // A failed chunk can leave the hub with a partial COBS frame. Stop
          // using this connection so later commands cannot be appended to it.
          const context = this._activeWriteContext || {
            ...messageContext,
            packetIndex: null,
            packetCount: Math.ceil(bytes.length / this._maxPacketSize),
            packetLength: null,
          };
          const origin = writeAttempted
            ? "ble-write-exception"
            : "write-precondition-failure";
          this._activeWriteContext = null;
          if (this._errorCallback) this._errorCallback(error, context);
          this.disconnect({ origin, error, messageContext: context });
          throw error;
        });
      return this._writeChain;
    }

    setMaxPacketSize(size) {
      if (size > 0) this._maxPacketSize = size;
    }
  }

  /**
   * STREAM over a local WebSocket relay.
   *
   * The relay speaks to the hub's USB or Bluetooth serial port on the user's
   * machine and forwards bytes both ways, which is how a browser with neither
   * Scratch Link nor Web Bluetooth still reaches a 2.x hub.
   */
  class BridgeLink {
    constructor(
      runtime,
      extensionId,
      connectCallback,
      resetCallback = null,
      messageCallback = null
    ) {
      this._runtime = runtime;
      this._extensionId = extensionId;
      this._connectCallback = connectCallback;
      this._resetCallback = resetCallback;
      this._messageCallback = messageCallback;
      this._ws = null;
      this._connected = false;
      this._url = "localhost:8081";
    }

    get kind() {
      return "stream";
    }

    setURL(url) {
      this._url = String(url || "").trim() || "localhost:8081";
    }

    connectPeripheral() {
      const raw = this._url;
      const url = /^wss?:\/\//.test(raw) ? raw : `ws://${raw}`;
      return new Promise((resolve, reject) => {
        let ws;
        try {
          // eslint-disable-next-line extension/check-can-fetch -- the address is a local relay the user typed into the `connect to bridge at` block, so the choice of host IS the user's action; canFetch would prompt for permission the user just granted. Same reasoning as legospike_bridge.js, which this absorbed.
          ws = new WebSocket(url);
        } catch (e) {
          reject(e);
          return;
        }
        this._ws = ws;
        ws.onopen = () => {
          this._connected = true;
          this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
          if (this._connectCallback) this._connectCallback();
          resolve();
        };
        ws.onclose = () => {
          const was = this._connected;
          this._connected = false;
          if (this._resetCallback) this._resetCallback();
          if (was)
            this._runtime.emit(
              this._runtime.constructor.PERIPHERAL_DISCONNECTED
            );
        };
        ws.onerror = () => {
          this._connected = false;
          reject(new Error(`could not reach the bridge at ${url}`));
        };
        ws.onmessage = (event) => {
          if (!this._messageCallback) return;
          const text = typeof event.data === "string" ? event.data : "";
          // The stream hub expects what Scratch Link hands it: base64.
          this._messageCallback({
            message: Base64Util.uint8ArrayToBase64(
              new TextEncoder().encode(text)
            ),
          });
        };
      });
    }

    disconnect() {
      this._connected = false;
      if (this._ws) {
        try {
          this._ws.close();
        } catch (e) {
          // Already closed.
        }
        this._ws = null;
      }
    }

    isConnected() {
      return this._connected && this._ws && this._ws.readyState === 1;
    }

    sendMessage(options) {
      if (!this.isConnected()) return Promise.resolve();
      // The REPL hands every link what Scratch Link takes: base64 of the
      // text. The relay forwards text to the hub's serial port as it is (and
      // ws.onmessage above reads the hub's text as it is), so the base64 has
      // to come off here, or the hub's REPL is sent base64 and runs nothing.
      const text =
        options.encoding === "base64"
          ? new TextDecoder().decode(
              Base64Util.base64ToUint8Array(options.message)
            )
          : options.message;
      this._ws.send(text);
      return Promise.resolve();
    }
  }

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const iconURI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAABGdBTUEAALGPC/xhBQAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAUKADAAQAAAABAAAAUAAAAAASKG51AAAEUUlEQVR4Ae2cTWgTURDHZxORatUeFLUeqtaThSDFHopQ1HoQhB4LigjWq3pTEbUXK+LHUb2qICrYkwiCF7UUpYdq0UA9iFVbaFXqoWq1CMm6/022SZNsnsmb3X2kM7Dp5s17k5lf5r15KewjEhECQkAICAEhIASEgBBYjAQs7qB7r9zvoLR90rbtNsd2I7f9Ku1NWZY1TDHrat+pA4NV2ig5jBVg76W7Z2yyLpBts9ot6XkVjY5TabKot+/0wYtVDC85hC1QN/NS6efxeDzW2ZGg1kQzraivK/mhYTf+mp2jkeQYPR1MUiqVSlM8tosrE2NswWDaErnwOtpbjIGH+PBFwid8sfARSwxX3GwAs2uem3lcznHbwayAeL5y2F/CYSRrwy0YUU3b77NEt4aIkpMZbxIbiHraiVbX5yLM842tuHECzHka8h3gHe8n+jmX++CB90SvJ4iudS+EmOvBc8c2hXncqc4KMg/w2pqIbh/KXLhHG3RBSk0A9KbtsZ2ZbMO0xT3E02Xe8b/WBEB+LP9vsSYAomBArg8QYT3EhXuIp8u843+tiSKCaouCMTxOdPhODtJKZx8PXZBSEwCx5qHaqrYxQYCsCYAAA4gn9gSBqLzNmlgDy4cYrFYAavKNfgqPFvxDqMX5uV9OKu1fzhaDTjJQE6IAFICaBDSHR78Gqta8wgAr7V84nvm9TGFNoOFloF/1DLpdE5BquGSgipBCLwAVgFRqAagipNCHtwb6Vc+g2xUAdNWSgZoEw8vAoKutn31NQKrhkoEqQgq9AFQAUqkFoIqQQh/eGhh0tfWzrwCgq5YM1CQYXgb6OepXPStt97MfcLtkoCZgASgANQloDo9+DfSrnpW2a4KodrhM4WrJZcdFn4F+AfhVYb/+EbVLBmqCF4ACUJOA5nBz10C/KqwZMPdwmcKaRAWgANQkoDncyDXw1ZsPhOvb9Iwb3to1DbR92xb30oyXfbhRAPFYav+jlzT26cuCQCcmpwnX23efqbtrh1FPghoF0IPXsGo57d3dSpub1rkgP45/pSfPRlyw6NOzv3MB4CjfGFNEMGWReYB39Mg+Smzd6GYanrDEPdqgQx/0NUWMAggoyLxldUuL+KANOogALMJD8wXDm7YlusxPaa+4lOoTdpsxGRh24FyfZwxAbFUgKBh+4um8vn79wmw3BiD2eRBU2z9zf4sYoA06iNe3qFMEDUYBbN60nmZ+/KYbNx9T0tnzYV+IC/dogw59TAJo1D4Qm2RvL/jg4YuifAI89DFJOAFOOYE1ImPyTseoKFaMwyYZ2xRcXrXl+ikH37ICX1mEDSDOpnLOY+nCCUE45EZHgvrdC98g7jlaOg7mjeVbA52DvZzHBtM4XmlwaNRdu/I+J9JbZB58gm/wEYeQcTlU8Kikntlzl++dtdL2efd4JT1TgYx24Zl6+JgX8WI7/s6LW/4KASEgBISAEBACQkAILC4C/wDBL1fytvgQdgAAAABJRU5ErkJggg==";

  const BTSendRateMax = 40;
  const SpikePorts = ["A", "B", "C", "D", "E", "F"];
  const SpikeMotorStopMode = { float: 0, brake: 1, hold: 2 };
  const SpikeOrientation = {
    front: 1,
    back: 2,
    up: 3,
    down: 4,
    rightside: 5,
    leftside: 6,
  };
  const HubSoundFiles = [
    "menu_click",
    "menu_fastback",
    "menu_program_start",
    "menu_program_stop",
    "menu_shutdown",
    "startup",
  ];
  const ColorEmojiMap = {
    "⚫": 0,
    "🟣": 1,
    "🟪": 2,
    "🔵": 3,
    "🔷": 4,
    "🟢": 5,
    "🟩": 6,
    "🟡": 7,
    "🟠": 8,
    "🔴": 9,
    "⚪": 10,
  };
  const DisplayPatterns = {
    heart: "960000960960a60960960000960",
    smile: "760076000078000076000760",
    sad: "760076000087600076000760",
    angry: "970079000087600079000970",
    surprised: "760076000999900076000760",
    wink: "760070000078000076000760",
    arrow_up: "060060060686060606000000",
    arrow_down: "000060606068606060606000",
    arrow_left: "000060068006000060000000",
    arrow_right: "000600000680600060000000",
    check: "000000080000806080000000",
    x: "970000970000090000970000970",
    square: "979797900009900099000979797",
    triangle: "060060606996999999600000",
    diamond: "060060606906906060000600",
    plus: "060000600999996060000600",
    minus: "000000000999999000000000",
    dot: "000000000000a00000000000000",
    frame: "979797900009900099000979797",
    spiral: "979797060000900009000979797",
  };
  const CenterLEDColors = {
    OFF: 0,
    PINK: 1,
    PURPLE: 2,
    BLUE: 3,
    TEAL: 4,
    GREEN: 5,
    LIME: 6,
    YELLOW: 7,
    ORANGE: 8,
    RED: 9,
    WHITE: 10,
    GREY: 11,
  };
  const SoundWaveforms = {
    sin: "hub.sound.SOUND_SIN",
    square: "hub.sound.SOUND_SQUARE",
    triangle: "hub.sound.SOUND_TRIANGLE",
    sawtooth: "hub.sound.SOUND_SAWTOOTH",
  };

  // ============================================================================
  // MOTOR SETTING CLASS
  // ============================================================================
  class SpikeMotorSetting {
    constructor() {
      this._speed = 75;
      this._stopMode = SpikeMotorStopMode.brake;
      this._stallDetection = true;
    }
    get speed() {
      return this._speed;
    }
    set speed(value) {
      this._speed = MathUtil.clamp(value, -100, 100);
    }
    get stopMode() {
      return this._stopMode;
    }
    set stopMode(value) {
      if (value >= 0 && value <= 2) this._stopMode = value;
    }
    get stallDetection() {
      return this._stallDetection;
    }
    set stallDetection(value) {
      this._stallDetection = value;
    }
  }

  // ============================================================================
  // SPIKE PRIME PERIPHERAL CLASS
  // ============================================================================
  class SpikePrime {
    constructor(runtime, extensionId) {
      this._runtime =
        runtime ||
        (typeof globalThis.vm !== "undefined" ? globalThis.vm.runtime : null);
      this._extensionId = extensionId;
      this._remainingText = "";
      this._firmware = null;
      this._hardwareVariant = null;

      this._sensors = {
        buttons: [0, 0, 0, 0],
        angle: { pitch: 0, roll: 0, yaw: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
        accelerationFiltered: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        gyroFiltered: { x: 0, y: 0, z: 0 },
        orientation: SpikeOrientation.front,
        battery: 100,
        temperature: 25,
        hubTemp: 25,
        power: { current: 0, voltage: 0 },
        gestures: {
          tapped: false,
          doubletapped: false,
          shake: false,
          freefall: false,
        },
        motorPositions: {},
      };

      this._portValues = {};
      this._pixelBrightness = 100;
      this._motorSettings = {
        A: new SpikeMotorSetting(),
        B: new SpikeMotorSetting(),
        C: new SpikeMotorSetting(),
        D: new SpikeMotorSetting(),
        E: new SpikeMotorSetting(),
        F: new SpikeMotorSetting(),
      };

      this._movementMotors = ["A", "B"];
      this._timer = { start: Date.now(), current: 0 };
      this._volume = 100;
      this._replHistory = [];
      this._replOutput = "";

      this._bt = null;
      this._rateLimiter = new RateLimiter(BTSendRateMax);
      this._openRequests = {};
      this._pythonAvailable = false;
      this._sensorLoopRunning = false;

      this.reset = this.reset.bind(this);
      this._onConnect = this._onConnect.bind(this);
      this._onMessage = this._onMessage.bind(this);

      // The router owns the peripheral registration now: scratch-vm keeps one
      // peripheral per extension id, and this hub is one of two that can be
      // the active one. PROJECT_STOP_ALL still binds here, because stopping is
      // per-hub and harmless on the idle one.
      if (this._runtime && typeof this._runtime.on === "function") {
        this._runtime.on("PROJECT_STOP_ALL", this.stopAll.bind(this));
      }

      setInterval(() => {
        this._timer.current = (Date.now() - this._timer.start) / 1000;
      }, 10);
    }

    get protocol() {
      return "repl";
    }

    /**
     * The 2.x firmware reports its version through `hub.info()` over the same
     * REPL stream, so unlike SPIKE 3 there is no version in a handshake. It is
     * filled in by the status parser when the hub volunteers it.
     */
    get firmwareVersion() {
      return this._firmware || null;
    }

    /** Give this hub the stream transport it should talk over. */
    attach(link) {
      this._bt = link;
    }

    // Getters
    get angle() {
      return this._sensors.angle;
    }
    get orientation() {
      return this._sensors.orientation;
    }
    get portValues() {
      return this._portValues;
    }
    get pixelBrightness() {
      return this._pixelBrightness;
    }
    set pixelBrightness(value) {
      this._pixelBrightness = value;
    }
    get motorSettings() {
      return this._motorSettings;
    }
    get acceleration() {
      return this._sensors.acceleration;
    }
    get accelerationFiltered() {
      return this._sensors.accelerationFiltered;
    }
    get gyro() {
      return this._sensors.gyro;
    }
    get gyroFiltered() {
      return this._sensors.gyroFiltered;
    }
    get battery() {
      return this._sensors.battery;
    }
    get temperature() {
      return this._sensors.temperature;
    }
    get hubTemp() {
      return this._sensors.hubTemp;
    }
    get power() {
      return this._sensors.power;
    }
    get gestures() {
      return this._sensors.gestures;
    }
    get movementMotors() {
      return this._movementMotors;
    }
    get timer() {
      return this._timer.current;
    }
    get volume() {
      return this._volume;
    }
    get replOutput() {
      return this._replOutput;
    }
    get replHistory() {
      return this._replHistory;
    }

    stopAll() {
      if (!this.isConnected()) return;
      this.stopAllMotors();
      this.stopSound();
    }

    stopSound() {
      this.sendPythonCommand("import hub; hub.sound.stop()");
    }

    stopAllMotors() {
      this.sendPythonCommand(
        'import hub; [hub.port[p].motor.stop() for p in "ABCDEF" if hasattr(hub.port[p], "motor")]'
      );
    }

    /**
     * Scratch Link's Bluetooth Classic discovery, filtered to the device class
     * a SPIKE hub advertises over RFCOMM. Kept as the hub's own scan so that
     * the 2.x path behaves exactly as it did before the transports were split
     * out; the router calls this when it picks this mode.
     */
    scan() {
      if (this._bt) this._bt.disconnect();
      this._bt = new BT(
        this._runtime,
        this._extensionId,
        { majorDeviceClass: 8, minorDeviceClass: 1 },
        this._onConnect,
        this.reset,
        this._onMessage
      );
    }

    connect(id) {
      if (this._bt) this._bt.connectPeripheral(id);
    }

    disconnect() {
      if (this._bt) this._bt.disconnect();
      this.reset();
    }

    reset() {
      this._remainingText = "";
      this._firmware = null;
      this._hardwareVariant = null;
      this._sensors = {
        buttons: [0, 0, 0, 0],
        angle: { pitch: 0, roll: 0, yaw: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
        accelerationFiltered: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        gyroFiltered: { x: 0, y: 0, z: 0 },
        orientation: SpikeOrientation.front,
        battery: 100,
        temperature: 25,
        hubTemp: 25,
        power: { current: 0, voltage: 0 },
        gestures: {
          tapped: false,
          doubletapped: false,
          shake: false,
          freefall: false,
        },
        motorPositions: {},
      };
      this._portValues = {};
      this._pythonAvailable = false;
      this._sensorLoopRunning = false;
      this._timer.start = Date.now();
      this._timer.current = 0;
      this._replOutput = "";
      this._replHistory = [];
    }

    isConnected() {
      return this._bt ? this._bt.isConnected() : false;
    }

    sendJSON(json, useLimiter = false) {
      const jsonText = JSON.stringify(json);
      return this.sendRaw(`${jsonText}\r`, useLimiter, json.i);
    }

    /**
     * Scratch Link's RFCOMM `send` takes base64 and an explicit encoding.
     *
     * This extension used to pass the raw text with no encoding field, which
     * is not the protocol — spikeprimeBTC, the extension it shared a hub and
     * a vocabulary with, had always done it correctly. Merging the two forced
     * the difference into the open, and the correct one wins: the virtual
     * Classic transport refuses anything else
     * (test/virtual-spike-classic-extension-e2e.test.mjs), which is how the
     * discrepancy surfaced at all.
     */
    sendRaw(text, useLimiter = false, id = null) {
      if (!this.isConnected()) return Promise.resolve();
      if (useLimiter) {
        return whenSlot(
          this._rateLimiter,
          () => this.isConnected(),
          () => this.sendRaw(text, false, id)
        );
      }

      const options = {
        message: Base64Util.uint8ArrayToBase64(new TextEncoder().encode(text)),
        encoding: "base64",
      };

      if (!id) return this._bt.sendMessage(options);
      const promise = new Promise((resolve, reject) => {
        this._openRequests[id] = { resolve, reject };
      });
      this._bt.sendMessage(options);
      return promise;
    }

    // Change needsResponse default to false for all streaming commands
    sendCommand(method, params, needsResponse = false) {
      // Set default to false
      if (needsResponse) {
        const id = Math.random().toString(36).slice(-4);
        return this.sendJSON({ i: id, m: method, p: params });
      }
      // Sending without an "i" (id) tells the hub we don't need a confirmation
      return this.sendJSON({ m: method, p: params });
    }

    sendPythonCommand(pythonCode) {
      return this.sendRaw(`${pythonCode}\r\n`);
    }

    sendReplCommand(pythonCode) {
      this._replHistory.push(pythonCode);
      if (this._replHistory.length > 50) this._replHistory.shift();
      const wrappedCode = `
try:
    _result = eval("${pythonCode.replace(/"/g, '\\"')}")
    if _result is not None:
        print(f">>> {_result}")
    else:
        exec("${pythonCode.replace(/"/g, '\\"')}")
        print(">>> Command executed")
except Exception as e:
    print(f">>> Error: {e}")
`;
      return this.sendPythonCommand(wrappedCode);
    }

    _onConnect() {
      this.sendRaw("\x03");
      setTimeout(() => {
        this.sendRaw('import hub\r\nprint("PYTHON_AVAILABLE")\r\n');
        // Ask the hub what it is. `hub.info()` gives the firmware tuple and
        // the hardware variant, which is how a SPIKE Prime hub is told from a
        // Robot Inventor one — they run the same firmware line and differ only
        // here. Printed on a tagged line so the stream parser can pick it out
        // without disturbing anything else the REPL emits.
        this.sendRaw(
          'import hub\r\ntry:\r\n print("HUBINFO:%s|%s" % (".".join(str(x) for x in hub.info()["firmware_version"]), hub.info().get("hardware_variant","")))\r\nexcept Exception as e:\r\n print("HUBINFO:|")\r\n'
        );
        this.sendCommand("trigger_current_state", {}, false);
      }, 250);
    }

    _initializeContinuousSensorMonitoring() {
      if (!this._pythonAvailable || this._sensorLoopRunning) return;
      this._sensorLoopRunning = true;

      const sensorScript = `
import hub, utime
def continuous_sensor_loop():
    while True:
        try:
            yaw_angle, pitch_angle, roll_angle = hub.motion.position()
            accel_x, accel_y, accel_z = hub.motion.accelerometer()
            orientation = hub.motion.orientation()
            battery_temp = hub.battery.temperature()
            hub_temp = hub.temperature()
            sup = hub.supervision.info()
            current = sup.get('continuous_current', 0)
            voltage = hub.battery.voltage()
            motor_data = {}
            for port in 'ABCDEF':
                if hasattr(hub.port[port], 'motor'):
                    try:
                        speed, rel_deg, abs_deg, pwm = hub.port[port].motor.get()
                        motor_data[port] = f"{speed},{rel_deg},{abs_deg},{pwm}"
                    except: pass
            motor_str = "|".join([f"{k}:{v}" for k, v in motor_data.items()])
            print(f"SENSORS:{yaw_angle},{pitch_angle},{roll_angle}|{accel_x},{accel_y},{accel_z}|{orientation}|{battery_temp},{hub_temp}|{motor_str}|P:{current},{voltage}")
            for gesture in ['tapped', 'doubletapped', 'shake', 'freefall']:
                if hub.motion.was_gesture(gesture):
                    print(f"GESTURE:{gesture.upper()}")
        except: pass
        utime.sleep_ms(100)
continuous_sensor_loop()
`;
      this.sendPythonCommand(sensorScript);
    }

    _onMessage(params) {
      const message = params.message;
      const data = Base64Util.base64ToUint8Array(message);
      const text = new TextDecoder().decode(data);
      const responses = (this._remainingText + text).split("\r\n");
      this._remainingText = responses.pop();

      for (const responseText of responses) {
        const trimmedText = responseText.trim();
        if (!trimmedText) continue;
        try {
          const json = JSON.parse(trimmedText);
          this._parseResponse(json);
        } catch (error) {
          this._parseData(trimmedText);
        }
      }
    }

    _parseData(dataText) {
      try {
        if (dataText.startsWith("SENSORS:")) {
          const sensorData = dataText.substring(8);
          const parts = sensorData.split("|");
          if (parts.length >= 5) {
            const angles = parts[0].split(",").map(parseFloat);
            if (angles.length === 3)
              this._sensors.angle = {
                yaw: angles[0],
                pitch: angles[1],
                roll: angles[2],
              };
            const accel = parts[1].split(",").map(parseFloat);
            if (accel.length === 3)
              this._sensors.acceleration = {
                x: accel[0],
                y: accel[1],
                z: accel[2],
              };
            this._sensors.orientation = parseInt(parts[2], 10);
            const temps = parts[3].split(",").map(parseFloat);
            if (temps.length >= 2) {
              this._sensors.temperature = temps[0];
              this._sensors.hubTemp = temps[1];
            }
            if (parts[4]) {
              const motorPairs = parts[4].split("|");
              for (const pair of motorPairs) {
                const [port, values] = pair.split(":");
                if (port && values) {
                  const [speed, relDeg, absDeg, pwm] = values
                    .split(",")
                    .map(parseFloat);
                  this._sensors.motorPositions[port] = {
                    speed,
                    relativePosition: relDeg,
                    absolutePosition: absDeg,
                    power: pwm,
                  };
                }
              }
            }
            if (parts.length >= 6 && parts[5].startsWith("P:")) {
              const powerVals = parts[5]
                .substring(2)
                .split(",")
                .map(parseFloat);
              this._sensors.power = {
                current: powerVals[0],
                voltage: powerVals[1],
              };
            }
          }
        } else if (dataText.startsWith("GESTURE:")) {
          const gesture = dataText.substring(8).toLowerCase();
          if (
            Object.prototype.hasOwnProperty.call(
              this._sensors.gestures,
              gesture
            )
          ) {
            this._sensors.gestures[gesture] = true;
            setTimeout(() => {
              this._sensors.gestures[gesture] = false;
            }, 100);
          }
        } else if (dataText.includes("PYTHON_AVAILABLE")) {
          if (!this._pythonAvailable) {
            this._pythonAvailable = true;
            this._initializeContinuousSensorMonitoring();
          }
        } else if (dataText.startsWith("HUBINFO:")) {
          const [firmware, variant] = dataText
            .slice("HUBINFO:".length)
            .split("|");
          this._firmware = firmware || null;
          this._hardwareVariant = variant || null;
        } else if (dataText.startsWith(">>>")) {
          this._replOutput += dataText + "\n";
          if (this._replOutput.length > 1000) {
            this._replOutput = this._replOutput.substring(
              this._replOutput.length - 1000
            );
          }
        }
      } catch (error) {
        console.warn("Error parsing raw data:", error);
      }
    }

    _parseResponse(response) {
      if (Object.prototype.hasOwnProperty.call(response, "m")) {
        switch (response.m) {
          case 0:
            this._parseHubStatus(response);
            break;
          case 2:
            if (response.p && response.p.length >= 2) {
              this._sensors.battery = Math.round(response.p[1]);
            }
            break;
          case 3:
            this._parseButtonEvent(response);
            break;
          case 4:
            this._parseEventResponse(response);
            break;
        }
      }
      if (Object.prototype.hasOwnProperty.call(response, "i")) {
        const openRequest = this._openRequests[response.i];
        delete this._openRequests[response.i];
        if (openRequest) openRequest.resolve();
      }
    }

    _parseHubStatus(response) {
      for (let i = 0; i < 6; i++) {
        const port = SpikePorts[i];
        const deviceId = response.p[i][0];
        const values = response.p[i][1];
        switch (deviceId) {
          case 48:
          case 49:
            this._portValues[port] = {
              type: "motor",
              speed: values[0],
              degreesCounted: values[1],
              position: (values[2] + 360) % 360,
              power: values[3],
              relativePosition: values[1] || 0,
              absolutePosition: values[2] || 0,
            };
            break;
          case 61:
            if (values.length >= 4)
              this._portValues[port] = {
                type: "color",
                color: values[0],
                reflection: values[1],
                ambient: values[2],
                red: values[3] || 0,
                green: values[4] || 0,
                blue: values[5] || 0,
              };
            break;
          case 62:
            this._portValues[port] = {
              type: "distance",
              distance: values[0] === -1 ? 0 : values[0],
            };
            break;
          case 63:
            this._portValues[port] = {
              type: "force",
              force: values[0],
              pressed: values[1] > 0,
            };
            break;
          default:
            this._portValues[port] = { type: "unknown" };
            break;
        }
      }
      if (response.p.length > 8 && response.p[8] && response.p[8].length >= 3) {
        this._sensors.angle = {
          yaw: response.p[8][0],
          pitch: response.p[8][1],
          roll: response.p[8][2],
        };
      }
    }

    _parseButtonEvent(response) {
      if (response.p && response.p.length >= 2) {
        const button = response.p[0];
        const pressed = response.p[1] === 1;
        const buttonIndex = { left: 0, center: 1, right: 2 }[button];
        if (buttonIndex !== undefined)
          this._sensors.buttons[buttonIndex] = pressed ? 1 : 0;
      }
    }

    _parseEventResponse(response) {
      if (Object.prototype.hasOwnProperty.call(SpikeOrientation, response.p)) {
        this._sensors.orientation = SpikeOrientation[response.p];
      }
      const gestureMap = {
        tapped: "tapped",
        doubletapped: "doubletapped",
        shake: "shake",
        freefall: "freefall",
      };
      if (gestureMap[response.p]) {
        this._sensors.gestures[gestureMap[response.p]] = true;
        setTimeout(() => {
          this._sensors.gestures[gestureMap[response.p]] = false;
        }, 100);
      }
    }
  }

  // ============================================================================
  // SPIKE 3 HUB
  //
  // Presents the same surface as SpikePrime (the 2.x REPL hub) so that nothing
  // above has to know which firmware answered: the same getters, the same
  // portValues shape, the same sendPythonCommand/sendCommand pair.
  //
  // The two differences that matter are hidden here rather than pushed upward:
  //
  //   * sendCommand — the 2.x hub takes JSON-RPC ("scratch.motor_run_timed"
  //     and friends). The 3.x hub only implements a subset as native tunnel
  //     commands. Unsupported methods reject with a typed error; transport
  //     errors stay distinct so callers do not launch a second command after a
  //     failed write. A Python TunnelMessage's wire format is documented, but
  //     Python execution compatibility is not established by that framing.
  //
  //   * portValues — the 3.x device notifications carry different units and a
  //     different layout. They are normalised INTO the 2.x shape, including
  //     millimetres to centimetres for the distance sensor, so that a block
  //     written against the 2.x hub reads the same number from either.
  // ============================================================================
  class Spike3Hub {
    constructor(runtime, extensionId) {
      this._runtime = runtime;
      this._extensionId = extensionId;
      this._link = null;
      this._frame = [];
      this._maxPacketSize = 20;
      this._maxMessageSize = 100;
      this._maxChunkSize = 100;
      this._firmware = null;
      this._rpcVersion = null;
      this._streaming = true;
      this._streamingRequested = false;
      this._streamingFallback = null;
      this._pendingNotificationRequest = null;
      this._pendingProtocolResponses = new Map();
      this._pendingControllerCommands = new Map();
      this._controllerStartWaiters = new Set();
      this._controllerCommandId = 0;
      this._controllerCommandQueue = Promise.resolve();
      this._controllerReady = false;
      this._controllerVersion = null;
      this._controllerHeartbeatTimer = null;

      this._rateLimiter = new RateLimiter(BTSendRateMax);
      this._portValues = {};
      this._pixelBrightness = 100;
      this._movementMotors = ["A", "B"];
      this._timer = { start: Date.now(), current: 0 };
      this._volume = 100;
      this._replOutput = "";
      this._replHistory = [];
      this._motorSettings = {
        A: new SpikeMotorSetting(),
        B: new SpikeMotorSetting(),
        C: new SpikeMotorSetting(),
        D: new SpikeMotorSetting(),
        E: new SpikeMotorSetting(),
        F: new SpikeMotorSetting(),
      };
      this._resetSensors();
      this._resetCommunicationDiagnostics();

      this.reset = this.reset.bind(this);
      this._onConnect = this._onConnect.bind(this);
      this._onMessage = this._onMessage.bind(this);

      this._timerInterval = setInterval(() => {
        this._timer.current = (Date.now() - this._timer.start) / 1000;
      }, 10);
    }

    _resetSensors() {
      this._sensors = {
        buttons: [0, 0, 0, 0],
        angle: { pitch: 0, roll: 0, yaw: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
        accelerationFiltered: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        gyroFiltered: { x: 0, y: 0, z: 0 },
        orientation: SpikeOrientation.front,
        faceUp: "top",
        battery: 100,
        temperature: 25,
        hubTemp: 25,
        power: { current: 0, voltage: 0 },
        gestures: {
          tapped: false,
          doubletapped: false,
          shake: false,
          freefall: false,
        },
        motorPositions: {},
      };
    }

    _resetCommunicationDiagnostics({ preserveHistory = false } = {}) {
      const previous = preserveHistory ? this._diagnostics : null;
      const lastKnownControllerVersion =
        previous?.lastKnownControllerVersion ||
        previous?.controllerVersion ||
        null;
      const previousInstallStage =
        previous?.controllerInstallAttempt?.lastSuccessfulStage;
      const controllerMayBeInstalled = Boolean(
        lastKnownControllerVersion ||
          [
            "file-upload-accepted",
            "transfer-chunk-acknowledged",
            "program-upload-complete",
            "program-flow-request-sent",
            "program-flow-response-accepted",
            "program-start-notified",
            "controller-hello-acknowledged",
          ].includes(previousInstallStage)
      );
      this._diagnostics = {
        infoRequest: {
          requestedAt: null,
          requestMessageHex: null,
          requestFrameHex: null,
          requestPacketLengths: [],
          writeAttemptedAt: null,
          writeCompletedAt: null,
          status: "not-requested",
        },
        infoResponseReceivedAt: null,
        infoResponseMessageHex: null,
        infoResponseFrameHex: null,
        infoResponseStatus: null,
        notificationRequest: {
          enabled: false,
          intervalMs: 0,
          status: "not-requested",
          requestedAt: null,
          responseAt: null,
          responseCode: null,
          requestMessageHex: null,
          requestFrameHex: null,
          requestPacketLengths: [],
          writeAttemptedAt: null,
          writeCompletedAt: null,
          responseMessageHex: null,
          responseFrameHex: null,
        },
        lastImuReceivedAt: null,
        imuNotificationCount: 0,
        motorNotificationCount: 0,
        matrix5x5NotificationCount: 0,
        cobsDecodeFailureCount: 0,
        malformedMessageCount: 0,
        malformedNotificationCount: 0,
        unsupportedRecordCount: 0,
        lastCommunicationError: previous?.lastCommunicationError || "",
        controllerStatus: controllerMayBeInstalled
          ? "not-verified"
          : "not-installed",
        controllerVersion: null,
        lastKnownControllerVersion,
        lastControllerResponseAt: null,
        controllerInstallAttempt: previous?.controllerInstallAttempt || null,
        startupProbeRuns: previous?.startupProbeRuns
          ? JSON.parse(JSON.stringify(previous.startupProbeRuns))
          : [],
        lastSuccessfulControllerStage:
          previous?.lastSuccessfulControllerStage || null,
        lastProgramFlowNotification:
          previous?.lastProgramFlowNotification || null,
        lastDisconnect: previous?.lastDisconnect || null,
        disconnectCount: previous?.disconnectCount || 0,
        lastWrite: previous?.lastWrite || null,
        lastTransportError: previous?.lastTransportError || null,
        lastFirmwareVersion: previous?.lastFirmwareVersion || null,
        recentEvents: previous?.recentEvents ? [...previous.recentEvents] : [],
        recentConsoleNotifications: previous?.recentConsoleNotifications
          ? [...previous.recentConsoleNotifications]
          : [],
        recentConsoleOutput: previous?.recentConsoleOutput || "",
      };
      this._matrix5x5 = null;
      this._notificationResponseTimeout = null;
    }

    _clearNotificationResponseTimeout() {
      if (this._notificationResponseTimeout !== null) {
        clearTimeout(this._notificationResponseTimeout);
        this._notificationResponseTimeout = null;
      }
    }

    _recordCommunicationError(error) {
      this._diagnostics.lastCommunicationError =
        error instanceof Error
          ? error.message
          : String(error || "unknown error");
      this._recordDiagnosticEvent("communication-error", {
        message: this._diagnostics.lastCommunicationError,
      });
    }

    _recordDiagnosticEvent(type, details = {}) {
      const events = this._diagnostics.recentEvents;
      events.push({ timestamp: Date.now(), type, ...details });
      if (events.length > 50) events.splice(0, events.length - 50);
    }

    _protocolMessageHex(data) {
      return Array.from(data || [], (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    }

    _recordTransportError(error, messageContext = null) {
      const errorDetails = {
        timestamp: Date.now(),
        name: error?.name || "Error",
        message: error?.message || String(error || "unknown error"),
        stack: error?.stack || "",
        ...(messageContext || {}),
      };
      const previousTransportError = this._diagnostics.lastTransportError;
      if (
        messageContext ||
        !previousTransportError ||
        previousTransportError.message !== errorDetails.message
      ) {
        this._diagnostics.lastTransportError = errorDetails;
      }
      if (messageContext) {
        this._diagnostics.lastWrite = {
          ...(this._diagnostics.lastWrite || {}),
          ...messageContext,
          status: "failed",
          errorName: errorDetails.name,
          errorMessage: errorDetails.message,
          errorStack: errorDetails.stack,
          completedAt: Date.now(),
        };
      }
      this._recordCommunicationError(error);
      this._recordDiagnosticEvent("transport-error", errorDetails);
      const request = this._diagnostics.notificationRequest;
      if (request.status === "pending") {
        request.status = "write-error";
        this._settleNotificationRequest(error);
      }
      for (const [type, pending] of this._pendingProtocolResponses) {
        this._pendingProtocolResponses.delete(type);
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      for (const [id, pending] of this._pendingControllerCommands) {
        this._pendingControllerCommands.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
    }

    _recordControllerInstallStage(stage, successful = false, details = {}) {
      const attempt = this._diagnostics.controllerInstallAttempt;
      if (!attempt) return;
      const timestamp = Date.now();
      attempt.stage = stage;
      attempt.updatedAt = timestamp;
      attempt.stageHistory.push({ stage, timestamp, successful, ...details });
      if (attempt.stageHistory.length > 40) {
        attempt.stageHistory.splice(0, attempt.stageHistory.length - 40);
      }
      if (successful) {
        attempt.lastSuccessfulStage = stage;
        this._diagnostics.lastSuccessfulControllerStage = {
          stage,
          timestamp,
          slot: attempt.slot,
        };
      }
      this._recordDiagnosticEvent("controller-install-stage", {
        stage,
        successful,
        slot: attempt.slot,
        ...details,
      });
    }

    _settleNotificationRequest(error, responseCode = null) {
      const pending = this._pendingNotificationRequest;
      if (!pending) return;
      this._pendingNotificationRequest = null;
      this._clearNotificationResponseTimeout();
      if (error) pending.reject(error);
      else pending.resolve(responseCode);
    }

    _recordMalformedNotification(message) {
      this._diagnostics.malformedNotificationCount++;
      this._recordCommunicationError(message);
    }

    getDiagnostics(connectionMode = "") {
      return {
        protocol: "spike3",
        connected: this.isConnected(),
        connectionMode,
        firmwareVersion: this._firmware,
        rpcVersion: this._rpcVersion,
        infoResponseReceivedAt: this._diagnostics.infoResponseReceivedAt,
        notificationRequest: { ...this._diagnostics.notificationRequest },
        lastImuReceivedAt: this._diagnostics.lastImuReceivedAt,
        imuNotificationCount: this._diagnostics.imuNotificationCount,
        imuReceived: this._diagnostics.lastImuReceivedAt !== null,
        angles: { ...this._sensors.angle },
        motorPorts: Object.fromEntries(
          Object.entries(this._sensors.motorPositions).map(([port, values]) => [
            port,
            { ...values },
          ])
        ),
        motorNotificationCount: this._diagnostics.motorNotificationCount,
        matrix5x5NotificationCount:
          this._diagnostics.matrix5x5NotificationCount,
        lastMatrix5x5: this._matrix5x5 ? [...this._matrix5x5] : null,
        cobsDecodeFailureCount: this._diagnostics.cobsDecodeFailureCount,
        malformedMessageCount: this._diagnostics.malformedMessageCount,
        malformedNotificationCount:
          this._diagnostics.malformedNotificationCount,
        unsupportedRecordCount: this._diagnostics.unsupportedRecordCount,
        controllerStatus: this._diagnostics.controllerStatus,
        controllerVersion: this._diagnostics.controllerVersion,
        lastKnownControllerVersion:
          this._diagnostics.lastKnownControllerVersion,
        lastControllerResponseAt: this._diagnostics.lastControllerResponseAt,
        controllerInstallAttempt: this._diagnostics.controllerInstallAttempt
          ? JSON.parse(
              JSON.stringify(this._diagnostics.controllerInstallAttempt)
            )
          : null,
        lastSuccessfulControllerStage:
          this._diagnostics.lastSuccessfulControllerStage,
        lastProgramFlowNotification:
          this._diagnostics.lastProgramFlowNotification,
        lastDisconnect: this._diagnostics.lastDisconnect,
        disconnectCount: this._diagnostics.disconnectCount,
        lastWrite: this._diagnostics.lastWrite,
        lastTransportError: this._diagnostics.lastTransportError,
        recentConsoleNotifications: [
          ...this._diagnostics.recentConsoleNotifications,
        ],
        recentConsoleOutput: this._diagnostics.recentConsoleOutput,
        recentEvents: [...this._diagnostics.recentEvents],
        startupProbeRuns: JSON.parse(
          JSON.stringify(this._diagnostics.startupProbeRuns || [])
        ),
        lastFirmwareVersion: this._diagnostics.lastFirmwareVersion,
        lastCommunicationError: this._diagnostics.lastCommunicationError,
      };
    }

    get protocol() {
      return "spike3";
    }
    get firmwareVersion() {
      return this._firmware;
    }
    get angle() {
      return this._sensors.angle;
    }
    get orientation() {
      return this._sensors.orientation;
    }
    get faceUp() {
      return this._sensors.faceUp;
    }
    get portValues() {
      return this._portValues;
    }
    get pixelBrightness() {
      return this._pixelBrightness;
    }
    set pixelBrightness(value) {
      this._pixelBrightness = value;
    }
    get motorSettings() {
      return this._motorSettings;
    }
    get acceleration() {
      return this._sensors.acceleration;
    }
    get accelerationFiltered() {
      return this._sensors.accelerationFiltered;
    }
    get gyro() {
      return this._sensors.gyro;
    }
    get gyroFiltered() {
      return this._sensors.gyroFiltered;
    }
    get battery() {
      return this._sensors.battery;
    }
    get temperature() {
      return this._sensors.temperature;
    }
    get hubTemp() {
      return this._sensors.hubTemp;
    }
    get power() {
      return this._sensors.power;
    }
    get gestures() {
      return this._sensors.gestures;
    }
    get movementMotors() {
      return this._movementMotors;
    }
    get timer() {
      return this._timer.current;
    }
    get volume() {
      return this._volume;
    }
    get replOutput() {
      return this._replOutput;
    }
    get replHistory() {
      return this._replHistory;
    }

    attach(link) {
      this._link = link;
    }

    isConnected() {
      return Boolean(this._link && this._link.isConnected());
    }

    disconnect() {
      if (this._link instanceof WebBLELink) {
        this._link.disconnect({ origin: "user-requested" });
      } else {
        if (this._link) this._link.disconnect();
        this.reset({ origin: "user-requested", requested: true });
      }
    }

    reset(details = {}) {
      const disconnect =
        details && typeof details === "object"
          ? details
          : { origin: String(details || "transport-reset") };
      const origin = disconnect.origin || "transport-reset";
      const timestamp = Date.now();
      const messageContext = disconnect.messageContext || null;
      this._diagnostics.disconnectCount++;
      this._diagnostics.lastDisconnect = {
        timestamp,
        origin,
        requested: Boolean(disconnect.requested),
        eventType: disconnect.eventType || null,
        messageContext,
        errorName: disconnect.error?.name || null,
        errorMessage: disconnect.error?.message || null,
        errorStack: disconnect.error?.stack || null,
      };
      this._recordDiagnosticEvent(
        "disconnect",
        this._diagnostics.lastDisconnect
      );
      if (this._firmware) {
        this._diagnostics.lastFirmwareVersion = this._firmware;
      }
      if (disconnect.error) {
        this._recordCommunicationError(disconnect.error);
      } else if (origin === "gattserverdisconnected") {
        this._recordCommunicationError(
          "Web Bluetooth reported gattserverdisconnected"
        );
      }
      const attempt = this._diagnostics.controllerInstallAttempt;
      if (attempt?.outcome === "in-progress") {
        attempt.outcome = "interrupted";
        attempt.finishedAt = timestamp;
        attempt.disconnectOrigin = origin;
        attempt.error = {
          message:
            disconnect.error?.message ||
            `SPIKE hub disconnected during controller installation (${origin})`,
          name: disconnect.error?.name || "HubDisconnectedError",
          stack: disconnect.error?.stack || "",
        };
      }
      const probeRun = this._activeStartupProbe;
      if (probeRun && probeRun.outcome === "running") {
        probeRun.disconnect = {
          timestamp,
          origin,
          requested: Boolean(disconnect.requested),
          errorName: disconnect.error?.name || null,
          errorMessage: disconnect.error?.message || null,
        };
        this._recordDiagnosticEvent("startup-probe-disconnect", {
          probeId: probeRun.probeId,
          slot: probeRun.slot,
          origin,
        });
        for (const waiter of Object.values(probeRun.flowWaiters || {})) {
          clearTimeout(waiter.timeout);
          waiter.resolve(null);
        }
        probeRun.flowWaiters = {};
      }
      for (const waiter of this._controllerStartWaiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(
          Object.assign(
            new Error(
              t(
                "hubDisconnectedBeforeControllerStart",
                t(`diag.disconnectOrigin.${origin}`)
              )
            ),
            {
              code: "ERR_HUB_DISCONNECTED_BEFORE_CONTROLLER_START",
              disconnectOrigin: origin,
            }
          )
        );
      }
      this._controllerStartWaiters.clear();
      for (const waiter of this._infoResponseWaiters || []) {
        waiter.reject?.(
          new Error(
            `SPIKE hub disconnected while waiting for InfoResponse (${origin})`
          )
        );
      }
      this._infoResponseWaiters = [];
      this._clearNotificationResponseTimeout();
      if (this._pendingNotificationRequest) {
        this._pendingNotificationRequest.request.status = "disconnected";
        this._settleNotificationRequest(
          new Error("disconnected while awaiting device notification response")
        );
      }
      if (this._streamingFallback !== null) {
        clearTimeout(this._streamingFallback);
        this._streamingFallback = null;
      }
      this._streamingRequested = false;
      this._controllerReady = false;
      this._controllerVersion = null;
      this._diagnostics.controllerStatus = "disconnected";
      if (this._diagnostics.controllerVersion) {
        this._diagnostics.lastKnownControllerVersion =
          this._diagnostics.controllerVersion;
      }
      if (this._controllerHeartbeatTimer !== null) {
        clearInterval(this._controllerHeartbeatTimer);
        this._controllerHeartbeatTimer = null;
      }
      for (const pending of this._pendingProtocolResponses.values()) {
        clearTimeout(pending.timeout);
        pending.reject(
          Object.assign(
            new Error(
              t(
                "hubDisconnectedDuringControllerCommand",
                t(`diag.disconnectOrigin.${origin}`)
              )
            ),
            { code: "ERR_HUB_DISCONNECTED", disconnectOrigin: origin }
          )
        );
      }
      this._pendingProtocolResponses.clear();
      for (const pending of this._pendingControllerCommands.values()) {
        clearTimeout(pending.timeout);
        pending.reject(
          Object.assign(
            new Error(
              t(
                "hubDisconnectedDuringControllerCommand",
                t(`diag.disconnectOrigin.${origin}`)
              )
            ),
            { code: "ERR_HUB_DISCONNECTED", disconnectOrigin: origin }
          )
        );
      }
      this._pendingControllerCommands.clear();
      if (this._diagnostics.notificationRequest.status !== "write-error") {
        this._diagnostics.notificationRequest.status = "disconnected";
      }
      this._frame = [];
      this._portValues = {};
      this._resetSensors();
      this._timer.start = Date.now();
      this._timer.current = 0;
      this._replOutput = "";
      this._replHistory = [];
      this._firmware = null;
      this._rpcVersion = null;
    }

    stopAll() {
      if (!this.isConnected()) {
        return Promise.reject(this._notConnectedError());
      }
      return this._sendControllerCommand("controller.stop_all");
    }

    stopSound() {
      return this._sendControllerCommand("sound.stop");
    }

    stopAllMotors() {
      return this._sendControllerCommand("controller.stop_all");
    }

    // ------------------------------------------------------------------ send

    /**
     * Translate only known Scratch operations to the uploaded controller's
     * explicit command whitelist. A successful BLE write alone is not treated
     * as a successful hub operation; every command waits for a controller ack.
     */
    sendCommand(method, params) {
      const p = params || {};
      const port = String(p.port || "").toUpperCase();
      if (port && !SpikePorts.includes(port)) {
        return Promise.reject(
          this._unsupportedError(`invalid motor port ${port}`)
        );
      }
      const velocity = (value) =>
        Math.max(-720, Math.min(720, Math.round(this._speed(value) * 7.2)));

      switch (method) {
        case "scratch.motor_start":
        case "scratch.motor_set_speed":
          return this._sendTunnelJSON({
            cmd: "motor.run",
            port,
            velocity: velocity(p.speed),
          });
        case "scratch.motor_stop":
          if (p.stop && String(p.stop).toLowerCase() !== "brake") {
            const error = new Error(t("controllerUnsupportedStopAction"));
            error.code = "ERR_UNSUPPORTED_HUB_COMMAND";
            this._recordCommunicationError(error);
            return Promise.reject(error);
          }
          return this._sendTunnelJSON({ cmd: "motor.stop", port });
        case "scratch.motor_power":
          return this._sendTunnelJSON({
            cmd: "motor.power",
            port,
            power: Math.max(
              -10000,
              Math.min(10000, Math.round(Number(p.power)))
            ),
          });
        case "scratch.motor_run_for_degrees":
          return this._sendTunnelJSON({
            cmd: "motor.run_degrees",
            port,
            degrees: Math.max(
              -36000,
              Math.min(36000, Math.trunc(Number(p.degrees) || 0))
            ),
            velocity: velocity(p.speed),
          });
        case "scratch.motor_run_timed":
          return this._sendTunnelJSON({
            cmd: "motor.run_time",
            port,
            duration_ms: Math.max(
              1,
              Math.min(60000, Math.trunc(Number(p.time) || 1))
            ),
            velocity: velocity(p.speed),
          });
        case "scratch.motor_run_to_position":
          return this._sendTunnelJSON({
            cmd: "motor.run_to_position",
            port,
            position: Math.max(
              -36000,
              Math.min(36000, Math.trunc(Number(p.position) || 0))
            ),
            velocity: Math.max(1, Math.abs(velocity(p.speed))),
          });
        case "scratch.display_set_pixel":
          return this._sendTunnelJSON({
            cmd: "matrix.pixel",
            x: Math.trunc(Number(p.x)),
            y: Math.trunc(Number(p.y)),
            brightness: Math.max(
              0,
              Math.min(100, Math.round(Number(p.brightness) * (100 / 9)))
            ),
          });
        case "scratch.display_clear":
          return this._sendTunnelJSON({ cmd: "matrix.clear" });
        case "scratch.display_pattern": {
          const pixels = String(p.pixels || "")
            .replace(/\D/g, "")
            .padEnd(25, "0")
            .slice(0, 25)
            .split("")
            .map((pixel) => (pixel === "0" ? 0 : 100));
          return this._sendTunnelJSON({ cmd: "matrix.pattern", pixels });
        }
        case "scratch.display_text": {
          if (
            typeof p.text !== "string" ||
            new TextEncoder().encode(p.text).length > 32
          ) {
            return Promise.reject(
              this._unsupportedError(
                "text must be a string of at most 32 UTF-8 bytes"
              )
            );
          }
          return this._sendTunnelJSON({ cmd: "matrix.text", text: p.text });
        }
        case "scratch.sound_beep":
          return this._sendTunnelJSON({
            cmd: "sound.beep",
            frequency: Math.trunc(Number(p.frequency)),
            duration_ms: Math.trunc(Number(p.duration)),
          });
        default:
          return Promise.reject(
            this._unsupportedError(
              `SPIKE 3.x controller does not support ${method}`
            )
          );
      }
    }

    _speed(value) {
      const n = Number(value);
      return Math.max(
        -100,
        Math.min(100, Math.round(Number.isFinite(n) ? n : 0))
      );
    }

    _sendTunnelJSON(command) {
      return this._enqueueControllerCommand(command.cmd, command);
    }

    _notConnectedError() {
      const error = new Error(t("notConnected"));
      error.code = "ERR_HUB_NOT_CONNECTED";
      return error;
    }

    _unsupportedError(message) {
      const error = new Error(`${t("controllerUnsupported")}: ${message}`);
      error.code = "ERR_UNSUPPORTED_HUB_COMMAND";
      this._recordCommunicationError(error);
      return error;
    }

    _sendTunnelPayload(payload) {
      if (!this.isConnected()) return Promise.reject(this._notConnectedError());
      const bytes = new TextEncoder().encode(payload);
      if (bytes.length > 0xffff) {
        return Promise.reject(
          this._unsupportedError("TunnelMessage is too large")
        );
      }
      const message = new Uint8Array(3 + bytes.length);
      message[0] = SPIKE3.TUNNEL;
      message[1] = bytes.length & 0xff;
      message[2] = (bytes.length >> 8) & 0xff;
      message.set(bytes, 3);
      if (
        this._link?.kind === "gatt" &&
        message.length > this._maxMessageSize
      ) {
        return Promise.reject(
          this._unsupportedError(
            `controller message exceeds the negotiated BLE message size (${this._maxMessageSize})`
          )
        );
      }
      return this._send(message, true);
    }

    _enqueueControllerCommand(commandName, fields, allowNotReady = false) {
      const run = () =>
        this._sendControllerCommand(commandName, fields, allowNotReady);
      const pending = this._controllerCommandQueue.then(run, run);
      this._controllerCommandQueue = pending.catch(() => {});
      return pending;
    }

    _sendControllerCommand(commandName, fields = {}, allowNotReady = false) {
      if (!this.isConnected()) return Promise.reject(this._notConnectedError());
      if (!allowNotReady && !this._controllerReady) {
        const error = new Error(t("controllerNotReady"));
        error.code = "ERR_CONTROLLER_NOT_READY";
        this._recordCommunicationError(error);
        return Promise.reject(error);
      }
      const requestId = ++this._controllerCommandId;
      const command = this._encodeControllerCommand(
        commandName,
        fields,
        requestId
      );
      if (commandName === "matrix.text") {
        this._recordDiagnosticEvent("controller-text-request", { requestId });
      }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            if (!this._pendingControllerCommands.has(requestId)) return;
            this._pendingControllerCommands.delete(requestId);
            const error = new Error(t("controllerTimeout"));
            error.code = "ERR_CONTROLLER_TIMEOUT";
            this._controllerReady = false;
            this._diagnostics.controllerStatus = "timeout";
            this._recordCommunicationError(error);
            reject(error);
          },
          commandName === "matrix.text" ? 60000 : 4000
        );
        this._pendingControllerCommands.set(requestId, {
          resolve,
          reject,
          timeout,
          commandName,
        });
        this._sendTunnelPayload(JSON.stringify(command)).catch((error) => {
          const pending = this._pendingControllerCommands.get(requestId);
          if (!pending) return;
          this._pendingControllerCommands.delete(requestId);
          clearTimeout(pending.timeout);
          this._recordTransportError(error);
          reject(error);
        });
      });
    }

    _encodeControllerCommand(commandName, fields, requestId) {
      const commandCodes = {
        "controller.hello": "h",
        "controller.ping": "p",
        "controller.stop_all": "x",
        "motor.run": "r",
        "motor.stop": "s",
        "motor.power": "u",
        "motor.run_degrees": "d",
        "motor.run_time": "t",
        "motor.run_to_position": "a",
        "matrix.pixel": "l",
        "matrix.pattern": "m",
        "matrix.text": "w",
        "matrix.clear": "c",
        "sound.beep": "b",
        "sound.stop": "q",
      };
      const fieldCodes = {
        port: "p",
        velocity: "v",
        degrees: "d",
        duration_ms: "t",
        position: "g",
        power: "u",
        x: "x",
        y: "y",
        brightness: "b",
        pixels: "z",
        ["text"]: "t",
        frequency: "f",
      };
      const code = commandCodes[commandName];
      if (!code)
        throw this._unsupportedError(
          `unsupported controller command ${commandName}`
        );
      const encoded = { i: requestId, c: code };
      for (const [key, value] of Object.entries(fields)) {
        if (key === "cmd") continue;
        const fieldCode = fieldCodes[key];
        if (!fieldCode)
          throw this._unsupportedError(`unsupported controller field ${key}`);
        encoded[fieldCode] =
          key === "pixels" && Array.isArray(value)
            ? value.map((pixel) => (Number(pixel) > 0 ? "9" : "0")).join("")
            : value;
      }
      return encoded;
    }

    _handleTunnelMessage(data) {
      if (data.length < 3) {
        this._recordCommunicationError("truncated TunnelMessage header");
        return;
      }
      const payloadSize = data[1] | (data[2] << 8);
      if (payloadSize !== data.length - 3) {
        this._recordCommunicationError(
          `TunnelMessage payload size mismatch: expected ${payloadSize}, received ${data.length - 3}`
        );
        return;
      }
      let response;
      try {
        response = JSON.parse(new TextDecoder().decode(data.slice(3)).trim());
      } catch (error) {
        this._recordCommunicationError(
          `invalid controller response JSON: ${error.message}`
        );
        return;
      }
      if (!response || typeof response !== "object") {
        this._recordCommunicationError("controller response must be an object");
        return;
      }
      if (response.c === "o" || response.event === "pong") {
        this._lastControllerPongAt = Date.now();
        this._diagnostics.lastControllerResponseAt = this._lastControllerPongAt;
        return;
      }
      const requestId = response.i ?? response.request_id;
      const pending = this._pendingControllerCommands.get(requestId);
      if (!pending) {
        if (response.ok === false) {
          this._recordCommunicationError(
            `${response.error?.code || response.error || "controller_error"}: ${response.error?.message || response.detail || "unknown controller error"}`
          );
        }
        return;
      }
      this._pendingControllerCommands.delete(requestId);
      clearTimeout(pending.timeout);
      if (response.ok !== true) {
        const detail =
          response.error?.message ||
          response.detail ||
          "controller rejected the command";
        const error = new Error(`${t("controllerCommandFailed")}: ${detail}`);
        error.code =
          response.error?.code || response.error || "ERR_CONTROLLER_COMMAND";
        this._recordCommunicationError(`${error.message} (${detail})`);
        if (pending.commandName === "matrix.text") {
          this._recordDiagnosticEvent("controller-text-failed", {
            requestId,
            error: error.code,
          });
        }
        pending.reject(error);
        return;
      }
      const result =
        response.result === "bw-spike-1" &&
        pending.commandName === "controller.hello"
          ? { protocol: "brickwright-spike-controller", version: 1 }
          : response.result || {};
      if (
        pending.commandName === "controller.hello" &&
        result.protocol === "brickwright-spike-controller" &&
        result.version === 1
      ) {
        this._controllerReady = true;
        this._controllerVersion = `${result.protocol}/${result.version}`;
        this._diagnostics.controllerStatus = "ready";
        this._diagnostics.controllerVersion = this._controllerVersion;
        this._diagnostics.lastKnownControllerVersion = this._controllerVersion;
        this._recordDiagnosticEvent("controller-hello-acknowledged", {
          version: this._controllerVersion,
          requestId,
        });
        this._startControllerHeartbeat();
        const attempt = this._diagnostics.controllerInstallAttempt;
        if (attempt?.outcome === "in-progress") {
          this._recordControllerInstallStage(
            "controller-hello-acknowledged",
            true
          );
          attempt.outcome = "ready";
          attempt.finishedAt = Date.now();
        }
      }
      this._diagnostics.lastControllerResponseAt = Date.now();
      if (pending.commandName === "matrix.text") {
        this._recordDiagnosticEvent("controller-text-completed", { requestId });
      }
      pending.resolve(result);
    }

    _startControllerHeartbeat() {
      if (this._controllerHeartbeatTimer !== null) {
        clearInterval(this._controllerHeartbeatTimer);
      }
      this._controllerHeartbeatTimer = setInterval(() => {
        if (!this.isConnected() || !this._controllerReady) return;
        this._sendTunnelPayload(JSON.stringify({ c: "p" })).catch((error) =>
          this._recordTransportError(error)
        );
      }, 1000);
    }

    _requestHubResponse(
      message,
      responseType,
      timeoutMs = 5000,
      diagnosticRecord = null
    ) {
      if (!this.isConnected()) return Promise.reject(this._notConnectedError());
      if (this._pendingProtocolResponses.has(responseType)) {
        return Promise.reject(
          this._unsupportedError("another request for this response is pending")
        );
      }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const pending = this._pendingProtocolResponses.get(responseType);
          if (!pending) return;
          this._pendingProtocolResponses.delete(responseType);
          const error = new Error(
            `Hub protocol response 0x${responseType.toString(16)} timed out`
          );
          error.code = "ERR_HUB_PROTOCOL_TIMEOUT";
          this._recordCommunicationError(error);
          reject(error);
        }, timeoutMs);
        this._pendingProtocolResponses.set(responseType, {
          resolve,
          reject,
          timeout,
          diagnosticRecord,
        });
        this._send(message, true, diagnosticRecord).catch((error) => {
          const pending = this._pendingProtocolResponses.get(responseType);
          if (!pending) return;
          this._pendingProtocolResponses.delete(responseType);
          clearTimeout(pending.timeout);
          reject(error);
        });
      });
    }

    _handleProtocolResponse(data, wireFrame = null) {
      const pending = this._pendingProtocolResponses.get(data[0]);
      if (!pending) return false;
      this._pendingProtocolResponses.delete(data[0]);
      clearTimeout(pending.timeout);
      if (pending.diagnosticRecord) {
        pending.diagnosticRecord.responseMessageHex =
          this._protocolMessageHex(data);
        pending.diagnosticRecord.responseFrameHex = wireFrame
          ? this._protocolMessageHex(wireFrame)
          : null;
        pending.diagnosticRecord.responseAt = Date.now();
      }
      if (data.length !== 2) {
        const error = new Error(
          `invalid protocol response length for 0x${data[0].toString(16)}: expected 2, received ${data.length}`
        );
        this._recordCommunicationError(error);
        pending.reject(error);
      } else {
        if (
          data[0] === SPIKE3.PROGRAM_FLOW_RESPONSE &&
          data[1] === 0 &&
          this._diagnostics.controllerInstallAttempt?.outcome === "in-progress"
        ) {
          this._diagnostics.controllerStatus = "starting";
          this._recordControllerInstallStage(
            "program-flow-response-accepted",
            true
          );
        }
        pending.resolve({
          ok: data[1] === 0,
          status: data[1],
          receivedAt: Date.now(),
          protocolMessageHex: this._protocolMessageHex(data),
          wireFrameHex: wireFrame ? this._protocolMessageHex(wireFrame) : null,
        });
        if (pending.diagnosticRecord) {
          pending.diagnosticRecord.responseFrameHex = wireFrame
            ? this._protocolMessageHex(wireFrame)
            : null;
        }
      }
      return true;
    }

    _crc32(data, seed = 0) {
      const paddedLength = Math.ceil(data.length / 4) * 4;
      let crc = (seed ^ 0xffffffff) >>> 0;
      for (let i = 0; i < paddedLength; i++) {
        const byte = i < data.length ? data[i] : 0;
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    _buildClearSlotRequest(slot) {
      return Uint8Array.from([SPIKE3.CLEAR_SLOT_REQUEST, slot]);
    }

    _buildStartFileUploadRequest(fileName, slot, crc) {
      const encodedName = new TextEncoder().encode(fileName);
      if (encodedName.length > 31) {
        throw new RangeError("UTF-8 encoded program filename exceeds 31 bytes");
      }
      const message = new Uint8Array(1 + encodedName.length + 1 + 1 + 4);
      message[0] = SPIKE3.START_FILE_UPLOAD_REQUEST;
      message.set(encodedName, 1);
      // The zero-initialized byte after the name is its NUL terminator.
      const slotOffset = 1 + encodedName.length + 1;
      message[slotOffset] = slot;
      new DataView(message.buffer).setUint32(slotOffset + 1, crc, true);
      return message;
    }

    _buildTransferChunkRequest(runningCrc, chunk) {
      if (chunk.length > 0xffff) {
        throw new RangeError("TransferChunk payload exceeds uint16 size");
      }
      const message = new Uint8Array(7 + chunk.length);
      message[0] = SPIKE3.TRANSFER_CHUNK_REQUEST;
      const view = new DataView(message.buffer);
      view.setUint32(1, runningCrc, true);
      view.setUint16(5, chunk.length, true);
      message.set(chunk, 7);
      return message;
    }

    _buildProgramFlowRequest(stop, slot) {
      return Uint8Array.from([SPIKE3.PROGRAM_FLOW_REQUEST, stop ? 1 : 0, slot]);
    }

    async _waitForInfoResponse(timeoutMs = 3000) {
      if (this._diagnostics.infoResponseReceivedAt !== null) return;
      await new Promise((resolve, reject) => {
        let waiter;
        const timeout = setTimeout(() => {
          this._infoResponseWaiters = (this._infoResponseWaiters || []).filter(
            (candidate) => candidate !== waiter
          );
          reject(new Error("Hub InfoResponse timed out"));
        }, timeoutMs);
        this._infoResponseWaiters = this._infoResponseWaiters || [];
        waiter = {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        };
        this._infoResponseWaiters.push(waiter);
      });
    }

    _waitForControllerStart(attempt, timeoutMs) {
      const complete = () => {
        if (attempt.programFlowStoppedAt) {
          const consoleOutput = this._diagnostics.recentConsoleOutput;
          const error = Object.assign(
            new Error(
              `${t("controllerStoppedBeforeReady")}${consoleOutput ? `: ${consoleOutput}` : ""}`
            ),
            { code: "ERR_CONTROLLER_STOPPED_BEFORE_READY" }
          );
          attempt.outcome = "startup-error";
          attempt.finishedAt = Date.now();
          this._diagnostics.controllerStatus = "startup-error";
          attempt.stage = "program-stopped-before-handshake";
          attempt.updatedAt = Date.now();
          this._recordDiagnosticEvent("controller-start-failed", {
            slot: attempt.slot,
            reason: "program-stopped-before-handshake",
            consoleOutput,
          });
          return Promise.reject(error);
        }
        if (attempt.programFlowStartedAt) {
          this._recordControllerInstallStage("program-start-notified", true);
          return Promise.resolve({
            timestamp: attempt.programFlowStartedAt,
            action: "start",
          });
        }
        if (!this.isConnected()) {
          const origin = this._diagnostics.lastDisconnect?.origin || "unknown";
          return Promise.reject(
            Object.assign(
              new Error(
                t(
                  "hubDisconnectedBeforeControllerStart",
                  t(`diag.disconnectOrigin.${origin}`)
                )
              ),
              {
                code: "ERR_HUB_DISCONNECTED_BEFORE_CONTROLLER_START",
                disconnectOrigin: origin,
              }
            )
          );
        }
        return null;
      };
      const completed = complete();
      if (completed) return completed;

      return new Promise((resolve, reject) => {
        const waiter = {
          attempt,
          timeout: null,
          resolve: (notification) => {
            this._controllerStartWaiters.delete(waiter);
            clearTimeout(waiter.timeout);
            this._recordControllerInstallStage("program-start-notified", true);
            resolve(notification);
          },
          reject: (error) => {
            this._controllerStartWaiters.delete(waiter);
            clearTimeout(waiter.timeout);
            reject(error);
          },
        };
        waiter.timeout = setTimeout(() => {
          if (!this._controllerStartWaiters.delete(waiter)) return;
          const error = Object.assign(
            new Error(t("controllerStartNotificationTimeout")),
            { code: "ERR_CONTROLLER_START_NOTIFICATION_TIMEOUT" }
          );
          attempt.outcome = "not-verified";
          attempt.finishedAt = Date.now();
          attempt.stage = "start-notification-timeout";
          attempt.updatedAt = Date.now();
          this._diagnostics.controllerStatus = "not-verified";
          this._recordCommunicationError(error);
          reject(error);
        }, timeoutMs);
        this._controllerStartWaiters.add(waiter);
      });
    }

    probeController() {
      if (!this.isConnected()) return Promise.reject(this._notConnectedError());
      this._diagnostics.controllerStatus = "checking";
      return this._enqueueControllerCommand("controller.hello", {}, true)
        .then((result) => {
          if (
            result.protocol !== "brickwright-spike-controller" ||
            result.version !== 1
          ) {
            throw new Error("Hub controller returned an incompatible version");
          }
          return result;
        })
        .catch((error) => {
          this._controllerReady = false;
          this._diagnostics.controllerStatus = this.isConnected()
            ? this._diagnostics.controllerInstallAttempt?.outcome ===
              "startup-error"
              ? "startup-error"
              : error?.code === "ERR_CONTROLLER_TIMEOUT"
                ? "timeout"
                : "error"
            : "disconnected";
          this._recordCommunicationError(error);
          throw error;
        });
    }

    async _handshakeStartedController(attempt) {
      const marker = "BWCTRL:boot:tunnel-callback-registered";
      const observed = () =>
        this._diagnostics.recentConsoleNotifications
          .filter((entry) => entry.timestamp >= attempt.startedAt)
          .map((entry) => entry.text)
          .join("")
          .includes(marker);
      if (!observed()) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            attempt.callbackReadyWaiter = null;
            resolve();
          }, 1000);
          attempt.callbackReadyWaiter = () => {
            if (!observed()) return;
            clearTimeout(timer);
            attempt.callbackReadyWaiter = null;
            resolve();
          };
        });
      }
      attempt.callbackReadyObserved = observed();
      for (let number = 1; number <= 3; number++) {
        if (
          attempt.programFlowStoppedAt ||
          attempt.outcome === "startup-error"
        ) {
          throw Object.assign(new Error(t("controllerStoppedBeforeReady")), {
            code: "ERR_CONTROLLER_STOPPED_BEFORE_READY",
          });
        }
        if (!this.isConnected()) throw this._notConnectedError();
        this._recordDiagnosticEvent("controller-hello-attempt", {
          number,
          callbackReadyObserved: attempt.callbackReadyObserved,
        });
        try {
          return await this.probeController();
        } catch (error) {
          if (error?.code !== "ERR_CONTROLLER_TIMEOUT" || number === 3) {
            throw error;
          }
        }
      }
    }

    async installController(slot) {
      if (!this.isConnected()) throw this._notConnectedError();
      if (!Number.isInteger(slot) || slot < 0 || slot > 19) {
        throw this._unsupportedError(
          "program slot must be an integer from 0 to 19"
        );
      }
      if (this._link?.kind !== "gatt") {
        throw this._unsupportedError(
          "controller installation requires BLE GATT"
        );
      }
      this._diagnostics.controllerStatus = "installing";
      this._controllerReady = false;
      const attempt = {
        slot,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        stage: "waiting-info-response",
        outcome: "in-progress",
        lastSuccessfulStage: null,
        stageHistory: [],
        transferredBytes: 0,
        startNotificationTimeoutMs:
          SPIKE3.CONTROLLER_START_NOTIFICATION_TIMEOUT_MS,
      };
      this._diagnostics.controllerInstallAttempt = attempt;
      this._recordControllerInstallStage("waiting-info-response");
      try {
        await this._waitForInfoResponse();
        this._recordControllerInstallStage("info-response-received", true);
        const program = new TextEncoder().encode(SPIKE3_CONTROLLER_SOURCE);
        const clear = await this._requestHubResponse(
          this._buildClearSlotRequest(slot),
          SPIKE3.CLEAR_SLOT_RESPONSE
        );
        // The official example permits a non-acknowledged clear because the
        // slot may already be empty. The user has confirmed this exact slot.
        void clear;
        this._recordControllerInstallStage(
          "slot-clear-response-received",
          true,
          {
            acknowledged: clear.ok,
          }
        );
        const upload = this._buildStartFileUploadRequest(
          "program.py",
          slot,
          this._crc32(program)
        );
        const startUpload = await this._requestHubResponse(
          upload,
          SPIKE3.START_FILE_UPLOAD_RESPONSE
        );
        if (!startUpload.ok)
          throw new Error("Hub rejected StartFileUploadRequest");
        this._recordControllerInstallStage("file-upload-accepted", true);

        let runningCrc = 0;
        for (
          let offset = 0;
          offset < program.length;
          offset += this._maxChunkSize
        ) {
          const chunk = program.slice(offset, offset + this._maxChunkSize);
          runningCrc = this._crc32(chunk, runningCrc);
          const request = this._buildTransferChunkRequest(runningCrc, chunk);
          const response = await this._requestHubResponse(
            request,
            SPIKE3.TRANSFER_CHUNK_RESPONSE
          );
          if (!response.ok) {
            throw new Error(`Hub rejected program chunk at byte ${offset}`);
          }
          attempt.transferredBytes += chunk.length;
          this._recordControllerInstallStage(
            "transfer-chunk-acknowledged",
            true,
            {
              offset,
              chunkLength: chunk.length,
              transferredBytes: attempt.transferredBytes,
              totalBytes: program.length,
            }
          );
        }
        this._recordControllerInstallStage("program-upload-complete", true, {
          totalBytes: program.length,
        });

        const started = await this._requestHubResponse(
          this._buildProgramFlowRequest(false, slot),
          SPIKE3.PROGRAM_FLOW_RESPONSE
        );
        if (!started.ok) throw new Error("Hub rejected ProgramFlowRequest");
        this._diagnostics.controllerStatus = "starting";
        if (attempt.lastSuccessfulStage !== "program-flow-response-accepted") {
          this._recordControllerInstallStage(
            "program-flow-response-accepted",
            true
          );
        }
        await this._waitForControllerStart(
          attempt,
          SPIKE3.CONTROLLER_START_NOTIFICATION_TIMEOUT_MS
        );
        if (
          attempt.outcome === "startup-error" ||
          attempt.programFlowStoppedAt
        ) {
          throw Object.assign(new Error(t("controllerStoppedBeforeReady")), {
            code: "ERR_CONTROLLER_STOPPED_BEFORE_READY",
          });
        }
        if (!this.isConnected()) {
          const origin = this._diagnostics.lastDisconnect?.origin || "unknown";
          throw Object.assign(
            new Error(
              t(
                "hubDisconnectedAfterProgramStart",
                t(`diag.disconnectOrigin.${origin}`)
              )
            ),
            {
              code: "ERR_HUB_DISCONNECTED_AFTER_PROGRAM_START",
              disconnectOrigin: origin,
            }
          );
        }
        return await this._handshakeStartedController(attempt);
      } catch (error) {
        this._controllerReady = false;
        if (attempt.outcome === "in-progress") {
          attempt.outcome = "failed";
          attempt.finishedAt = Date.now();
          attempt.error = {
            name: error?.name || "Error",
            message: error?.message || String(error),
            stack: error?.stack || "",
          };
        }
        if (error?.code === "ERR_CONTROLLER_START_NOTIFICATION_TIMEOUT") {
          this._diagnostics.controllerStatus = "not-verified";
        } else if (error?.code === "ERR_CONTROLLER_STOPPED_BEFORE_READY") {
          this._diagnostics.controllerStatus = "startup-error";
        } else if (!this.isConnected()) {
          this._diagnostics.controllerStatus = "disconnected";
        } else if (attempt.outcome !== "not-verified") {
          this._diagnostics.controllerStatus = "error";
        }
        this._recordCommunicationError(error);
        throw error;
      }
    }

    _waitForStartupProbeNotification(
      run,
      action,
      timeoutMs,
      afterTimestamp = run.startedAt
    ) {
      const existing = run.notifications.flow.find(
        (item) => item.action === action && item.timestamp >= afterTimestamp
      );
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve) => {
        const key = `${action}:${afterTimestamp}:${Math.random()}`;
        const waiter = {
          action,
          afterTimestamp,
          timeout: setTimeout(() => {
            delete run.flowWaiters[key];
            resolve(null);
          }, timeoutMs),
          resolve: (notification) => {
            clearTimeout(waiter.timeout);
            delete run.flowWaiters[key];
            resolve(notification);
          },
        };
        run.flowWaiters[key] = waiter;
      });
    }

    _finishStartupProbeRun(run, outcome, reason) {
      run.outcome = outcome;
      run.reason = reason;
      run.finalStage = run.stage;
      run.finishedAt = Date.now();
      run.transferResponses.infoRequest = JSON.parse(
        JSON.stringify(this._diagnostics.infoRequest)
      );
      run.transferResponses.notificationRequest = JSON.parse(
        JSON.stringify(this._diagnostics.notificationRequest)
      );
      run.runtimeMs = run.finishedAt - run.startedAt;
      const stageMarkers = run.pythonExecution.stageMarkers;
      const allPythonStagesObserved =
        stageMarkers.length > 0 &&
        run.pythonExecution.stageOrderValid &&
        stageMarkers.every((stage) => stage.receivedAt !== null);
      run.pythonExecution.status =
        stageMarkers.length === 0
          ? "not-instrumented"
          : !run.pythonExecution.stageOrderValid
            ? "out-of-order"
            : allPythonStagesObserved
              ? "completed"
              : run.executionStartedAt !== null
                ? "started"
                : stageMarkers.some((stage) => stage.receivedAt !== null)
                  ? "partial"
                  : "not-observed";
      run.pythonExecution.allStagesObserved = allPythonStagesObserved;
      const observedStageCount = stageMarkers.filter(
        (stage) => stage.receivedAt !== null
      ).length;
      run.consoleObservation = {
        status:
          observedStageCount > 0
            ? "probe-markers-observed"
            : run.consoleOutput.length > 0
              ? "notifications-without-probe-markers"
              : "no-console-notifications",
        notificationCount: run.consoleOutput.length,
        probeMarkerCount: observedStageCount,
        interpretation:
          observedStageCount > 0
            ? "At least one per-run Python marker arrived over ConsoleNotification."
            : run.consoleOutput.length > 0
              ? "ConsoleNotification arrived, but no marker for this probe was found. This does not show whether the Python markers were emitted."
              : "No ConsoleNotification was observed. Python execution and console delivery cannot be distinguished from this alone.",
      };
      run.executionDurationMs =
        run.executionStartedAt !== null && run.executionFinishedAt !== null
          ? run.executionFinishedAt - run.executionStartedAt
          : null;
      run.flowNotificationOrder =
        !run.notifications.start || !run.notifications.stop
          ? "incomplete"
          : run.notifications.stop.timestamp >=
              run.notifications.start.timestamp
            ? "start-then-stop"
            : "stop-before-start";
      run.programFlowDurationMs =
        run.flowNotificationOrder === "start-then-stop"
          ? run.notifications.stop.timestamp - run.notifications.start.timestamp
          : null;
      run.runtimeMsMeaning =
        "Total diagnostic duration from request start through final result; includes info wait, slot clear, transfer, and observation.";
      run.stage = "finished";
      this._recordDiagnosticEvent("startup-probe-finished", {
        probeId: run.probeId,
        slot: run.slot,
        outcome,
        reason,
        runtimeMs: run.runtimeMs,
      });
      if (this._activeStartupProbe === run) this._activeStartupProbe = null;
      return JSON.parse(JSON.stringify(run));
    }

    async runStartupProbe(
      probeId,
      slot,
      { observationMs = 3000, startTimeoutMs = 7000, stopTimeoutMs = 3000 } = {}
    ) {
      const probe = SPIKE_STARTUP_PROBES[String(probeId)];
      if (!probe || !Number.isInteger(slot) || slot < 0 || slot > 19) {
        throw this._unsupportedError("unknown startup probe or invalid slot");
      }
      if (!this.isConnected()) throw this._notConnectedError();
      if (this._link?.kind !== "gatt") {
        throw this._unsupportedError("startup probes require BLE GATT");
      }
      if (
        this._activeStartupProbe ||
        this._diagnostics.controllerInstallAttempt?.outcome === "in-progress"
      ) {
        throw this._unsupportedError(
          "another SPIKE program operation is active"
        );
      }

      const boundedDuration = (value, fallback, max) => {
        const number = Number(value);
        return Number.isFinite(number)
          ? Math.max(0, Math.min(max, Math.trunc(number)))
          : fallback;
      };
      observationMs = boundedDuration(observationMs, 3000, 30000);
      startTimeoutMs = boundedDuration(startTimeoutMs, 7000, 30000);
      stopTimeoutMs = boundedDuration(stopTimeoutMs, 3000, 30000);

      const startedAt = Date.now();
      const runId = String(startedAt);
      const source = probe.source.replaceAll("__RUN_ID__", runId);
      const program = new TextEncoder().encode(source);
      const stageMarkers = (probe.pythonStages || []).map((stage) => ({
        id: stage.id,
        marker: stage.marker.replaceAll("__RUN_ID__", runId),
        receivedAt: null,
        characterOffset: null,
      }));
      const run = {
        probeId: String(probeId),
        runId,
        label: t(probe.labelKey),
        slot,
        fileName: probe.fileName,
        source: {
          text: source,
          encoding: "UTF-8",
          byteLength: program.length,
          lineEndings: source.includes("\r\n") ? "CRLF" : "LF",
          hasTrailingNewline: source.endsWith("\n"),
          crc32: `0x${this._crc32(program).toString(16).padStart(8, "0")}`,
        },
        sourceBytes: program.length,
        outcome: "running",
        reason: "",
        stage: "waiting-info-response",
        finalStage: null,
        startedAt,
        finishedAt: null,
        runtimeMs: null,
        runtimeMsMeaning:
          "Total diagnostic duration from request start through final result; includes info wait, slot clear, transfer, and observation.",
        executionStartedAt: null,
        executionFinishedAt: null,
        executionDurationMs: null,
        programFlowStartedAt: null,
        programFlowDurationMs: null,
        terminationStatus: "not-started",
        pythonExecution: {
          status: stageMarkers.length ? "not-observed" : "not-instrumented",
          stageOrderValid: true,
          stageMarkers,
          allStagesObserved: false,
          markerAbsenceMeaning:
            "No marker is not proof that Python did not run; ConsoleNotification delivery may be absent or incomplete.",
        },
        flowCorrelation: {
          notificationType: "ProgramFlowNotification (0x20)",
          notificationContainsSlot: false,
          basis:
            "time-window after ProgramFlowRequest; slot attribution is not guaranteed by the protocol",
          previousNotification: this._diagnostics.lastProgramFlowNotification,
        },
        transferredBytes: 0,
        transferResponses: {
          infoRequest: JSON.parse(
            JSON.stringify(this._diagnostics.infoRequest)
          ),
          infoResponse: null,
          notificationRequest: JSON.parse(
            JSON.stringify(this._diagnostics.notificationRequest)
          ),
          clearSlot: null,
          startFileUpload: null,
          transferChunks: [],
          programFlowStart: null,
          programFlowStop: null,
        },
        notifications: {
          flow: [],
          start: null,
          stop: null,
        },
        consoleOutput: [],
        consoleObservation: {
          status: "not-observed",
          notificationCount: 0,
          probeMarkerCount: 0,
          interpretation:
            "No ConsoleNotification evidence has been collected yet.",
        },
        flowWaiters: {},
        disconnect: null,
        error: null,
      };
      this._activeStartupProbe = run;
      this._diagnostics.startupProbeRuns.push(run);
      if (this._diagnostics.startupProbeRuns.length > 3) {
        this._diagnostics.startupProbeRuns.splice(
          0,
          this._diagnostics.startupProbeRuns.length - 3
        );
      }
      this._recordDiagnosticEvent("startup-probe-started", {
        probeId: run.probeId,
        runId: run.runId,
        slot,
        fileName: probe.fileName,
        sourceBytes: run.sourceBytes,
        sourceCrc32: run.source.crc32,
      });

      const request = async (key, message, responseType, record) => {
        const requestAt = Date.now();
        Object.assign(record, {
          step: key,
          requestAt,
          messageType: message[0],
          protocolMessageHex: this._protocolMessageHex(message),
          requestFrameHex: null,
          requestPacketLengths: [],
          writeAttemptedAt: null,
          writeCompletedAt: null,
          responseFrameHex: null,
          status: "pending",
        });
        try {
          const response = await this._requestHubResponse(
            message,
            responseType,
            5000,
            record
          );
          Object.assign(record, {
            responseAt: record.responseAt || Date.now(),
            ok: response.ok,
            responseStatus: response.status,
            responseMessageHex: response.protocolMessageHex,
            responseFrameHex: response.wireFrameHex,
            status: response.ok ? "acknowledged" : "rejected",
          });
          return response;
        } catch (error) {
          Object.assign(record, {
            errorAt: Date.now(),
            status: "error",
            error: {
              name: error?.name || "Error",
              message: error?.message || String(error),
              stack: error?.stack || "",
            },
          });
          throw error;
        }
      };

      const allPythonStagesObserved = () =>
        run.pythonExecution.stageMarkers.length > 0 &&
        run.pythonExecution.stageOrderValid &&
        run.pythonExecution.stageMarkers.every(
          (stage) => stage.receivedAt !== null
        );

      try {
        await this._waitForInfoResponse();
        run.transferResponses.infoResponse = {
          receivedAt: this._diagnostics.infoResponseReceivedAt,
          firmwareVersion: this._firmware,
          rpcVersion: this._rpcVersion,
          protocolMessageHex: this._diagnostics.infoResponseMessageHex,
          wireFrameHex: this._diagnostics.infoResponseFrameHex,
        };

        run.stage = "clearing-slot";
        const clearRecord = {};
        run.transferResponses.clearSlot = clearRecord;
        // A non-zero clear response is recorded (an empty slot may report it)
        // and the confirmed target proceeds through the official upload flow.
        await request(
          "clearSlot",
          this._buildClearSlotRequest(slot),
          SPIKE3.CLEAR_SLOT_RESPONSE,
          clearRecord
        );

        run.stage = "starting-file-upload";
        const uploadRecord = {};
        run.transferResponses.startFileUpload = uploadRecord;
        const upload = await request(
          "startFileUpload",
          this._buildStartFileUploadRequest(
            probe.fileName,
            slot,
            this._crc32(program)
          ),
          SPIKE3.START_FILE_UPLOAD_RESPONSE,
          uploadRecord
        );
        if (!upload.ok) throw new Error("Hub rejected StartFileUploadRequest");

        let runningCrc = 0;
        for (let offset = 0, index = 0; offset < program.length; index++) {
          const chunk = program.slice(offset, offset + this._maxChunkSize);
          const record = { index, offset, length: chunk.length };
          run.transferResponses.transferChunks.push(record);
          runningCrc = this._crc32(chunk, runningCrc);
          const response = await request(
            `transferChunk:${index}`,
            this._buildTransferChunkRequest(runningCrc, chunk),
            SPIKE3.TRANSFER_CHUNK_RESPONSE,
            record
          );
          if (!response.ok) {
            throw new Error(`Hub rejected program chunk at byte ${offset}`);
          }
          run.transferredBytes += chunk.length;
          offset += chunk.length;
        }

        run.stage = "requesting-program-start";
        const startRecord = {};
        run.transferResponses.programFlowStart = startRecord;
        const startResponse = await request(
          "programFlowStart",
          this._buildProgramFlowRequest(false, slot),
          SPIKE3.PROGRAM_FLOW_RESPONSE,
          startRecord
        );
        if (!startResponse.ok)
          throw new Error("Hub rejected ProgramFlowRequest");
        run.terminationStatus = "start-request-accepted";

        run.stage = "waiting-for-start-notification";
        const start = await this._waitForStartupProbeNotification(
          run,
          "start",
          startTimeoutMs,
          startRecord.requestAt
        );
        if (start) run.programFlowStartedAt = start.timestamp;
        if (run.prematureStopNotification) {
          run.terminationStatus = start
            ? "stop-before-diagnostic-stop-request"
            : "stop-without-start-notification";
          const allStagesObserved = allPythonStagesObserved();
          const orderedFlowNotifications =
            run.notifications.start &&
            run.notifications.stop &&
            run.notifications.stop.timestamp >=
              run.notifications.start.timestamp;
          if (start && allStagesObserved && orderedFlowNotifications) {
            return this._finishStartupProbeRun(
              run,
              "success",
              "The start notification, all Python stage markers, and the natural stop notification were observed."
            );
          }
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            start
              ? "A stop notification arrived before the expected Python completion marker. The notification has no slot field, and missing console markers do not prove Python did not run."
              : "A stop notification arrived after the start request, but no start notification was received and the stop notification has no slot field; the program and slot could not be attributed."
          );
        }
        if (!start) {
          run.stage = "start-notification-missing";
          run.terminationStatus = "start-notification-missing";
          if (this.isConnected()) {
            const stopRecord = {};
            run.transferResponses.programFlowStop = stopRecord;
            run.stopRequestAt = Date.now();
            run.terminationStatus = "cleanup-stop-requested";
            try {
              const stopResponse = await request(
                "programFlowStop",
                this._buildProgramFlowRequest(true, slot),
                SPIKE3.PROGRAM_FLOW_RESPONSE,
                stopRecord
              );
              if (stopResponse.ok) {
                const cleanupStop = await this._waitForStartupProbeNotification(
                  run,
                  "stop",
                  stopTimeoutMs,
                  run.stopRequestAt
                );
                run.terminationStatus = cleanupStop
                  ? "cleanup-stop-notification-received"
                  : "cleanup-stop-notification-missing";
              } else {
                run.terminationStatus = "cleanup-stop-request-rejected";
              }
            } catch (cleanupError) {
              run.terminationStatus = "cleanup-stop-request-error";
              run.cleanupError = {
                name: cleanupError?.name || "Error",
                message: cleanupError?.message || String(cleanupError),
              };
            }
          } else {
            run.terminationStatus = "cleanup-skipped-disconnected";
          }
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            run.pythonExecution.stageMarkers.some(
              (stage) => stage.receivedAt !== null
            )
              ? "Python stage markers were received, but the start notification was missing; protocol lifecycle could not be verified."
              : "The hub accepted the start request but no start notification arrived; no Python execution stage was observed. Marker absence does not prove that Python did not run."
          );
        }

        run.stage = "observing-running-program";
        run.programFlowStartedAt = start.timestamp;
        const spontaneousStop = await this._waitForStartupProbeNotification(
          run,
          "stop",
          observationMs,
          start.timestamp
        );
        if (spontaneousStop) {
          run.terminationStatus = "stop-before-diagnostic-stop-request";
          const allStagesObserved = allPythonStagesObserved();
          const orderedFlowNotifications =
            run.notifications.start &&
            run.notifications.stop &&
            run.notifications.stop.timestamp >=
              run.notifications.start.timestamp;
          if (allStagesObserved && orderedFlowNotifications) {
            return this._finishStartupProbeRun(
              run,
              "success",
              "The start notification, all Python stage markers, and the natural stop notification were observed."
            );
          }
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            "A stop notification arrived before all expected Python stage markers. Its slot cannot be determined from ProgramFlowNotification alone."
          );
        }

        run.stage = "requesting-diagnostic-stop";
        const stopRecord = {};
        run.transferResponses.programFlowStop = stopRecord;
        run.stopRequestAt = Date.now();
        const stopResponse = await request(
          "programFlowStop",
          this._buildProgramFlowRequest(true, slot),
          SPIKE3.PROGRAM_FLOW_RESPONSE,
          stopRecord
        );
        if (!stopResponse.ok) {
          run.terminationStatus = "diagnostic-stop-request-rejected";
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            "The probe stayed active for the observation window, but the hub rejected the stop request."
          );
        }
        run.stage = "waiting-for-stop-notification";
        const stop = await this._waitForStartupProbeNotification(
          run,
          "stop",
          stopTimeoutMs,
          run.stopRequestAt
        );
        if (!stop) {
          run.terminationStatus = "diagnostic-stop-notification-missing";
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            "The hub acknowledged the stop request but no stop notification arrived."
          );
        }
        run.terminationStatus = "stopped-after-diagnostic-request";
        if (
          run.pythonExecution.stageMarkers.length > 0 &&
          !allPythonStagesObserved()
        ) {
          return this._finishStartupProbeRun(
            run,
            "indeterminate",
            "The hub acknowledged the diagnostic stop, but not all expected Python stage markers arrived; execution completion is unverified."
          );
        }
        return this._finishStartupProbeRun(
          run,
          "success",
          "Start notification, continued execution through the observation window, stop response, and stop notification were all observed."
        );
      } catch (error) {
        run.error = {
          name: error?.name || "Error",
          message: error?.message || String(error),
          stack: error?.stack || "",
        };
        const startRequest = run.transferResponses.programFlowStart;
        const executionWasRejected = startRequest?.ok === false;
        const executionWasRequested = Boolean(startRequest?.requestAt);
        const outcome =
          executionWasRejected || !executionWasRequested
            ? "failure"
            : "indeterminate";
        run.terminationStatus = executionWasRejected
          ? "start-request-rejected"
          : executionWasRequested
            ? "communication-error-after-start-request"
            : "not-started";
        return this._finishStartupProbeRun(
          run,
          outcome,
          executionWasRequested
            ? "Communication failed after the program start request; the program's state is unknown."
            : "The probe could not be transferred and started."
        );
      }
    }

    /** Arbitrary Python source has no execution semantics in TunnelMessage. */
    sendPythonCommandRaw(text) {
      void text;
      return Promise.reject(
        this._unsupportedError(t("pythonExecutionUnsupported"))
      );
    }

    sendPythonCommand(pythonCode) {
      void pythonCode;
      return Promise.reject(
        this._unsupportedError(t("pythonExecutionUnsupported"))
      );
    }

    sendRaw(text) {
      return this.sendPythonCommand(String(text).replace(/\r?\n$/, ""));
    }

    sendReplCommand(pythonCode) {
      this._replHistory.push(pythonCode);
      if (this._replHistory.length > 50) this._replHistory.shift();
      return this.sendPythonCommand(pythonCode);
    }

    _send(message, useLimiter = false, diagnosticRecord = null) {
      if (!this.isConnected()) return Promise.reject(this._notConnectedError());
      if (useLimiter) {
        return whenSlot(
          this._rateLimiter,
          () => this.isConnected(),
          () => this._send(message, false, diagnosticRecord)
        );
      }
      const packed = COBS.pack(message);
      if (diagnosticRecord) {
        const packetSize =
          this._link instanceof WebBLELink
            ? this._link._maxPacketSize
            : this._maxPacketSize;
        diagnosticRecord.requestFrameHex = this._protocolMessageHex(packed);
        diagnosticRecord.requestPacketLengths = [];
        for (let offset = 0; offset < packed.length; offset += packetSize) {
          diagnosticRecord.requestPacketLengths.push(
            Math.min(packetSize, packed.length - offset)
          );
        }
      }
      const messageNames = {
        [SPIKE3.INFO_REQUEST]: "InfoRequest",
        [SPIKE3.CLEAR_SLOT_REQUEST]: "ClearSlotRequest",
        [SPIKE3.START_FILE_UPLOAD_REQUEST]: "StartFileUploadRequest",
        [SPIKE3.TRANSFER_CHUNK_REQUEST]: "TransferChunkRequest",
        [SPIKE3.PROGRAM_FLOW_REQUEST]: "ProgramFlowRequest",
        [SPIKE3.DEVICE_NOTIFICATION_REQUEST]: "DeviceNotificationRequest",
        [SPIKE3.TUNNEL]: "TunnelMessage",
      };
      const attemptedAt = Date.now();
      if (diagnosticRecord) diagnosticRecord.writeAttemptedAt = attemptedAt;
      const messageContext = {
        attemptedAt,
        messageType: message[0],
        messageName: messageNames[message[0]] || `0x${message[0].toString(16)}`,
        payloadLength: message.length,
        frameLength: packed.length,
        status: "pending",
      };
      this._diagnostics.lastWrite = messageContext;
      const attempt = this._diagnostics.controllerInstallAttempt;
      if (
        message[0] === SPIKE3.PROGRAM_FLOW_REQUEST &&
        attempt?.outcome === "in-progress"
      ) {
        attempt.programFlowRequestSentAt = attemptedAt;
        attempt.programFlowStartedAt = null;
        attempt.programFlowStoppedAt = null;
        this._recordControllerInstallStage("program-flow-request-sent", false);
      }
      const write =
        this._link instanceof WebBLELink
          ? this._link.write(
              SPIKE3.SERVICE,
              SPIKE3.RX_CHAR,
              Base64Util.uint8ArrayToBase64(packed),
              "base64",
              messageContext
            )
          : this._link.write(
              SPIKE3.SERVICE,
              SPIKE3.RX_CHAR,
              Base64Util.uint8ArrayToBase64(packed),
              "base64"
            );
      return Promise.resolve(write).then(() => {
        if (diagnosticRecord) {
          diagnosticRecord.writeCompletedAt = Date.now();
        }
        if (this._diagnostics.lastWrite === messageContext) {
          this._diagnostics.lastWrite = {
            ...messageContext,
            status: "write-completed",
            completedAt: Date.now(),
          };
        }
      });
    }

    // --------------------------------------------------------------- receive

    _onConnect() {
      this._clearNotificationResponseTimeout();
      if (this._streamingFallback !== null)
        clearTimeout(this._streamingFallback);
      this._streamingFallback = null;
      this._frame = [];
      this._firmware = null;
      this._rpcVersion = null;
      this._resetCommunicationDiagnostics({ preserveHistory: true });
      this._streamingRequested = false;
      const notifications = this._link.startNotifications(
        SPIKE3.SERVICE,
        SPIKE3.TX_CHAR,
        this._onMessage
      );
      if (notifications && typeof notifications.catch === "function") {
        notifications.catch((error) => this._recordTransportError(error));
      }
      // Ask what we are talking to. Device streaming is requested the moment
      // it answers (see _handleInfoResponse) rather than after a fixed wait:
      // the InfoResponse is also what carries the packet size, so asking
      // before it arrives means sending at the wrong MTU. Both BLE extensions
      // used a 500 ms timer instead, which was slower when the hub was quick
      // and still too early when it was not.
      const infoRequest = this._diagnostics.infoRequest;
      const infoMessage = Uint8Array.from([SPIKE3.INFO_REQUEST]);
      infoRequest.requestedAt = Date.now();
      infoRequest.requestMessageHex = this._protocolMessageHex(infoMessage);
      infoRequest.status = "pending";
      this._send(infoMessage, false, infoRequest)
        .then(() => {
          infoRequest.status = "write-completed";
          infoRequest.writeCompletedAt = Date.now();
        })
        .catch((error) => {
          infoRequest.status = "write-failed";
          infoRequest.error = {
            name: error?.name || "Error",
            message: error?.message || String(error),
            stack: error?.stack || "",
          };
          this._recordTransportError(error);
        });
      // A hub that never answers still gets asked, so a missing InfoResponse
      // costs the packet size rather than every sensor reading.
      this._streamingFallback = setTimeout(
        () => this._requestStreamingOnce(),
        1000
      );
    }

    _requestStreamingOnce() {
      if (this._streamingRequested) return;
      this._streamingRequested = true;
      if (this._streamingFallback) {
        clearTimeout(this._streamingFallback);
        this._streamingFallback = null;
      }
      this.setDeviceNotifications(true).catch((error) => {
        if (error?.code !== "ERR_NOTIFICATION_REQUEST_SUPERSEDED") {
          this._recordTransportError(error);
        }
      });
    }

    /**
     * Streaming is the hub pushing a device record every interval. Turning it
     * off leaves the sensor getters holding their last value, which is what
     * the legacy "streaming mode" blocks controlled.
     */
    setDeviceNotifications(enabled, intervalMs = 100) {
      this._streaming = Boolean(enabled);
      const interval = this._streaming ? intervalMs : 0;
      const message = new Uint8Array(3);
      message[0] = SPIKE3.DEVICE_NOTIFICATION_REQUEST;
      message[1] = interval & 0xff;
      message[2] = (interval >> 8) & 0xff;
      if (this._pendingNotificationRequest) {
        this._pendingNotificationRequest.request.status = "superseded";
        const error = new Error("device notification request superseded");
        error.code = "ERR_NOTIFICATION_REQUEST_SUPERSEDED";
        this._settleNotificationRequest(error);
      }
      const request = this._diagnostics.notificationRequest;
      this._clearNotificationResponseTimeout();
      request.enabled = this._streaming;
      request.intervalMs = interval;
      request.requestMessageHex = this._protocolMessageHex(message);
      request.requestFrameHex = null;
      request.requestPacketLengths = [];
      request.writeAttemptedAt = null;
      request.writeCompletedAt = null;
      request.responseFrameHex = null;
      request.responseMessageHex = null;
      request.status = this.isConnected() ? "pending" : "not-connected";
      request.requestedAt = Date.now();
      request.responseAt = null;
      request.responseCode = null;
      request.responseMessageHex = null;
      if (request.status === "not-connected") {
        return Promise.reject(new Error("not connected to SPIKE hub"));
      }
      let resolveResponse;
      let rejectResponse;
      const responsePromise = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });
      this._pendingNotificationRequest = {
        request,
        resolve: resolveResponse,
        reject: rejectResponse,
      };
      if (request.status === "pending") {
        this._notificationResponseTimeout = setTimeout(() => {
          if (this._pendingNotificationRequest?.request !== request) return;
          request.status = "timeout";
          const error = new Error("device notification response timed out");
          this._recordCommunicationError(error);
          this._settleNotificationRequest(error);
        }, SPIKE3.NOTIFICATION_RESPONSE_TIMEOUT_MS);
      }
      const writePromise = Promise.resolve().then(() =>
        this._send(message, false, request)
      );
      return Promise.all([writePromise, responsePromise])
        .then(([, responseCode]) => responseCode)
        .catch((error) => {
          if (error?.code !== "ERR_NOTIFICATION_REQUEST_SUPERSEDED") {
            this._recordTransportError(error);
          }
          throw error;
        });
    }

    get streaming() {
      return this._streaming;
    }

    /** Bytes arrive base64-encoded, in MTU-sized pieces, delimited by 0x02. */
    _onMessage(message) {
      let bytes;
      try {
        bytes = Base64Util.base64ToUint8Array(message);
      } catch (error) {
        this._diagnostics.malformedMessageCount++;
        this._recordCommunicationError(error);
        return;
      }
      for (const byte of bytes) {
        if (byte !== SPIKE3.DELIMITER) {
          this._frame.push(byte);
          continue;
        }
        if (this._frame.length) {
          const frame = Uint8Array.from(this._frame.concat([SPIKE3.DELIMITER]));
          this._frame = [];
          // A malformed frame is dropped and the stream resumes at the next
          // delimiter. Decoding it anyway would turn a transport glitch into
          // wrong sensor readings, which is the harder failure to notice.
          let data = null;
          try {
            data = COBS.unpack(frame);
          } catch (e) {
            data = null;
            this._diagnostics.cobsDecodeFailureCount++;
            this._recordCommunicationError(`COBS decode failed: ${e.message}`);
          }
          if (data && data.length) {
            this._handleMessage(data, frame);
          } else if (data) {
            this._diagnostics.malformedMessageCount++;
            this._recordCommunicationError(
              "COBS frame decoded to an empty message"
            );
          }
        }
      }
    }

    _handleMessage(data, wireFrame = null) {
      if (this._handleProtocolResponse(data, wireFrame)) return;
      switch (data[0]) {
        case SPIKE3.INFO_RESPONSE:
          this._handleInfoResponse(data, wireFrame);
          break;
        case SPIKE3.DEVICE_NOTIFICATION:
          this._handleDeviceNotification(data);
          break;
        case SPIKE3.DEVICE_NOTIFICATION_RESPONSE:
          this._handleDeviceNotificationResponse(data, wireFrame);
          break;
        case SPIKE3.PROGRAM_FLOW_NOTIFICATION:
          this._handleProgramFlowNotification(data, wireFrame);
          break;
        case SPIKE3.START_FILE_UPLOAD_RESPONSE:
        case SPIKE3.TRANSFER_CHUNK_RESPONSE:
        case SPIKE3.CLEAR_SLOT_RESPONSE:
        case SPIKE3.PROGRAM_FLOW_RESPONSE:
          this._handleProtocolResponse(data, wireFrame);
          break;
        case SPIKE3.TUNNEL:
          this._handleTunnelMessage(data);
          break;
        case SPIKE3.CONSOLE_NOTIFICATION: {
          const text = new TextDecoder()
            .decode(data.slice(1))
            .replace(/\0+$/, "");
          this._replOutput += text;
          if (this._replOutput.length > 4096) {
            this._replOutput = this._replOutput.slice(-4096);
          }
          const notification = { timestamp: Date.now(), text };
          this._diagnostics.recentConsoleNotifications.push(notification);
          const probeRun = this._activeStartupProbe;
          if (probeRun && notification.timestamp >= probeRun.startedAt) {
            probeRun.consoleOutput.push({
              timestamp: notification.timestamp,
              text: text.slice(0, 4096),
              decodedProtocolMessageHex: this._protocolMessageHex(data),
              wireFrameHex: wireFrame
                ? this._protocolMessageHex(wireFrame)
                : null,
            });
            if (probeRun.consoleOutput.length > 80) {
              probeRun.consoleOutput.splice(
                0,
                probeRun.consoleOutput.length - 80
              );
            }
            const combinedConsole = probeRun.consoleOutput
              .map((item) => item.text)
              .join("");
            for (const stage of probeRun.pythonExecution.stageMarkers) {
              const markerOffset = combinedConsole.indexOf(stage.marker);
              if (stage.receivedAt === null && markerOffset !== -1) {
                stage.receivedAt = notification.timestamp;
                stage.characterOffset = markerOffset;
                probeRun.pythonExecution.lastStage = stage.id;
                if (stage.id === "top-level") {
                  probeRun.executionStartedAt = notification.timestamp;
                } else if (stage.id === "main-completed") {
                  probeRun.executionFinishedAt = notification.timestamp;
                }
                this._recordDiagnosticEvent("startup-probe-python-stage", {
                  probeId: probeRun.probeId,
                  runId: probeRun.runId,
                  stage: stage.id,
                  marker: stage.marker,
                });
              }
            }
            let previousMarkerOffset = -1;
            for (const stage of probeRun.pythonExecution.stageMarkers) {
              if (stage.characterOffset === null) continue;
              if (stage.characterOffset <= previousMarkerOffset) {
                probeRun.pythonExecution.stageOrderValid = false;
                probeRun.pythonExecution.orderViolation = {
                  previousStage: probeRun.pythonExecution.stageMarkers.find(
                    (candidate) =>
                      candidate.characterOffset === previousMarkerOffset
                  )?.id,
                  stage: stage.id,
                };
                break;
              }
              previousMarkerOffset = stage.characterOffset;
            }
          }
          if (this._diagnostics.recentConsoleNotifications.length > 20) {
            this._diagnostics.recentConsoleNotifications.shift();
          }
          this._diagnostics.recentConsoleOutput =
            this._diagnostics.recentConsoleNotifications
              .map((item) => item.text)
              .join("")
              .slice(-4096);
          this._diagnostics.controllerInstallAttempt?.callbackReadyWaiter?.();
          this._recordDiagnosticEvent("console-notification", { text });
          break;
        }
        default:
          break;
      }
    }

    _handleProgramFlowNotification(data, wireFrame = null) {
      if (data.length !== 2) {
        this._diagnostics.malformedMessageCount++;
        this._recordCommunicationError(
          `invalid ProgramFlowNotification length: expected 2, received ${data.length}`
        );
        return;
      }
      const action = data[1];
      if (action !== 0 && action !== 1) {
        this._diagnostics.malformedMessageCount++;
        this._recordCommunicationError(
          `unknown ProgramFlowNotification action: ${action}`
        );
        return;
      }
      const timestamp = Date.now();
      const notification = {
        timestamp,
        action: action === 0 ? "start" : "stop",
        actionValue: action,
        decodedProtocolMessageHex: this._protocolMessageHex(data),
        wireFrameHex: wireFrame ? this._protocolMessageHex(wireFrame) : null,
      };
      this._diagnostics.lastProgramFlowNotification = notification;
      this._recordDiagnosticEvent("program-flow-notification", notification);

      const probeRun = this._activeStartupProbe;
      const programStartRequestAt =
        probeRun?.transferResponses.programFlowStart?.requestAt;
      if (
        probeRun &&
        programStartRequestAt &&
        timestamp >= programStartRequestAt
      ) {
        probeRun.notifications.flow.push(notification);
        if (probeRun.notifications.flow.length > 20) {
          probeRun.notifications.flow.shift();
        }
        if (action === 0 && !probeRun.notifications.start) {
          probeRun.notifications.start = notification;
        } else if (action === 1) {
          probeRun.notifications.stop = notification;
          if (
            !probeRun.notifications.start ||
            !probeRun.stopRequestAt ||
            timestamp < probeRun.stopRequestAt
          ) {
            probeRun.prematureStopNotification = notification;
          }
        }
        for (const [key, waiter] of Object.entries(
          probeRun.flowWaiters || {}
        )) {
          if (
            (waiter.action === notification.action ||
              (action === 1 &&
                !probeRun.notifications.start &&
                waiter.action === "start")) &&
            timestamp >= waiter.afterTimestamp
          ) {
            waiter.resolve(
              waiter.action === notification.action ? notification : null
            );
            delete probeRun.flowWaiters[key];
          }
        }
      }

      const attempt = this._diagnostics.controllerInstallAttempt;
      if (
        attempt?.outcome === "in-progress" &&
        attempt.programFlowRequestSentAt !== undefined &&
        timestamp >= attempt.programFlowRequestSentAt
      ) {
        if (action === 0) {
          attempt.programFlowStartedAt = timestamp;
          const waiter = [...this._controllerStartWaiters].find(
            (candidate) => candidate.attempt === attempt
          );
          if (waiter) waiter.resolve(notification);
        } else {
          attempt.programFlowStoppedAt = timestamp;
          if (!this._controllerReady) {
            const consoleOutput = this._diagnostics.recentConsoleOutput;
            const error = Object.assign(
              new Error(
                `${t("controllerStoppedBeforeReady")}${consoleOutput ? `: ${consoleOutput}` : ""}`
              ),
              { code: "ERR_CONTROLLER_STOPPED_BEFORE_READY" }
            );
            attempt.outcome = "startup-error";
            attempt.finishedAt = timestamp;
            attempt.stage = "program-stopped-before-handshake";
            attempt.updatedAt = timestamp;
            this._diagnostics.controllerStatus = "startup-error";
            this._recordDiagnosticEvent("controller-start-failed", {
              slot: attempt.slot,
              reason: "program-stopped-before-handshake",
              consoleOutput,
            });
            const waiter = [...this._controllerStartWaiters].find(
              (candidate) => candidate.attempt === attempt
            );
            if (waiter) waiter.reject(error);
            for (const [requestId, pending] of this
              ._pendingControllerCommands) {
              if (pending.commandName !== "controller.hello") continue;
              this._pendingControllerCommands.delete(requestId);
              clearTimeout(pending.timeout);
              pending.reject(error);
            }
          }
        }
        return;
      }
      if (action === 1 && this._controllerReady) {
        this._controllerReady = false;
        this._diagnostics.controllerStatus = "stopped";
        if (this._controllerHeartbeatTimer !== null) {
          clearInterval(this._controllerHeartbeatTimer);
          this._controllerHeartbeatTimer = null;
        }
      }
    }

    _handleDeviceNotificationResponse(data, wireFrame = null) {
      if (data.length < 2) {
        this._diagnostics.malformedMessageCount++;
        const error = new Error("truncated device notification response");
        this._recordCommunicationError(error);
        if (this._pendingNotificationRequest) {
          this._pendingNotificationRequest.request.status =
            "malformed-response";
          this._settleNotificationRequest(error);
        }
        return;
      }
      const request = this._diagnostics.notificationRequest;
      this._clearNotificationResponseTimeout();
      request.responseAt = Date.now();
      request.responseCode = data[1];
      request.responseMessageHex = this._protocolMessageHex(data);
      request.responseFrameHex = wireFrame
        ? this._protocolMessageHex(wireFrame)
        : null;
      if (data[1] === 0) {
        request.status = "acknowledged";
        this._settleNotificationRequest(null, data[1]);
      } else if (data[1] === 1) {
        request.status = "not-acknowledged";
        const error = new Error("hub did not acknowledge device notifications");
        this._recordCommunicationError(error);
        this._settleNotificationRequest(error);
      } else {
        request.status = "unknown-response-status";
        const error = new Error(
          `unknown device notification response status: ${data[1]}`
        );
        this._recordCommunicationError(error);
        this._settleNotificationRequest(error);
      }
    }

    /**
     * InfoResponse carries the versions the legacy extensions threw away: the
     * RPC version at +1, the firmware version at +5, then the two sizes. The
     * firmware version is what tells a Robot Inventor hub from a SPIKE Prime
     * one running the same protocol, so it is kept.
     */
    _handleInfoResponse(data, wireFrame = null) {
      if (data.length < 17) {
        this._diagnostics.malformedMessageCount++;
        this._recordCommunicationError("truncated InfoResponse");
        return;
      }
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      this._rpcVersion = `${data[1]}.${data[2]}.${view.getUint16(3, true)}`;
      this._firmware = `${data[5]}.${data[6]}.${view.getUint16(7, true)}`;
      this._diagnostics.lastFirmwareVersion = this._firmware;
      this._diagnostics.infoResponseReceivedAt = Date.now();
      this._diagnostics.infoResponseMessageHex = this._protocolMessageHex(data);
      this._diagnostics.infoResponseFrameHex = wireFrame
        ? this._protocolMessageHex(wireFrame)
        : null;
      this._diagnostics.infoResponseStatus = "received";
      this._diagnostics.infoRequest.responseAt =
        this._diagnostics.infoResponseReceivedAt;
      this._diagnostics.infoRequest.responseMessageHex =
        this._diagnostics.infoResponseMessageHex;
      this._diagnostics.infoRequest.responseFrameHex =
        this._diagnostics.infoResponseFrameHex;
      this._diagnostics.infoRequest.responseStatus = "received";
      this._maxPacketSize = view.getUint16(9, true) || 20;
      this._maxMessageSize = view.getUint16(11, true) || 100;
      this._maxChunkSize = view.getUint16(13, true) || 100;
      if (this._link && this._link.setMaxPacketSize) {
        this._link.setMaxPacketSize(this._maxPacketSize);
      }
      for (const waiter of this._infoResponseWaiters || []) waiter.resolve();
      this._infoResponseWaiters = [];
      this._requestStreamingOnce();
    }

    /**
     * A notification holds a run of device records, each self-describing and
     * fixed-width. They are normalised into the same `portValues` shapes the
     * 2.x stream parser produces.
     */
    _handleDeviceNotification(data) {
      if (data.length < 3) {
        this._recordMalformedNotification(
          "truncated DeviceNotification header"
        );
        return;
      }
      const payloadSize = data[1] | (data[2] << 8);
      if (payloadSize !== data.length - 3) {
        this._recordMalformedNotification(
          `DeviceNotification payload size mismatch: expected ${payloadSize}, received ${data.length - 3}`
        );
        return;
      }
      let offset = 3;
      while (offset < data.length) {
        const type = data[offset];
        const remaining = data.length - offset;
        switch (type) {
          case SPIKE3.DEV_BATTERY:
            if (remaining < 2) {
              this._recordMalformedNotification("truncated battery record");
              return;
            }
            this._sensors.battery = data[offset + 1];
            offset += 2;
            break;

          case SPIKE3.DEV_IMU: {
            if (remaining < 21) {
              this._recordMalformedNotification("truncated IMU record");
              return;
            }
            const s16 = (lo) => {
              const v = data[offset + lo] | (data[offset + lo + 1] << 8);
              return v > 32767 ? v - 65536 : v;
            };
            this._sensors.faceUp = Spike3Hub.FACES[data[offset + 1]] || "top";
            this._sensors.angle.yaw = s16(3);
            this._sensors.angle.pitch = s16(5);
            this._sensors.angle.roll = s16(7);
            this._sensors.acceleration.x = s16(9);
            this._sensors.acceleration.y = s16(11);
            this._sensors.acceleration.z = s16(13);
            this._sensors.accelerationFiltered.x = this._sensors.acceleration.x;
            this._sensors.accelerationFiltered.y = this._sensors.acceleration.y;
            this._sensors.accelerationFiltered.z = this._sensors.acceleration.z;
            this._sensors.gyro.x = s16(15);
            this._sensors.gyro.y = s16(17);
            this._sensors.gyro.z = s16(19);
            this._sensors.gyroFiltered.x = this._sensors.gyro.x;
            this._sensors.gyroFiltered.y = this._sensors.gyro.y;
            this._sensors.gyroFiltered.z = this._sensors.gyro.z;
            this._diagnostics.imuNotificationCount++;
            this._diagnostics.lastImuReceivedAt = Date.now();
            offset += 21;
            break;
          }

          case SPIKE3.DEV_MATRIX_5X5:
            if (remaining < 26) {
              this._recordMalformedNotification("truncated 5x5 matrix record");
              return;
            }
            this._matrix5x5 = Array.from(data.slice(offset + 1, offset + 26));
            this._diagnostics.matrix5x5NotificationCount++;
            offset += 26;
            break;

          case SPIKE3.DEV_MOTOR: {
            // 12 bytes per LEGO's SPIKE Prime protocol:
            // type, port, motor type, absolute position(int16 @3),
            // power(int16 @5), speed(int8 @7), counted position(int32 @8).
            if (remaining < 12) {
              this._recordMalformedNotification("truncated motor record");
              return;
            }
            const port = SpikePorts[data[offset + 1]];
            if (port) {
              const readInt16 = (index) => {
                const value =
                  data[offset + index] | (data[offset + index + 1] << 8);
                return value > 32767 ? value - 65536 : value;
              };
              const absolutePosition = readInt16(3);
              const power = readInt16(5);
              const rawSpeed = data[offset + 7];
              const speed = rawSpeed > 127 ? rawSpeed - 256 : rawSpeed;
              let position =
                data[offset + 8] |
                (data[offset + 9] << 8) |
                (data[offset + 10] << 16) |
                (data[offset + 11] << 24);
              if (position > 2147483647) position -= 4294967296;
              // The legacy position reporter is a normalized 0..359 angle;
              // the separate absolute-position reporter retains LEGO's
              // signed -180..179 value. The int32 field is the accumulated
              // relative position and must not be used for either absolute
              // reading.
              const normalizedPosition = ((absolutePosition % 360) + 360) % 360;
              this._portValues[port] = {
                type: "motor",
                speed: speed,
                degreesCounted: position,
                position: normalizedPosition,
                power: power,
                relativePosition: position,
                absolutePosition: absolutePosition,
              };
              this._sensors.motorPositions[port] = {
                relativePosition: position,
                absolutePosition: absolutePosition,
                speed: speed,
              };
            }
            this._diagnostics.motorNotificationCount++;
            offset += 12;
            break;
          }

          case SPIKE3.DEV_COLOR: {
            if (remaining < 9) {
              this._recordMalformedNotification("truncated color record");
              return;
            }
            const port = SpikePorts[data[offset + 1]];
            if (port) {
              const red = data[offset + 3] | (data[offset + 4] << 8);
              const green = data[offset + 5] | (data[offset + 6] << 8);
              const blue = data[offset + 7] | (data[offset + 8] << 8);
              this._portValues[port] = {
                type: "color",
                color: data[offset + 2],
                // The 3.x colour record has no reflection or ambient channel.
                // Deriving them from RGB would be invention; they stay 0 and
                // getReflection/getAmbientLight report unsupported in this mode.
                reflection: 0,
                ambient: 0,
                red: red,
                green: green,
                blue: blue,
              };
            }
            offset += 9;
            break;
          }

          case SPIKE3.DEV_DISTANCE: {
            if (remaining < 4) {
              this._recordMalformedNotification("truncated distance record");
              return;
            }
            const port = SpikePorts[data[offset + 1]];
            if (port) {
              let mm = data[offset + 2] | (data[offset + 3] << 8);
              if (mm > 32767) mm -= 65536;
              this._portValues[port] = {
                type: "distance",
                // Reported in millimetres; the 2.x stream reported centimetres
                // and `getDistance` inherited that meaning, so it is converted
                // once here and `distanceMM` keeps the raw figure for the
                // blocks that ask for millimetres explicitly.
                distance: mm < 0 ? 0 : mm / 10,
                distanceMM: mm < 0 ? 0 : mm,
              };
            }
            offset += 4;
            break;
          }

          case SPIKE3.DEV_FORCE: {
            if (remaining < 4) {
              this._recordMalformedNotification("truncated force record");
              return;
            }
            const port = SpikePorts[data[offset + 1]];
            if (port) {
              this._portValues[port] = {
                type: "force",
                force: data[offset + 2],
                pressed: data[offset + 3] === 1,
              };
            }
            offset += 4;
            break;
          }

          case SPIKE3.DEV_MATRIX_3X3: {
            // Type, port and nine pixel bytes, as emitted by the SPIKE 3 hub.
            if (remaining < 11) {
              this._recordMalformedNotification("truncated 3x3 matrix record");
              return;
            }
            const port = SpikePorts[data[offset + 1]];
            if (port) {
              this._portValues[port] = {
                type: "matrix3",
                pixels: Array.from(data.slice(offset + 2, offset + 11)),
              };
            }
            offset += 11;
            break;
          }

          default:
            // An unknown record has an unknown width, so the rest of the
            // payload cannot be walked safely. Stop rather than guess.
            this._diagnostics.unsupportedRecordCount++;
            this._recordCommunicationError(
              `unsupported device record: 0x${type.toString(16).padStart(2, "0")}`
            );
            return;
        }
      }
    }
  }

  Spike3Hub.FACES = ["top", "front", "right", "bottom", "back", "left"];

  // ============================================================================
  // HUB ROUTER — one extension, five ways in
  //
  // This is what replaces the five separate extension ids. It holds both hubs
  // (the 2.x REPL one and the 3.x binary one), picks a transport, and is the
  // single object scratch-vm registers as this extension's peripheral. Every
  // block reaches its hub through `active`.
  //
  // WHAT CAN AND CANNOT BE DISCOVERED
  // ---------------------------------
  // Honest about a real limit: a browser cannot silently scan for Bluetooth
  // devices. Web Bluetooth needs a user gesture and shows its own chooser, and
  // Bluetooth Classic is not reachable from a page at all. So "auto" does not
  // mean the hub is found without the user doing anything. It means:
  //
  //   1. TRANSPORT — which routes exist on this machine is detected, not
  //      configured. Scratch Link is probed, Web Bluetooth is a capability
  //      check, the bridge is a connect attempt. The first that answers wins,
  //      in the order below, and the user is never asked to choose a plumbing.
  //
  //   2. PROTOCOL — which firmware answered follows from the route and is then
  //      CONFIRMED by the hub itself: SPIKE 3 says so in its InfoResponse, a
  //      2.x hub says so through `hub.info()`. Neither is guessed from a name.
  //
  //   3. DEVICES — what is plugged into which port is reported by the hub in
  //      both protocols, so the port map is discovered rather than declared.
  //
  // The order tries Scratch Link first because it reaches both firmware
  // generations and needs no per-connection gesture; Web Bluetooth second
  // because it needs no install; the bridge last because it needs a helper
  // running. A user who wants a particular route sets it with the connection
  // mode block, and then nothing is probed.
  // ============================================================================
  const HubMode = {
    AUTO: "auto",
    SCRATCH_LINK_BT: "scratchlink-bt",
    SCRATCH_LINK_BLE: "scratchlink-ble",
    WEB_BLE: "web-ble",
    BRIDGE: "bridge",
  };

  /** Which protocol each mode reaches, and therefore which hub it drives. */
  const ModeProtocol = {
    [HubMode.SCRATCH_LINK_BT]: "repl",
    [HubMode.BRIDGE]: "repl",
    [HubMode.SCRATCH_LINK_BLE]: "spike3",
    [HubMode.WEB_BLE]: "spike3",
  };

  const MODE_PREFERENCE = [
    HubMode.SCRATCH_LINK_BLE,
    HubMode.SCRATCH_LINK_BT,
    HubMode.WEB_BLE,
    HubMode.BRIDGE,
  ];

  /**
   * Firmware version to the name a learner recognises.
   *
   * SPIKE Prime (45678) and Robot Inventor (51515) are the same hub with
   * different boxes: same processor, same firmware line, same two protocols.
   * They are told apart by the hardware variant the hub reports, not by
   * guessing from the advertised Bluetooth name, which the user can change.
   */
  const describeHub = function (protocol, firmware, variant) {
    // The protocol does NOT name the hub: both hubs speak both protocols
    // depending on the firmware flashed to them. Only the hardware variant
    // separates a Robot Inventor from a SPIKE Prime, and only the 2.x REPL
    // reports it — so a 3.x hub is named "SPIKE Prime" for the family rather
    // than guessed at from the advertised Bluetooth name, which is editable.
    const named =
      variant && /invent/i.test(String(variant))
        ? "Robot Inventor"
        : "SPIKE Prime";
    if (!firmware) return named;
    return `${named} (firmware ${firmware})`;
  };

  class HubRouter {
    constructor(runtime, extensionId) {
      this._runtime =
        runtime ||
        (typeof globalThis.vm !== "undefined" ? globalThis.vm.runtime : null);
      this._extensionId = extensionId;
      this._mode = HubMode.AUTO;
      this._resolvedMode = null;
      this._candidates = [];
      this._bridgeURL = "localhost:8081";

      this._repl = new SpikePrime(this._runtime, extensionId);
      this._spike3 = new Spike3Hub(this._runtime, extensionId);
      this._activeProtocol = "repl";

      // A runtime that cannot hold a peripheral (a headless one, a harness)
      // is not a reason for the extension to fail to load: the blocks that do
      // not need hardware still work.
      if (
        this._runtime &&
        typeof this._runtime.registerPeripheralExtension === "function"
      ) {
        this._runtime.registerPeripheralExtension(extensionId, this);
      }
      // The transports emit this themselves when discovery finds nothing; it
      // is the signal to try the next route rather than to give up.
      if (this._runtime && typeof this._runtime.on === "function") {
        const timeoutEvent =
          this._runtime.constructor &&
          this._runtime.constructor.PERIPHERAL_SCAN_TIMEOUT;
        if (timeoutEvent)
          this._runtime.on(timeoutEvent, () => this._onScanTimeout());
      }
    }

    // ------------------------------------------------------------- selection

    get mode() {
      return this._mode;
    }

    setMode(mode) {
      const wanted = String(mode || "").trim();
      const known = Object.keys(ModeProtocol).concat([HubMode.AUTO]);
      this._mode = known.indexOf(wanted) === -1 ? HubMode.AUTO : wanted;
      return this._mode;
    }

    get resolvedMode() {
      return this._resolvedMode;
    }

    setBridgeURL(url) {
      this._bridgeURL = String(url || "").trim() || "localhost:8081";
    }

    /** The hub currently driving the blocks. */
    get active() {
      return this._activeProtocol === "spike3" ? this._spike3 : this._repl;
    }

    get protocol() {
      return this._activeProtocol;
    }

    /**
     * What the hub said it is, once it has said anything. Null before that —
     * this reports a measurement, never an assumption.
     */
    get hubDescription() {
      if (!this.isConnected()) return "";
      return describeHub(
        this._activeProtocol,
        this.active.firmwareVersion,
        this._repl._hardwareVariant
      );
    }

    get firmwareVersion() {
      return this.active.firmwareVersion || "";
    }

    /** Whether a given route exists on this machine at all. */
    static transportAvailable(mode, runtime) {
      switch (mode) {
        case HubMode.SCRATCH_LINK_BT:
        case HubMode.SCRATCH_LINK_BLE:
          return Boolean(
            runtime && typeof runtime.getScratchLinkSocket === "function"
          );
        case HubMode.WEB_BLE:
          return WebBLELink.available();
        case HubMode.BRIDGE:
          return typeof WebSocket !== "undefined";
        default:
          return false;
      }
    }

    /** The routes this machine actually has, in preference order. */
    availableModes() {
      return MODE_PREFERENCE.filter((m) =>
        HubRouter.transportAvailable(m, this._runtime)
      );
    }

    // -------------------------------------------------------------- lifecycle

    /**
     * Try the routes this machine has, best first, moving on when one finds
     * nothing.
     *
     * The fallback is the point, not a nicety. Scratch Link reaches both
     * firmware generations through two different transports, and which one
     * finds a hub depends on the hub, not on the machine — so picking BLE
     * because Scratch Link exists and stopping there would leave every
     * firmware-2.x hub undiscoverable on a machine that can reach it
     * perfectly well. A scan that finds nothing advances to the next route.
     */
    scan() {
      this._candidates =
        this._mode === HubMode.AUTO
          ? this.availableModes()
          : [this._mode].filter((m) =>
              HubRouter.transportAvailable(m, this._runtime)
            );

      if (!this._candidates.length) {
        this._emitNoTransport();
        return Promise.resolve();
      }
      return this._scanNext();
    }

    /**
     * Returns the connect promise for the two routes that connect directly
     * (Web Bluetooth and the bridge), so the `connect to hub` block can be
     * waited on. The Scratch Link routes only START discovery here — the user
     * picks from Scratch's chooser and `connect(id)` follows — so there is
     * nothing to await and the promise resolves immediately.
     */
    _scanNext() {
      const mode = this._candidates.shift();
      if (!mode) {
        this._resolvedMode = null;
        return Promise.resolve();
      }
      return Promise.resolve(this._startScan(mode));
    }

    /**
     * A scan that timed out means "not on this route", not "not anywhere".
     * Returns whether another route was started, so the caller can decide
     * whether the timeout is still worth reporting.
     */
    _onScanTimeout() {
      if (this.isConnected()) return false;
      if (!this._candidates.length) return false;
      this._scanNext();
      return true;
    }

    _startScan(mode) {
      this._resolvedMode = mode;
      this._activeProtocol = ModeProtocol[mode];

      switch (mode) {
        case HubMode.SCRATCH_LINK_BT:
          this._repl.attach(null);
          this._repl.scan();
          break;

        case HubMode.SCRATCH_LINK_BLE: {
          const link = new BLELink(
            this._runtime,
            this._extensionId,
            { filters: [{ services: [SPIKE3.SERVICE] }], optionalServices: [] },
            this._spike3._onConnect,
            this._spike3.reset
          );
          this._spike3.attach(link);
          break;
        }

        case HubMode.WEB_BLE: {
          const link = new WebBLELink(
            this._runtime,
            this._extensionId,
            this._spike3._onConnect,
            this._spike3.reset,
            this._spike3._recordTransportError.bind(this._spike3)
          );
          this._spike3.attach(link);
          // Web Bluetooth has no discovery step of its own: the browser's
          // chooser IS the discovery, and it must run from the gesture that
          // opened it. So this goes straight to connecting.
          return link.connectPeripheral().catch((error) => {
            this._spike3._recordTransportError(error);
            this._emitRequestError();
          });
        }

        case HubMode.BRIDGE: {
          const link = new BridgeLink(
            this._runtime,
            this._extensionId,
            this._repl._onConnect,
            this._repl.reset,
            this._repl._onMessage
          );
          link.setURL(this._bridgeURL);
          this._repl.attach(link);
          return link.connectPeripheral().catch(() => this._emitRequestError());
        }

        default:
          this._emitNoTransport();
          break;
      }
      return Promise.resolve();
    }

    connect(id) {
      if (this._activeProtocol === "spike3") {
        const link = this._spike3._link;
        if (link && link.connectPeripheral) {
          const result = link.connectPeripheral(id);
          if (result && typeof result.catch === "function") {
            result.catch(() => this._emitRequestError());
          }
        }
        return;
      }
      this._repl.connect(id);
    }

    disconnect() {
      this._repl.disconnect();
      this._spike3.disconnect();
      this._resolvedMode = null;
    }

    isConnected() {
      return this._repl.isConnected() || this._spike3.isConnected();
    }

    _emitNoTransport() {
      if (!this._runtime) return;
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
        message: "No way to reach a SPIKE hub from this browser",
        extensionId: this._extensionId,
      });
    }

    _emitRequestError() {
      if (!this._runtime) return;
      this._runtime.emit(this._runtime.constructor.PERIPHERAL_REQUEST_ERROR, {
        message: "Could not connect to the SPIKE hub",
        extensionId: this._extensionId,
      });
    }

    // ------------------------------------------------- peripheral delegation
    //
    // Everything below forwards to whichever hub is active. Written out rather
    // than proxied so that the surface a block may rely on is visible here and
    // changes to it are reviewable.

    get angle() {
      return this.active.angle;
    }
    get orientation() {
      return this.active.orientation;
    }
    get faceUp() {
      return this.active.faceUp || "top";
    }
    get portValues() {
      return this.active.portValues;
    }
    get pixelBrightness() {
      return this.active.pixelBrightness;
    }
    set pixelBrightness(value) {
      this.active.pixelBrightness = value;
    }
    get motorSettings() {
      return this.active.motorSettings;
    }
    get acceleration() {
      return this.active.acceleration;
    }
    get accelerationFiltered() {
      return this.active.accelerationFiltered;
    }
    get gyro() {
      return this.active.gyro;
    }
    get gyroFiltered() {
      return this.active.gyroFiltered;
    }
    get battery() {
      return this.active.battery;
    }
    get temperature() {
      return this.active.temperature;
    }
    get hubTemp() {
      return this.active.hubTemp;
    }
    get power() {
      return this.active.power;
    }
    get gestures() {
      return this.active.gestures;
    }
    get movementMotors() {
      return this.active.movementMotors;
    }
    get timer() {
      return this.active.timer;
    }
    get volume() {
      return this.active.volume;
    }
    set volume(value) {
      this.active._volume = value;
    }
    get replOutput() {
      return this.active.replOutput;
    }
    get replHistory() {
      return this.active.replHistory;
    }
    get _sensors() {
      return this.active._sensors;
    }
    get _movementMotors() {
      return this.active._movementMotors;
    }
    set _movementMotors(value) {
      // The pair is the project's choice, not one hub's: both hubs hold it,
      // so a pair set before connecting survives whichever route AUTO settles
      // on, and movementMotors reads the same pair on either firmware.
      this._repl._movementMotors = value;
      this._spike3._movementMotors = value;
    }
    get _timer() {
      return this.active._timer;
    }
    get _volume() {
      return this.active._volume;
    }
    set _volume(value) {
      this.active._volume = value;
    }
    get _replOutput() {
      return this.active._replOutput;
    }
    set _replOutput(value) {
      this.active._replOutput = value;
    }

    sendCommand(method, params, needsResponse = false) {
      return this.active.sendCommand(method, params, needsResponse);
    }
    sendPythonCommand(code) {
      return this.active.sendPythonCommand(code);
    }
    sendReplCommand(code) {
      return this.active.sendReplCommand(code);
    }
    sendRaw(text, useLimiter = false, id = null) {
      return this.active.sendRaw(text, useLimiter, id);
    }
    stopSound() {
      return this.active.stopSound();
    }
    stopAll() {
      return this.active.stopAll();
    }
    stopAllMotors() {
      return this.active.stopAllMotors();
    }

    /**
     * Whether the active hub can do a named thing. Blocks that only ever
     * worked on one firmware ask this rather than pretending to succeed.
     */
    supports(capability) {
      const caps =
        this._activeProtocol === "spike3"
          ? HubRouter.SPIKE3_CAPABILITIES
          : HubRouter.REPL_CAPABILITIES;
      return caps.indexOf(capability) !== -1;
    }

    getCommunicationDiagnostics() {
      const connectionMode = this._resolvedMode || this._mode;
      if (this._activeProtocol === "spike3") {
        return this._spike3.getDiagnostics(connectionMode);
      }
      return {
        protocol: "repl",
        connected: this.isConnected(),
        connectionMode,
        firmwareVersion: this._repl.firmwareVersion || null,
        sensorNotifications: "not-applicable-to-repl-protocol",
      };
    }
  }

  // What each firmware can actually do, as opposed to what the block palette
  // offers. A block naming a capability its hub lacks reports that plainly
  // instead of returning a plausible zero — the palette does not reshuffle on
  // connect, because a block set that changes shape under a learner is worse
  // than one that explains itself.
  HubRouter.REPL_CAPABILITIES = [
    "motor",
    "display",
    "display-pattern",
    "sound",
    "sound-file",
    "sound-waveform",
    "imu",
    "imu-gyro",
    "orientation-name",
    "gesture",
    "button",
    "color",
    "reflection",
    "ambient",
    "distance",
    "distance-lights",
    "force",
    "battery",
    "hub-power",
    "hub-temperature",
    "matrix3x3",
    "files",
    "repl",
    "python",
    "center-button",
    "rotate-display",
  ];

  HubRouter.SPIKE3_CAPABILITIES = [
    "motor",
    "display",
    "display-image",
    "sound",
    "imu",
    "imu-gyro",
    "face-up",
    "color",
    "distance",
    "force",
    "battery",
    "python",
    "streaming",
    "matrix3x3",
  ];

  // ============================================================================
  // TRANSPILER CLASS
  // ============================================================================
  class SpikeTranspiler {
    constructor() {
      this.pythonCode = "";
      this.indentLevel = 0;
      this.scriptCounter = 1;
      this.broadcastHandlers = [];
      this.mainScripts = [];
      this.soundFiles = [];
      this.usedMotors = new Set();
      this.usedSensors = new Set();
      this.debugLog = [];
    }

    log(message, data = null) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [TRANSPILER] ${message}`;
      if (data !== null) {
        console.log(logEntry, data);
      } else {
        console.log(logEntry);
      }
      this.debugLog.push({ timestamp, message, data });
    }

    indent() {
      return "    ".repeat(this.indentLevel);
    }

    addLine(code) {
      this.pythonCode += this.indent() + code + "\n";
    }

    isNumeric(value) {
      if (typeof value === "number") return true;
      if (typeof value === "string") {
        return !isNaN(value) && !isNaN(parseFloat(value));
      }
      return false;
    }

    sanitizeName(name) {
      if (!name) return "unnamed";
      return name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    }

    transpileProject() {
      this.log("=== Starting SPIKE Prime Transpilation ===");
      this.pythonCode = "";
      this.indentLevel = 0;
      this.debugLog = [];
      this.broadcastHandlers = [];
      this.mainScripts = [];
      this.soundFiles = [];
      this.usedMotors = new Set();
      this.usedSensors = new Set();
      this.scriptCounter = 1;

      try {
        const runtime = Scratch.vm.runtime;
        const targets = runtime.targets;

        this.log("Found targets", { count: targets.length });

        // Generate Python code
        this.generateHeader();
        this.generateStopHandlers();
        this.generateHelperFunctions();

        // Collect broadcast handlers
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const blocks = target.blocks;
          const blockArray = blocks._blocks;
          const blockKeys = Object.keys(blockArray);

          for (let j = 0; j < blockKeys.length; j++) {
            const block = blockArray[blockKeys[j]];
            if (block.opcode === "event_whenbroadcastreceived") {
              const broadcastName = this.getFieldValue(
                block,
                "BROADCAST_OPTION"
              );
              if (
                broadcastName &&
                !this.broadcastHandlers.includes(broadcastName)
              ) {
                this.broadcastHandlers.push(broadcastName);
              }
            }
          }
        }

        this.log("Broadcast handlers found", this.broadcastHandlers);

        // Initialize broadcast lists
        for (let i = 0; i < this.broadcastHandlers.length; i++) {
          this.addLine('broadcasts["' + this.broadcastHandlers[i] + '"] = []');
        }
        if (this.broadcastHandlers.length > 0) {
          this.addLine("");
        }

        // Process each target
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const targetType = target.isStage ? "stage" : "sprite";
          this.log(`Processing ${targetType}`, { name: target.sprite.name });
          this.processTarget(target);
        }

        // Add helpers
        this.generateBroadcastHelper();
        this.generateBroadcastWaitHelper();
        this.generateMainExecution();

        this.log("=== Transpilation Complete ===", {
          codeLength: this.pythonCode.length,
          soundFiles: this.soundFiles,
          scripts: this.mainScripts.length,
          broadcasts: this.broadcastHandlers.length,
        });

        console.log("=== GENERATED SPIKE PYTHON CODE ===\n" + this.pythonCode);
      } catch (error) {
        this.log("ERROR during transpilation", {
          error: error.message,
          stack: error.stack,
        });
        console.error(error);
      }
    }

    generateHeader() {
      this.addLine("#!/usr/bin/env python3");
      this.addLine("# Generated from Scratch by SPIKE Prime Extension");
      this.addLine("# Language: " + currentLang);
      this.addLine("");
      this.addLine("import hub");
      this.addLine("import utime");
      this.addLine("import sys");
      this.addLine("import math");
      this.addLine("import random");
      this.addLine("");
      this.addLine("# Global stop flag");
      this.addLine("stop_all = False");
      this.addLine("");
    }

    generateStopHandlers() {
      this.addLine("def check_stop():");
      this.indentLevel++;
      this.addLine('"""Check if program should stop"""');
      this.addLine("global stop_all");
      this.addLine("if stop_all:");
      this.indentLevel++;
      this.addLine("raise SystemExit");
      this.indentLevel--;
      this.indentLevel--;
      this.addLine("");
    }

    generateHelperFunctions() {
      this.addLine("# Helper functions");
      this.addLine("variables = {}");
      this.addLine("broadcasts = {}");
      this.addLine("movement_motors = ['A', 'B']  # Default movement motors");
      this.addLine("movement_speed = 75  # Default speed");
      this.addLine("timer_start = utime.ticks_ms()  # Timer start time");
      this.addLine("");

      // Motor helper
      this.addLine("def get_motor(port):");
      this.indentLevel++;
      this.addLine('"""Get motor on specified port"""');
      this.addLine("try:");
      this.indentLevel++;
      this.addLine("return hub.port[port].motor");
      this.indentLevel--;
      this.addLine("except:");
      this.indentLevel++;
      this.addLine("return None");
      this.indentLevel--;
      this.indentLevel--;
      this.addLine("");

      // Sensor helper
      this.addLine("def get_sensor(port):");
      this.indentLevel++;
      this.addLine('"""Get sensor on specified port"""');
      this.addLine("try:");
      this.indentLevel++;
      this.addLine("return hub.port[port].device");
      this.indentLevel--;
      this.addLine("except:");
      this.indentLevel++;
      this.addLine("return None");
      this.indentLevel--;
      this.indentLevel--;
      this.addLine("");
    }

    generateBroadcastHelper() {
      this.addLine("def trigger_broadcast(message):");
      this.indentLevel++;
      this.addLine('"""Trigger all handlers for broadcast"""');
      this.addLine("if message in broadcasts:");
      this.indentLevel++;
      this.addLine("for handler in broadcasts[message]:");
      this.indentLevel++;
      this.addLine("handler()");
      this.indentLevel--;
      this.indentLevel--;
      this.indentLevel--;
      this.addLine("");
    }

    generateBroadcastWaitHelper() {
      this.addLine("def trigger_broadcast_wait(message):");
      this.indentLevel++;
      this.addLine('"""Trigger broadcast and wait for completion"""');
      this.addLine("if message in broadcasts:");
      this.indentLevel++;
      this.addLine("for handler in broadcasts[message]:");
      this.indentLevel++;
      this.addLine("handler()");
      this.indentLevel--;
      this.indentLevel--;
      this.indentLevel--;
      this.addLine("");
    }

    generateMainExecution() {
      if (this.mainScripts.length > 0) {
        this.addLine("# Main execution");
        this.addLine("if __name__ == '__main__':");
        this.indentLevel++;
        this.addLine("try:");
        this.indentLevel++;

        for (let i = 0; i < this.mainScripts.length; i++) {
          this.addLine(this.mainScripts[i] + "()");
        }

        this.indentLevel--;
        this.addLine("except KeyboardInterrupt:");
        this.indentLevel++;
        this.addLine('print("Program stopped")');
        this.indentLevel--;
        this.addLine("except SystemExit:");
        this.indentLevel++;
        this.addLine('print("Program exited")');
        this.indentLevel--;
        this.addLine("finally:");
        this.indentLevel++;
        this.addLine('print("Cleaning up...")');
        this.addLine("# Stop all motors");
        this.addLine('for port in "ABCDEF":');
        this.indentLevel++;
        this.addLine("motor = get_motor(port)");
        this.addLine("if motor:");
        this.indentLevel++;
        this.addLine("motor.stop()");
        this.indentLevel--;
        this.indentLevel--;
        this.indentLevel--;
        this.indentLevel--;
      }
    }

    /**
     * Safely add code inside an if block
     * If no code is provided, adds 'pass'
     */
    safeIfBlock(condition, codeFunction) {
      this.addLine(`if ${condition}:`);
      this.indentLevel++;

      const startLineCount = this.pythonCode.split("\n").length;
      codeFunction();
      const endLineCount = this.pythonCode.split("\n").length;

      // If no code was added, add 'pass'
      if (startLineCount === endLineCount) {
        this.addLine("pass");
      }

      this.indentLevel--;
    }

    processTarget(target) {
      const blocks = target.blocks;
      const blockArray = blocks._blocks;
      const blockKeys = Object.keys(blockArray);

      this.log("Processing target blocks", { count: blockKeys.length });

      const hatBlocks = [];
      for (let i = 0; i < blockKeys.length; i++) {
        const block = blockArray[blockKeys[i]];
        if (block.opcode && block.opcode.startsWith("event_when")) {
          hatBlocks.push(block);
        }
      }

      this.log("Found hat blocks", { count: hatBlocks.length });

      for (let i = 0; i < hatBlocks.length; i++) {
        this.processHatBlock(hatBlocks[i], blocks);
      }
    }

    processHatBlock(hatBlock, blocks) {
      this.addLine("# Event: " + hatBlock.opcode);

      const opcode = hatBlock.opcode;
      let funcName = "";

      if (opcode === "event_whenflagclicked") {
        funcName = "on_green_flag_" + this.scriptCounter;
      } else if (opcode === "event_whenbroadcastreceived") {
        const broadcastName = this.getFieldValue(hatBlock, "BROADCAST_OPTION");
        funcName =
          "on_broadcast_" +
          this.sanitizeName(broadcastName) +
          "_" +
          this.scriptCounter;
      } else if (opcode === "event_whenkeypressed") {
        const key = this.getFieldValue(hatBlock, "KEY_OPTION");
        funcName =
          "on_key_" + this.sanitizeName(key) + "_" + this.scriptCounter;
      } else {
        funcName = "on_event_" + this.scriptCounter;
      }

      this.scriptCounter++;

      this.addLine("def " + funcName + "():");
      this.indentLevel++;

      // Measure what the body EMITS, not how many blocks we walked. The old
      // guard counted visited blocks, so a script made only of opcodes this
      // transpiler has no case for produced `def f():` with nothing under it --
      // a Python IndentationError from an otherwise valid project. Found by
      // compiling a corpus of pseudocode programs with python3.
      let currentBlockId = hatBlock.next;
      const bodyStart = this.pythonCode.length;

      while (currentBlockId) {
        const block = blocks._blocks[currentBlockId];
        if (!block) break;

        this.processBlock(block, blocks);
        currentBlockId = block.next;
      }

      // A comment is not a statement. The emitter writes
      // `# Unknown block: <opcode>` for an opcode it has no case for, so
      // pythonCode grows while the body stays empty as far as Python is
      // concerned -- still an IndentationError. Require a line that is
      // neither blank nor a comment.
      const body = this.pythonCode.slice(bodyStart);
      const hasStatement = body
        .split("\n")
        .some((line) => line.trim() !== "" && !line.trim().startsWith("#"));

      if (!hasStatement) {
        // Keep the function valid and say why it is empty, so the gap shows up
        // in the generated source rather than at runtime on the hub.
        this.addLine("pass  # no statement in this script could be translated");
      }

      this.indentLevel--;
      this.addLine("");

      if (opcode === "event_whenflagclicked") {
        this.mainScripts.push(funcName);
      } else if (opcode === "event_whenbroadcastreceived") {
        const broadcastName = this.getFieldValue(hatBlock, "BROADCAST_OPTION");
        this.addLine(
          'broadcasts["' + broadcastName + '"].append(' + funcName + ")"
        );
        this.addLine("");
      }
    }

    processBlock(block, blocks) {
      const opcode = block.opcode;
      this.log("Processing block", { opcode });

      // ============================================================================
      // SPIKE PRIME BLOCKS
      // ============================================================================

      // Movement blocks
      if (opcode === "spikeprime_setMovementMotors") {
        const portA = this.getInputValue(block, "PORT_A", blocks).replace(
          /"/g,
          ""
        );
        const portB = this.getInputValue(block, "PORT_B", blocks).replace(
          /"/g,
          ""
        );
        this.addLine(`# Set movement motors to ${portA} and ${portB}`);
        this.addLine(`movement_motors = ["${portA}", "${portB}"]`);
      } else if (opcode === "spikeprime_moveForward") {
        const direction = this.getInputValue(
          block,
          "DIRECTION",
          blocks
        ).replace(/"/g, "");
        const value = this.getInputValue(block, "VALUE", blocks);
        const unit = this.getInputValue(block, "UNIT", blocks).replace(
          /"/g,
          ""
        );
        const dirMult = direction === "forward" ? 1 : -1;

        if (unit === "cm") {
          const rotations = `(${value} / 17.6)`;
          this.addLine(`for port in movement_motors:`);
          this.indentLevel++;
          this.addLine(`motor = get_motor(port)`);
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(
            `motor.run_for_degrees(int(${rotations} * 360 * ${dirMult}), 75)`
          );
          this.indentLevel--;
          this.indentLevel--;
        } else if (unit === "in") {
          const rotations = `(${value} / 6.93)`;
          this.addLine(`for port in movement_motors:`);
          this.indentLevel++;
          this.addLine(`motor = get_motor(port)`);
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(
            `motor.run_for_degrees(int(${rotations} * 360 * ${dirMult}), 75)`
          );
          this.indentLevel--;
          this.indentLevel--;
        } else if (unit === "rotations") {
          this.addLine(`for port in movement_motors:`);
          this.indentLevel++;
          this.addLine(`motor = get_motor(port)`);
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(
            `motor.run_for_degrees(int(${value} * 360 * ${dirMult}), 75)`
          );
          this.indentLevel--;
          this.indentLevel--;
        } else if (unit === "degrees") {
          this.addLine(`for port in movement_motors:`);
          this.indentLevel++;
          this.addLine(`motor = get_motor(port)`);
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(`motor.run_for_degrees(int(${value} * ${dirMult}), 75)`);
          this.indentLevel--;
          this.indentLevel--;
        } else if (unit === "seconds") {
          this.addLine(`for port in movement_motors:`);
          this.indentLevel++;
          this.addLine(`motor = get_motor(port)`);
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(
            `motor.run_for_time(int(${value} * 1000), 75 * ${dirMult})`
          );
          this.indentLevel--;
          this.indentLevel--;
        }
      } else if (opcode === "spikeprime_steer") {
        const steering = this.getInputValue(block, "STEERING", blocks);
        this.addLine(`# Steering: ${steering}`);
        this.addLine(`left_speed = 75`);
        this.addLine(`right_speed = 75`);
        this.addLine(`if ${steering} > 0:`);
        this.indentLevel++;
        this.addLine(`right_speed = int(75 * (1 - ${steering} / 100))`);
        this.indentLevel--;
        this.addLine(`elif ${steering} < 0:`);
        this.indentLevel++;
        this.addLine(`left_speed = int(75 * (1 + ${steering} / 100))`);
        this.indentLevel--;
        this.addLine(`motor_left = get_motor(movement_motors[0])`);
        this.addLine(`motor_right = get_motor(movement_motors[1])`);
        this.addLine(`if motor_left: motor_left.start(left_speed)`);
        this.addLine(`if motor_right: motor_right.start(right_speed)`);
      } else if (opcode === "spikeprime_startTank") {
        const leftSpeed = this.getInputValue(block, "LEFT_SPEED", blocks);
        const rightSpeed = this.getInputValue(block, "RIGHT_SPEED", blocks);
        this.addLine(`motor_left = get_motor(movement_motors[0])`);
        this.addLine(`motor_right = get_motor(movement_motors[1])`);
        this.addLine(`if motor_left: motor_left.start(${leftSpeed})`);
        this.addLine(`if motor_right: motor_right.start(${rightSpeed})`);
      } else if (opcode === "spikeprime_setMovementSpeed") {
        const speed = this.getInputValue(block, "SPEED", blocks);
        this.addLine(`movement_speed = ${speed}`);
      } else if (opcode === "spikeprime_stopMovement") {
        this.addLine(`for port in movement_motors:`);
        this.indentLevel++;
        this.addLine(`motor = get_motor(port)`);
        this.addLine(`if motor: motor.stop()`);
        this.indentLevel--;
      }

      // SPIKE-specific motor blocks
      else if (opcode === "spikeprime_motorRunFor") {
        console.log(
          `[DEBUG] motorRunFor block.inputs:`,
          Object.keys(block.inputs)
        );
        console.log(`[DEBUG] motorRunFor block.fields:`, block.fields);

        // Check if inputs exist
        if (!block.inputs.DIRECTION) {
          console.warn(`[TRANSPILER] DIRECTION input is missing from block!`);
        }
        if (!block.inputs.UNIT) {
          console.warn(`[TRANSPILER] UNIT input is missing from block!`);
        }

        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        let direction = this.getInputValue(block, "DIRECTION", blocks);
        const value = this.getInputValue(block, "VALUE", blocks);
        let unit = this.getInputValue(block, "UNIT", blocks).replace(/"/g, "");

        console.log(
          `[DEBUG] Extracted: PORT=${port}, DIRECTION=${direction}, VALUE=${value}, UNIT=${unit}`
        );

        // Set defaults if missing
        if (!direction || direction === "0" || direction === '"0"') {
          direction = "1";
        }

        if (!unit || unit === "0") {
          unit = "rotations";
        }

        this.usedMotors.add(port);

        const ports = port.includes("+") ? port.split("+") : [port];

        for (const p of ports) {
          this.addLine(`motor = get_motor("${p}")`);
          this.safeIfBlock("motor", () => {
            if (unit === "rotations") {
              this.addLine(
                `motor.run_for_degrees(int(${value} * 360), ${direction} * 75)`
              );
            } else if (unit === "degrees") {
              this.addLine(
                `motor.run_for_degrees(int(${value}), ${direction} * 75)`
              );
            } else if (unit === "seconds") {
              this.addLine(
                `motor.run_for_time(int(${value} * 1000), ${direction} * 75)`
              );
            } else {
              this.addLine(
                `motor.run_for_degrees(int(${value}), ${direction} * 75)`
              );
            }
          });
        }
      } else if (opcode === "spikeprime_motorRunToPosition") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const position = this.getInputValue(block, "POSITION", blocks);

        this.usedMotors.add(port);
        this.addLine(`motor = get_motor("${port}")`);
        this.addLine(`if motor:`);
        this.indentLevel++;
        this.addLine(`motor.run_to_position(${position}, 75)`);
        this.indentLevel--;
      } else if (opcode === "spikeprime_motorStart") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        let direction = this.getInputValue(block, "DIRECTION", blocks); // ✅ let not const

        // Set default if missing
        if (!direction || direction === "0" || direction === '"0"') {
          direction = "1";
        }

        this.usedMotors.add(port);

        const ports = port.includes("+") ? port.split("+") : [port];

        for (const p of ports) {
          this.addLine(`motor = get_motor("${p}")`);
          this.safeIfBlock("motor", () => {
            this.addLine(`motor.start(${direction} * 75)`);
          });
        }
      } else if (opcode === "spikeprime_motorStartPower") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const power = this.getInputValue(block, "POWER", blocks);

        this.usedMotors.add(port);

        const ports = port.includes("+") ? port.split("+") : [port];

        for (const p of ports) {
          this.addLine(`motor = get_motor("${p}")`);
          this.safeIfBlock("motor", () => {
            // Unregulated: the hub module's duty cycle, -100..100.
            this.addLine(`motor.pwm(int(max(-100, min(100, ${power}))))`);
          });
        }
      } else if (opcode === "spikeprime_motorStop") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );

        this.usedMotors.add(port);

        const ports = port.includes("+") ? port.split("+") : [port];

        for (const _p of ports) {
          this.addLine(`motor = get_motor("${port}")`); // Use 'port' not 'p'
          this.addLine(`if motor:`);
          this.indentLevel++;
          this.addLine(`motor.stop()`);
          this.indentLevel--;
        }
      } else if (opcode === "spikeprime_motorSetSpeed") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const speed = this.getInputValue(block, "SPEED", blocks);
        this.addLine(`# Set motor ${port} speed to ${speed}`);
        this.addLine(`motor_speed_${port.replace(/\+/g, "_")} = ${speed}`);
      } else if (opcode === "spikeprime_motorSetStopAction") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const action = this.getInputValue(block, "ACTION", blocks).replace(
          /"/g,
          ""
        );
        this.addLine(`# Set motor ${port} stop action to ${action}`);
      } else if (opcode === "spikeprime_resetMotorPosition") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const position = this.getInputValue(block, "POSITION", blocks);

        this.usedMotors.add(port);
        this.addLine(`motor = get_motor("${port}")`);
        this.addLine(`if motor:`);
        this.indentLevel++;
        this.addLine(`motor.preset(${position})`);
        this.indentLevel--;
      }

      // Display blocks
      else if (opcode === "spikeprime_displayText") {
        const text = this.getInputValue(block, "TEXT", blocks);
        this.addLine(`hub.display.show(str(${text}))`);
      } else if (opcode === "spikeprime_displayImage") {
        const matrix = this.getInputValue(block, "MATRIX", blocks).replace(
          /"/g,
          ""
        );
        const symbol = (matrix.replace(/\D/g, "") + "0".repeat(25)).slice(
          0,
          25
        );
        const image = symbol
          .replace(/1/g, "9")
          .replace(/0/g, "0")
          .match(/.{5}/g)
          .join(":");
        this.addLine(`hub.display.show(hub.Image("${image}"))`);
      } else if (opcode === "spikeprime_displayPattern") {
        const pattern = this.getInputValue(block, "PATTERN", blocks).replace(
          /"/g,
          ""
        );
        const patternData = DisplayPatterns[pattern];
        if (patternData) {
          const image = patternData
            .replace(/[0-9a-f]/g, (m) => String(Math.min(9, parseInt(m, 16))))
            .match(/.{5}/g)
            .join(":");
          this.addLine(`hub.display.show(hub.Image("${image}"))`);
        }
      } else if (opcode === "spikeprime_displayClear") {
        this.addLine(`hub.display.clear()`);
      } else if (opcode === "spikeprime_setPixel") {
        const x = this.getInputValue(block, "X", blocks);
        const y = this.getInputValue(block, "Y", blocks);
        const brightness = this.getInputValue(block, "BRIGHTNESS", blocks);
        this.addLine(
          `hub.display.pixel(int(${x}) - 1, int(${y}) - 1, int(${brightness} * 9 / 100))`
        );
      } else if (opcode === "spikeprime_rotateDisplay") {
        const angle = this.getInputValue(block, "ANGLE", blocks);
        this.addLine(`hub.display.rotation(${angle})`);
      } else if (opcode === "spikeprime_setCenterButtonColor") {
        const color = this.getInputValue(block, "COLOR", blocks).replace(
          /"/g,
          ""
        );
        const colorValue = CenterLEDColors[color] || 0;
        this.addLine(`hub.led(${colorValue})`);
      }

      // Sound blocks
      else if (opcode === "spikeprime_playHubSound") {
        const sound = this.getInputValue(block, "SOUND", blocks).replace(
          /"/g,
          ""
        );
        this.addLine(`hub.sound.play("/sounds/${sound}")`);
      } else if (opcode === "spikeprime_playBeep") {
        const freq = this.getInputValue(block, "FREQUENCY", blocks);
        const duration = this.getInputValue(block, "DURATION", blocks);
        this.addLine(
          `hub.sound.beep(${freq}, ${duration}, hub.sound.SOUND_SIN)`
        );
      } else if (opcode === "spikeprime_playNote") {
        const note = this.getInputValue(block, "NOTE", blocks);
        const secs = this.getInputValue(block, "SECS", blocks);
        // Convert MIDI note to frequency
        this.addLine(`freq = int(440 * (2 ** ((${note} - 69) / 12)))`);
        this.addLine(
          `hub.sound.beep(freq, int(${secs} * 1000), hub.sound.SOUND_SIN)`
        );
      } else if (opcode === "spikeprime_playWaveBeep") {
        const waveform = this.getInputValue(block, "WAVEFORM", blocks).replace(
          /"/g,
          ""
        );
        const freq = this.getInputValue(block, "FREQUENCY", blocks);
        const duration = this.getInputValue(block, "DURATION", blocks);
        const waveformCode = SoundWaveforms[waveform] || SoundWaveforms.sin;
        this.addLine(`hub.sound.beep(${freq}, ${duration}, ${waveformCode})`);
      } else if (opcode === "spikeprime_setVolume") {
        const volume = this.getInputValue(block, "VOLUME", blocks);
        this.addLine(`hub.sound.volume(${volume})`);
      } else if (opcode === "spikeprime_stopSound") {
        this.addLine(`hub.sound.stop()`);
      }

      // IMU blocks
      else if (opcode === "spikeprime_resetYaw") {
        this.addLine(`hub.motion.reset_yaw()`);
      } else if (opcode === "spikeprime_presetYaw") {
        const angle = this.getInputValue(block, "ANGLE", blocks);
        this.addLine(`hub.motion.preset_yaw(${angle})`);
      }

      // 3x3 Matrix blocks
      else if (opcode === "spikeprime_setMatrix3x3ColorGrid") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const pixels = [
          "P1",
          "P2",
          "P3",
          "P4",
          "P5",
          "P6",
          "P7",
          "P8",
          "P9",
        ].map((pixel) => {
          const emoji = this.getInputValue(block, pixel, blocks).replace(
            /"/g,
            ""
          );
          const colorId = ColorEmojiMap[emoji] || 0;
          return 5 * 16 + colorId;
        });
        const byteString = pixels
          .map((b) => `\\x${b.toString(16).padStart(2, "0")}`)
          .join("");
        this.addLine(`matrix = hub.port.${port}.device`);
        this.addLine(`if matrix:`);
        this.indentLevel++;
        this.addLine(`matrix.mode(2)`);
        this.addLine(`matrix.mode(2, b"${byteString}")`);
        this.indentLevel--;
      } else if (opcode === "spikeprime_setMatrix3x3Custom") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const pattern = this.getInputValue(block, "PATTERN", blocks);
        this.addLine(`# Custom 3x3 matrix pattern on port ${port}`);
        this.addLine(`matrix = hub.port.${port}.device`);
        this.addLine(`if matrix:`);
        this.indentLevel++;
        this.addLine(`matrix.mode(2)`);
        this.addLine(`# Pattern: ${pattern}`);
        this.indentLevel--;
      } else if (opcode === "spikeprime_setMatrix3x3SolidColor") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const colorEmoji = this.getInputValue(block, "COLOR", blocks).replace(
          /"/g,
          ""
        );
        const brightness = this.getInputValue(block, "BRIGHTNESS", blocks);
        const colorId = ColorEmojiMap[colorEmoji] || 0;
        this.addLine(`value = int(${brightness}) * 16 + ${colorId}`);
        this.addLine(`pixels = bytes([value] * 9)`);
        this.addLine(`matrix = hub.port.${port}.device`);
        this.addLine(`if matrix:`);
        this.indentLevel++;
        this.addLine(`matrix.mode(2)`);
        this.addLine(`matrix.mode(2, pixels)`);
        this.indentLevel--;
      } else if (opcode === "spikeprime_clearMatrix3x3") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.addLine(`matrix = hub.port.${port}.device`);
        this.addLine(`if matrix:`);
        this.indentLevel++;
        this.addLine(`matrix.mode(2)`);
        this.addLine(
          `matrix.mode(2, b"\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01")`
        );
        this.indentLevel--;
      }

      // Timer blocks
      else if (opcode === "spikeprime_resetTimer") {
        this.addLine(`timer_start = utime.ticks_ms()`);
      }

      // Sensor blocks
      else if (opcode === "spikeprime_setDistanceLights") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const tl = this.getInputValue(block, "TL", blocks);
        const tr = this.getInputValue(block, "TR", blocks);
        const bl = this.getInputValue(block, "BL", blocks);
        const br = this.getInputValue(block, "BR", blocks);
        this.addLine(`dist_sensor = hub.port.${port}.device`);
        this.addLine(`if dist_sensor:`);
        this.indentLevel++;
        this.addLine(
          `dist_sensor.mode(5, bytes([${tl}, ${tr}, ${bl}, ${br}]))`
        );
        this.indentLevel--;
      }

      // File System blocks
      else if (opcode === "spikeprime_writeLogFile") {
        const filename = this.getInputValue(block, "FILENAME", blocks).replace(
          /"/g,
          ""
        );
        const text = this.getInputValue(block, "TEXT", blocks);
        this.addLine(`with open("${filename}", "a") as f:`);
        this.indentLevel++;
        this.addLine(`f.write(str(${text}) + "\\n")`);
        this.indentLevel--;
      } else if (opcode === "spikeprime_deleteLogFile") {
        const filename = this.getInputValue(block, "FILENAME", blocks).replace(
          /"/g,
          ""
        );
        this.addLine(`import uos`);
        this.addLine(`try:`);
        this.indentLevel++;
        this.addLine(`uos.remove("${filename}")`);
        this.indentLevel--;
        this.addLine(`except:`);
        this.indentLevel++;
        this.addLine(`pass`);
        this.indentLevel--;
      }

      // Python blocks
      else if (opcode === "spikeprime_runPythonCommand") {
        const code = this.getInputValue(block, "CODE", blocks);
        // Remove quotes if present
        const cleanCode = code.replace(/^["']|["']$/g, "");
        this.addLine(`${cleanCode}`);
      } else if (opcode === "spikeprime_runHubCommand") {
        const code = this.getInputValue(block, "CODE", blocks);
        const cleanCode = code.replace(/^["']|["']$/g, "");
        this.addLine(`${cleanCode}`);
      } else if (opcode === "spikeprime_exitScript") {
        this.addLine(`raise SystemExit`);
      }

      // ============================================================================
      // STANDARD SCRATCH BLOCKS
      // ============================================================================

      // Motion blocks
      else if (opcode === "motion_movesteps") {
        const steps = this.getInputValue(block, "STEPS", blocks);
        this.addLine(`# Move ${steps} steps`);
        this.addLine(`for port in movement_motors:`);
        this.indentLevel++;
        this.addLine(`motor = get_motor(port)`);
        this.addLine(`if motor:`);
        this.indentLevel++;
        this.addLine(`motor.run_for_degrees(int(${steps} * 3.6), 50)`);
        this.indentLevel--;
        this.indentLevel--;
      } else if (opcode === "motion_turnright") {
        const degrees = this.getInputValue(block, "DEGREES", blocks);
        this.addLine(`# Turn right ${degrees} degrees`);
        this.addLine(`motor_left = get_motor(movement_motors[0])`);
        this.addLine(`motor_right = get_motor(movement_motors[1])`);
        this.addLine(`if motor_left and motor_right:`);
        this.indentLevel++;
        this.addLine(`motor_left.run_for_degrees(int(${degrees}), 50)`);
        this.addLine(`motor_right.run_for_degrees(int(${degrees}), -50)`);
        this.indentLevel--;
      } else if (opcode === "motion_turnleft") {
        const degrees = this.getInputValue(block, "DEGREES", blocks);
        this.addLine(`# Turn left ${degrees} degrees`);
        this.addLine(`motor_left = get_motor(movement_motors[0])`);
        this.addLine(`motor_right = get_motor(movement_motors[1])`);
        this.addLine(`if motor_left and motor_right:`);
        this.indentLevel++;
        this.addLine(`motor_left.run_for_degrees(int(${degrees}), -50)`);
        this.addLine(`motor_right.run_for_degrees(int(${degrees}), 50)`);
        this.indentLevel--;
      }

      // Control blocks
      else if (opcode === "control_wait") {
        const duration = this.getInputValue(block, "DURATION", blocks);
        this.addLine(`utime.sleep(${duration})`);
        this.addLine(`check_stop()`);
      } else if (opcode === "control_repeat") {
        const times = this.getInputValue(block, "TIMES", blocks);
        this.addLine(`for i in range(int(${times})):`);
        this.indentLevel++;
        this.addLine(`check_stop()`);

        const substackId = this.getSubstackId(block, "SUBSTACK");
        if (substackId) {
          this.processBlockChain(substackId, blocks);
        } else {
          this.addLine(`pass`);
        }
        this.indentLevel--;
      } else if (opcode === "control_forever") {
        this.addLine(`while True:`);
        this.indentLevel++;
        this.addLine(`check_stop()`);

        const substackId = this.getSubstackId(block, "SUBSTACK");
        if (substackId) {
          this.processBlockChain(substackId, blocks);
        } else {
          this.addLine(`pass`);
        }
        this.addLine(`utime.sleep(0.01)`);
        this.indentLevel--;
      } else if (opcode === "control_if") {
        const condition = this.getInputValue(block, "CONDITION", blocks);
        this.addLine(`if ${condition}:`);
        this.indentLevel++;

        const substackId = this.getSubstackId(block, "SUBSTACK");
        if (substackId) {
          this.processBlockChain(substackId, blocks);
        } else {
          this.addLine(`pass`);
        }
        this.indentLevel--;
      } else if (opcode === "control_if_else") {
        const condition = this.getInputValue(block, "CONDITION", blocks);
        this.addLine(`if ${condition}:`);
        this.indentLevel++;

        const substackId = this.getSubstackId(block, "SUBSTACK");
        if (substackId) {
          this.processBlockChain(substackId, blocks);
        } else {
          this.addLine(`pass`);
        }

        this.indentLevel--;
        this.addLine(`else:`);
        this.indentLevel++;

        const substack2Id = this.getSubstackId(block, "SUBSTACK2");
        if (substack2Id) {
          this.processBlockChain(substack2Id, blocks);
        } else {
          this.addLine(`pass`);
        }
        this.indentLevel--;
      } else if (opcode === "control_repeat_until") {
        const condition = this.getInputValue(block, "CONDITION", blocks);
        this.addLine(`while not (${condition}):`);
        this.indentLevel++;
        this.addLine(`check_stop()`);

        const substackId = this.getSubstackId(block, "SUBSTACK");
        if (substackId) {
          this.processBlockChain(substackId, blocks);
        } else {
          this.addLine(`pass`);
        }
        this.indentLevel--;
      } else if (opcode === "control_stop") {
        const stopOption = this.getFieldValue(block, "STOP_OPTION") || "all";
        if (stopOption === "all") {
          this.addLine(`global stop_all`);
          this.addLine(`stop_all = True`);
          this.addLine(`raise SystemExit`);
        } else {
          this.addLine(`return`);
        }
      }

      // Event blocks
      else if (opcode === "event_broadcast") {
        const broadcastInput = this.getInputValue(
          block,
          "BROADCAST_INPUT",
          blocks
        );
        this.addLine(`trigger_broadcast(${broadcastInput})`);
      } else if (opcode === "event_broadcastandwait") {
        const broadcastInput = this.getInputValue(
          block,
          "BROADCAST_INPUT",
          blocks
        );
        this.addLine(`trigger_broadcast_wait(${broadcastInput})`);
      }

      // Looks blocks
      else if (opcode === "looks_say" || opcode === "looks_sayforsecs") {
        const message = this.getInputValue(block, "MESSAGE", blocks);
        this.addLine(`hub.display.show(str(${message}))`);
        if (opcode === "looks_sayforsecs") {
          const secs = this.getInputValue(block, "SECS", blocks);
          this.addLine(`utime.sleep(${secs})`);
          this.addLine(`hub.display.clear()`);
        }
      }

      // Sound blocks
      else if (opcode === "sound_play" || opcode === "sound_playuntildone") {
        const soundMenu = this.getInputValue(block, "SOUND_MENU", blocks);
        const soundName = soundMenu.replace(/"/g, "");
        if (soundName && soundName !== "0") {
          this.addLine(`# Play sound: ${soundName}`);
          this.addLine(`hub.sound.beep(440, 200, hub.sound.SOUND_SIN)`);
        } else {
          this.addLine(`hub.sound.beep(440, 200, hub.sound.SOUND_SIN)`);
        }
      }

      // Data blocks
      else if (opcode === "data_setvariableto") {
        const varName = this.getFieldValue(block, "VARIABLE");
        const value = this.getInputValue(block, "VALUE", blocks);
        this.addLine(`variables["${varName}"] = ${value}`);
      } else if (opcode === "data_changevariableby") {
        const varName = this.getFieldValue(block, "VARIABLE");
        const value = this.getInputValue(block, "VALUE", blocks);
        this.addLine(
          `variables["${varName}"] = variables.get("${varName}", 0) + (${value})`
        );
      }

      // Default - Unknown block
      else {
        this.addLine(`# Unknown block: ${opcode}`);
      }
    }

    processBlockChain(blockId, blocks) {
      let currentId = blockId;
      let chainLength = 0;

      while (currentId) {
        const block = blocks._blocks[currentId];
        if (!block) break;

        chainLength++;
        if (chainLength > 1000) {
          this.log("WARNING: Block chain too long, stopping", { chainLength });
          break;
        }

        this.processBlock(block, blocks);
        currentId = block.next;
      }
    }

    getInputValue(block, inputName, blocks) {
      const input = block.inputs[inputName];

      if (!input) {
        console.log(`[DEBUG] ${inputName} not in inputs, checking fields...`);

        if (block.fields && block.fields[inputName]) {
          const field = block.fields[inputName];
          const value = field.value || field.id || field.name || field[0];
          console.log(`[DEBUG] Found ${inputName} in fields:`, value);

          // Return the value (with or without quotes depending on type)
          if (this.isNumeric(value)) {
            return String(value);
          }
          return pyStringLiteral(value);
        }

        console.warn(`[DEBUG] ${inputName} not found in inputs or fields`);
        return "0";
      }

      // Handle object-style inputs
      if (typeof input === "object" && !Array.isArray(input)) {
        // Object has { name, block, shadow } structure

        // Try the main block first
        if (input.block && typeof input.block === "string") {
          const refBlock = blocks._blocks[input.block];
          if (refBlock) {
            const result = this.evaluateBlock(refBlock, blocks);
            console.log(
              `[DEBUG] Resolved block reference ${input.block} to:`,
              result
            );
            return result;
          }
        }

        // Fall back to shadow block
        if (input.shadow && typeof input.shadow === "string") {
          const shadowBlock = blocks._blocks[input.shadow];
          if (shadowBlock) {
            const result = this.evaluateBlock(shadowBlock, blocks);
            console.log(
              `[DEBUG] Resolved shadow reference ${input.shadow} to:`,
              result
            );
            return result;
          }
        }

        console.warn(`[TRANSPILER] Could not resolve input object`, input);
        return "0";
      }

      // Handle array-style inputs
      if (!Array.isArray(input)) return "0";

      const inputType = input[0];
      const inputData = input[1];

      // Type 1, 2, or 3 - may contain block reference or primitive
      if (inputType === 1 || inputType === 2 || inputType === 3) {
        if (Array.isArray(inputData)) {
          const primitiveType = inputData[0];
          const primitiveValue = inputData[1];

          if (
            primitiveType === 4 ||
            primitiveType === 5 ||
            primitiveType === 6 ||
            primitiveType === 7
          ) {
            return String(primitiveValue);
          } else if (primitiveType === 10) {
            if (this.isNumeric(primitiveValue)) {
              return String(primitiveValue);
            }
            return pyStringLiteral(primitiveValue);
          }
        } else if (typeof inputData === "string") {
          const refBlock = blocks._blocks[inputData];
          if (refBlock) return this.evaluateBlock(refBlock, blocks);
        }

        // Handle type 3 with both block reference and shadow
        if (
          inputType === 3 &&
          Array.isArray(inputData) &&
          inputData.length >= 2
        ) {
          // First try the block reference
          if (typeof inputData[0] === "string") {
            const refBlock = blocks._blocks[inputData[0]];
            if (refBlock) return this.evaluateBlock(refBlock, blocks);
          }

          // Fall back to shadow value
          const shadowData = inputData[1];
          if (Array.isArray(shadowData)) {
            const primitiveType = shadowData[0];
            const primitiveValue = shadowData[1];

            if (
              primitiveType === 4 ||
              primitiveType === 5 ||
              primitiveType === 6 ||
              primitiveType === 7
            ) {
              return String(primitiveValue);
            } else if (primitiveType === 10) {
              if (this.isNumeric(primitiveValue)) {
                return String(primitiveValue);
              }
              return pyStringLiteral(primitiveValue);
            }
          }
        }
      }

      return "0";
    }

    evaluateBlock(block, blocks) {
      console.log(`[DEBUG] evaluateBlock called:`, {
        opcode: block.opcode,
        hasFields: !!block.fields,
        fields: block.fields,
        hasInputs: !!block.inputs,
      });

      // Number blocks
      if (
        block.opcode === "math_number" ||
        block.opcode === "math_whole_number" ||
        block.opcode === "math_positive_number" ||
        block.opcode === "math_integer"
      ) {
        const num = this.getFieldValue(block, "NUM");
        return num || "0";
      }
      // Text blocks
      else if (block.opcode === "text") {
        const text = this.getFieldValue(block, "TEXT");
        if (this.isNumeric(text)) return String(text);
        return pyStringLiteral(text || "");
      }

      // Menu blocks - extract field value
      else if (block.opcode && block.opcode.startsWith("spikeprime_menu_")) {
        // Extract menu name: "spikeprime_menu_DIRECTION" -> "DIRECTION"
        const menuName = block.opcode.replace("spikeprime_menu_", "");

        console.log(
          `[DEBUG] Menu block ${block.opcode}, fields:`,
          block.fields
        );

        let value = null;

        // Try the menu name as field name
        if (block.fields && block.fields[menuName]) {
          const field = block.fields[menuName];
          value = field.value || field.id || field.name || field[0];
        }

        // Try first available field
        if (!value && block.fields) {
          const fieldNames = Object.keys(block.fields);
          if (fieldNames.length > 0) {
            const field = block.fields[fieldNames[0]];
            value = field.value || field.id || field.name || field[0];
          }
        }

        if (!value) {
          console.warn(
            `[TRANSPILER] Could not extract menu value from ${block.opcode}`,
            block
          );
          return '"default"';
        }

        console.log(`[DEBUG] Extracted menu value:`, value);

        // Determine if numeric or string
        const numericMenus = ["DIRECTION", "BRIGHTNESS", "BRIGHTNESS_1_TO_10"];

        if (numericMenus.includes(menuName) || this.isNumeric(value)) {
          return String(value); // Return as number (no quotes)
        }

        return pyStringLiteral(value); // Return as string (with quotes)
      }

      // Event broadcast menu
      else if (block.opcode === "event_broadcast_menu") {
        const broadcast = this.getFieldValue(block, "BROADCAST_OPTION");
        return pyStringLiteral(broadcast || "message1");
      }

      // Variables
      else if (block.opcode === "data_variable") {
        const varName = this.getFieldValue(block, "VARIABLE");
        return `variables.get("${varName}", 0)`;
      }

      // SPIKE sensor reporters
      else if (block.opcode === "spikeprime_getPosition") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_motor("${port}").get()[1] if get_motor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getSpeed") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_motor("${port}").get()[0] if get_motor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getAngle") {
        const axis = this.getInputValue(block, "AXIS", blocks).replace(
          /"/g,
          ""
        );
        const axisMap = { pitch: 1, roll: 2, yaw: 0 };
        const idx = axisMap[axis] || 0;
        return `hub.motion.position()[${idx}]`;
      } else if (block.opcode === "spikeprime_getBatteryLevel") {
        return "hub.battery.voltage()";
      } else if (block.opcode === "spikeprime_getTimer") {
        return "((utime.ticks_ms() - timer_start) / 1000.0)";
      } else if (block.opcode === "spikeprime_getDistance") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_sensor("${port}").get()[0] if get_sensor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getColor") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_sensor("${port}").get()[0] if get_sensor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getReflection") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_sensor("${port}").get()[1] if get_sensor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getColorRGB") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        const channel = this.getInputValue(block, "CHANNEL", blocks).replace(
          /"/g,
          ""
        );
        const idx = { red: 3, green: 4, blue: 5 }[channel] ?? 3;
        this.usedSensors.add(port);
        return `(get_sensor("${port}").get()[${idx}] if get_sensor("${port}") else 0)`;
      } else if (block.opcode === "spikeprime_getForce") {
        const port = this.getInputValue(block, "PORT", blocks).replace(
          /"/g,
          ""
        );
        this.usedSensors.add(port);
        return `(get_sensor("${port}").get()[0] if get_sensor("${port}") else 0)`;
      }

      // Operators
      else if (block.opcode === "operator_gt") {
        const op1 = this.getInputValue(block, "OPERAND1", blocks);
        const op2 = this.getInputValue(block, "OPERAND2", blocks);
        return `(${op1} > ${op2})`;
      } else if (block.opcode === "operator_lt") {
        const op1 = this.getInputValue(block, "OPERAND1", blocks);
        const op2 = this.getInputValue(block, "OPERAND2", blocks);
        return `(${op1} < ${op2})`;
      } else if (block.opcode === "operator_equals") {
        const op1 = this.getInputValue(block, "OPERAND1", blocks);
        const op2 = this.getInputValue(block, "OPERAND2", blocks);
        return `(${op1} == ${op2})`;
      } else if (block.opcode === "operator_and") {
        const op1 = this.getInputValue(block, "OPERAND1", blocks);
        const op2 = this.getInputValue(block, "OPERAND2", blocks);
        return `(${op1} and ${op2})`;
      } else if (block.opcode === "operator_or") {
        const op1 = this.getInputValue(block, "OPERAND1", blocks);
        const op2 = this.getInputValue(block, "OPERAND2", blocks);
        return `(${op1} or ${op2})`;
      } else if (block.opcode === "operator_not") {
        const op = this.getInputValue(block, "OPERAND", blocks);
        return `(not ${op})`;
      } else if (block.opcode === "operator_add") {
        const num1 = this.getInputValue(block, "NUM1", blocks);
        const num2 = this.getInputValue(block, "NUM2", blocks);
        return `(${num1} + ${num2})`;
      } else if (block.opcode === "operator_subtract") {
        const num1 = this.getInputValue(block, "NUM1", blocks);
        const num2 = this.getInputValue(block, "NUM2", blocks);
        return `(${num1} - ${num2})`;
      } else if (block.opcode === "operator_multiply") {
        const num1 = this.getInputValue(block, "NUM1", blocks);
        const num2 = this.getInputValue(block, "NUM2", blocks);
        return `(${num1} * ${num2})`;
      } else if (block.opcode === "operator_divide") {
        const num1 = this.getInputValue(block, "NUM1", blocks);
        const num2 = this.getInputValue(block, "NUM2", blocks);
        return `(${num1} / ${num2})`;
      } else if (block.opcode === "operator_random") {
        const from = this.getInputValue(block, "FROM", blocks);
        const to = this.getInputValue(block, "TO", blocks);
        return `random.randint(int(${from}), int(${to}))`;
      } else if (block.opcode === "operator_join") {
        const s1 = this.getInputValue(block, "STRING1", blocks);
        const s2 = this.getInputValue(block, "STRING2", blocks);
        return `(str(${s1}) + str(${s2}))`;
      } else if (block.opcode === "operator_mod") {
        const num1 = this.getInputValue(block, "NUM1", blocks);
        const num2 = this.getInputValue(block, "NUM2", blocks);
        return `(${num1} % ${num2})`;
      } else if (block.opcode === "operator_round") {
        const num = this.getInputValue(block, "NUM", blocks);
        return `round(${num})`;
      } else if (block.opcode === "operator_mathop") {
        const operator = this.getFieldValue(block, "OPERATOR");
        const num = this.getInputValue(block, "NUM", blocks);
        const mathOps = {
          abs: `abs(${num})`,
          floor: `math.floor(${num})`,
          ceiling: `math.ceil(${num})`,
          sqrt: `math.sqrt(${num})`,
          sin: `math.sin(math.radians(${num}))`,
          cos: `math.cos(math.radians(${num}))`,
          tan: `math.tan(math.radians(${num}))`,
          asin: `math.degrees(math.asin(${num}))`,
          acos: `math.degrees(math.acos(${num}))`,
          atan: `math.degrees(math.atan(${num}))`,
          ln: `math.log(${num})`,
          log: `math.log10(${num})`,
          "e ^": `math.exp(${num})`,
          "10 ^": `(10 ** ${num})`,
        };
        return mathOps[operator] || `${num}`;
      }

      return "0";
    }

    getFieldValue(block, fieldName) {
      if (block.fields && block.fields[fieldName]) {
        const field = block.fields[fieldName];
        // Try multiple possible locations for the value
        const value = field.value || field.id || field.name || field[0];
        return value;
      }
      return null;
    }

    getSubstackId(block, substackName) {
      const substack = block.inputs[substackName];
      if (!substack) return null;

      if (typeof substack === "object" && !Array.isArray(substack)) {
        return substack.block || null;
      }

      if (Array.isArray(substack) && substack.length >= 2) {
        return substack[1];
      }

      return null;
    }

    noteToFrequency(note) {
      if (typeof note === "number") {
        return Math.pow(2, (note - 69 + 12) / 12) * 440;
      }
      return 440;
    }

    getCode() {
      return this.pythonCode;
    }
  }

  // ============================================================================
  // EXTENSION CLASS
  // ============================================================================
  class SpikePrimeExtension {
    constructor(runtime) {
      this.runtime = runtime;
      if (!this.runtime && typeof Scratch !== "undefined" && Scratch.vm) {
        this.runtime = Scratch.vm.runtime;
      }
      // One router standing in for what used to be five extensions. It holds
      // both hubs and forwards every peripheral call to whichever firmware
      // answered, so the blocks below are written against one surface.
      this._peripheral = new HubRouter(this.runtime, "spikeprime");
      this._transpiler = new SpikeTranspiler();
      console.log("🤖 [SPIKE] Extension loaded - Language:", currentLang);
    }

    getInfo() {
      return {
        id: "spikeprime",
        name: t("extensionName"),
        blockIconURI: iconURI,
        showStatusButton: true,
        blocks: [
          // Connection Section
          //
          // These are what the four other SPIKE extensions each offered in
          // their own spelling. The hub connects through the status button
          // like any Scratch peripheral; these blocks exist so a project can
          // also connect, check, and choose a route from inside the script —
          // which is what `spikeprimeble`, `spikeprimeBridge` and
          // `legospikeprimeBLE` let it do, and what would otherwise be lost.
          {
            blockType: BlockType.LABEL,
            text: t("connectionLabel"),
          },
          {
            opcode: "connectHub",
            blockType: BlockType.COMMAND,
            text: t("connectHub"),
          },
          {
            opcode: "connectHubAt",
            blockType: BlockType.COMMAND,
            text: t("connectHubAt"),
            arguments: {
              URL: {
                type: ArgumentType.STRING,
                defaultValue: "localhost:8081",
              },
            },
          },
          {
            opcode: "disconnectHub",
            blockType: BlockType.COMMAND,
            text: t("disconnectHub"),
          },
          {
            opcode: "isConnected",
            blockType: BlockType.BOOLEAN,
            text: t("isConnected"),
          },
          {
            opcode: "getHubType",
            blockType: BlockType.REPORTER,
            text: t("getHubType"),
          },
          {
            opcode: "getFirmwareVersion",
            blockType: BlockType.REPORTER,
            text: t("getFirmwareVersion"),
          },
          {
            opcode: "getConnectionMode",
            blockType: BlockType.REPORTER,
            text: t("getConnectionMode"),
          },
          {
            opcode: "getCommunicationDiagnostics",
            blockType: BlockType.REPORTER,
            text: t("getCommunicationDiagnostics"),
          },
          {
            opcode: "getCommunicationDiagnosticsSummary",
            blockType: BlockType.REPORTER,
            text: t("getCommunicationDiagnosticsSummary"),
          },
          {
            opcode: "openCommunicationDiagnosticsLog",
            blockType: BlockType.COMMAND,
            text: t("openCommunicationDiagnosticsLog"),
          },
          ...(isStartupProbeDeveloperMode()
            ? [
                {
                  opcode: "runStartupProbe",
                  blockType: BlockType.COMMAND,
                  text: t("startupProbeBlock"),
                  arguments: {
                    PROBE: {
                      type: ArgumentType.STRING,
                      menu: "SPIKE_STARTUP_PROBE",
                      defaultValue: "00",
                    },
                    SLOT: {
                      type: ArgumentType.NUMBER,
                      defaultValue: 0,
                    },
                  },
                },
              ]
            : []),
          {
            opcode: "installHubController",
            blockType: BlockType.COMMAND,
            text: t("installHubController"),
            arguments: {
              SLOT: {
                type: ArgumentType.NUMBER,
                defaultValue: 19,
              },
            },
          },
          {
            opcode: "checkHubController",
            blockType: BlockType.COMMAND,
            text: t("checkHubController"),
          },
          {
            opcode: "setConnectionMode",
            blockType: BlockType.COMMAND,
            text: t("setConnectionMode"),
            arguments: {
              MODE: {
                type: ArgumentType.STRING,
                menu: "CONNECTION_MODE",
                defaultValue: "auto",
              },
            },
          },
          {
            opcode: "enableStreamingMode",
            blockType: BlockType.COMMAND,
            text: t("enableStreamingMode"),
          },
          {
            opcode: "disableStreamingMode",
            blockType: BlockType.COMMAND,
            text: t("disableStreamingMode"),
          },

          // Transpilation Section
          {
            blockType: BlockType.LABEL,
            text: t("transpilationLabel"),
          },
          {
            opcode: "transpileProject",
            blockType: BlockType.COMMAND,
            text: t("transpileProject"),
          },
          {
            opcode: "showCode",
            blockType: BlockType.COMMAND,
            text: t("showCode"),
          },
          {
            opcode: "downloadCode",
            blockType: BlockType.COMMAND,
            text: t("downloadCode"),
          },
          {
            opcode: "getTranspiledCode",
            blockType: BlockType.REPORTER,
            text: t("getTranspiledCode"),
          },

          {
            blockType: BlockType.LABEL,
            text: t("fileManagementLabel"),
          },
          {
            opcode: "uploadScriptToHub",
            blockType: BlockType.COMMAND,
            text: t("uploadScriptToHub"),
            arguments: {
              NAME: {
                type: ArgumentType.STRING,
                defaultValue: t("scriptName"),
              },
            },
          },
          {
            opcode: "runScriptOnHub",
            blockType: BlockType.COMMAND,
            text: t("runScriptOnHub"),
            arguments: {
              NAME: {
                type: ArgumentType.STRING,
                defaultValue: t("scriptName"),
              },
            },
          },
          {
            opcode: "renameScriptOnHub",
            blockType: BlockType.COMMAND,
            text: t("renameScriptOnHub"),
            arguments: {
              OLD: {
                type: ArgumentType.STRING,
                defaultValue: t("oldScriptName"),
              },
              NEW: {
                type: ArgumentType.STRING,
                defaultValue: t("newScriptName"),
              },
            },
          },
          {
            opcode: "deleteScriptOnHub",
            blockType: BlockType.COMMAND,
            text: t("deleteScriptOnHub"),
            arguments: {
              NAME: {
                type: ArgumentType.STRING,
                defaultValue: t("scriptName"),
              },
            },
          },
          {
            opcode: "listScriptsOnHub",
            blockType: BlockType.REPORTER,
            text: t("listScriptsOnHub"),
          },
          {
            opcode: "stopRunningScript",
            blockType: BlockType.COMMAND,
            text: t("stopRunningScript"),
          },

          "---",

          // Movement
          {
            opcode: "setMovementMotors",
            text: t("setMovementMotors"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT_A: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              PORT_B: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "B",
              },
            },
          },
          {
            opcode: "moveForward",
            text: t("moveForward"),
            blockType: BlockType.COMMAND,
            arguments: {
              DIRECTION: {
                type: ArgumentType.STRING,
                menu: "MOVE_DIRECTION",
                defaultValue: "forward",
              },
              VALUE: { type: ArgumentType.NUMBER, defaultValue: 10 },
              UNIT: {
                type: ArgumentType.STRING,
                menu: "MOVE_UNIT",
                defaultValue: "cm",
              },
            },
          },
          {
            opcode: "steer",
            text: t("steer"),
            blockType: BlockType.COMMAND,
            arguments: {
              STEERING: { type: ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            // `legospikeprimeBLE` steered and set the pair speed together.
            // `steer` leaves the speed at whatever setMovementSpeed last set,
            // so both behaviours stay reachable.
            opcode: "motorPairMove",
            text: t("motorPairMove"),
            blockType: BlockType.COMMAND,
            arguments: {
              STEERING: { type: ArgumentType.NUMBER, defaultValue: 0 },
              SPEED: { type: ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "startTank",
            text: t("startTank"),
            blockType: BlockType.COMMAND,
            arguments: {
              LEFT_SPEED: { type: ArgumentType.NUMBER, defaultValue: 50 },
              RIGHT_SPEED: { type: ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "setMovementSpeed",
            text: t("setMovementSpeed"),
            blockType: BlockType.COMMAND,
            arguments: {
              SPEED: { type: ArgumentType.NUMBER, defaultValue: 50 },
            },
          },
          {
            opcode: "stopMovement",
            text: t("stopMovement"),
            blockType: BlockType.COMMAND,
          },
          "---",
          // Motors
          {
            opcode: "motorRunFor",
            text: t("motorRunFor"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              DIRECTION: {
                type: ArgumentType.NUMBER,
                menu: "DIRECTION",
                defaultValue: 1,
              },
              VALUE: { type: ArgumentType.NUMBER, defaultValue: 1 },
              UNIT: {
                type: ArgumentType.STRING,
                menu: "MOTOR_UNIT",
                defaultValue: "rotations",
              },
            },
          },
          {
            opcode: "motorRunToPosition",
            text: t("motorRunToPosition"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "C",
              },
              POSITION: { type: ArgumentType.ANGLE, defaultValue: 0 },
            },
          },
          {
            opcode: "motorStart",
            text: t("motorStart"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              DIRECTION: {
                type: ArgumentType.NUMBER,
                menu: "DIRECTION",
                defaultValue: 1,
              },
            },
          },
          {
            opcode: "motorStop",
            text: t("motorStop"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
            },
          },
          {
            // `spikeprimeble` combined "set the speed" and "start turning" in
            // one block. Kept as its own block rather than folded into
            // motorStart, whose DIRECTION argument means something else.
            opcode: "startMotor",
            text: t("startMotor"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              SPEED: { type: ArgumentType.NUMBER, defaultValue: 75 },
            },
          },
          {
            // motorStop with an explicit stop action, as `spikeprimeble` had
            // it. motorStop keeps using the port's configured stop action.
            opcode: "stopMotor",
            text: t("stopMotor"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              ACTION: {
                type: ArgumentType.STRING,
                menu: "STOP_ACTION",
                defaultValue: "brake",
              },
            },
          },
          {
            opcode: "motorSetSpeed",
            text: t("motorSetSpeed"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              SPEED: { type: ArgumentType.NUMBER, defaultValue: 75 },
            },
          },
          {
            // The SPIKE app's "More Motors" block "start motor at % power":
            // an unregulated duty cycle, not a speed. The hub does not hold a
            // speed under load (the motor slows, and stalls at a hard stop).
            // SPIKE 3 Python: motor.set_duty_cycle(port, -10000..10000);
            // 2.x hub module: hub.port.X.motor.pwm(-100..100).
            opcode: "motorStartPower",
            text: t("motorStartPower"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "MULTIPLE_PORT",
                defaultValue: "A",
              },
              POWER: { type: ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "motorSetStopAction",
            text: t("motorSetStopAction"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              ACTION: {
                type: ArgumentType.STRING,
                menu: "STOP_ACTION",
                defaultValue: "brake",
              },
            },
          },
          {
            opcode: "getPosition",
            text: t("getPosition"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "getRelativePosition",
            text: t("getRelativePosition"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "getAbsolutePosition",
            text: t("getAbsolutePosition"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "getSpeed",
            text: t("getSpeed"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "resetMotorPosition",
            text: t("resetMotorPosition"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              POSITION: { type: ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          "---",
          // Display
          {
            opcode: "displayText",
            text: t("displayText"),
            blockType: BlockType.COMMAND,
            arguments: {
              TEXT: { type: ArgumentType.STRING, defaultValue: "Hello" },
            },
          },
          {
            opcode: "displayImage",
            text: t("displayImage"),
            blockType: BlockType.COMMAND,
            arguments: {
              MATRIX: {
                type: ArgumentType.MATRIX,
                defaultValue: "1101111011000001000101110",
              },
            },
          },
          {
            opcode: "displayPattern",
            text: t("displayPattern"),
            blockType: BlockType.COMMAND,
            arguments: {
              PATTERN: {
                type: ArgumentType.STRING,
                menu: "DISPLAY_PATTERN",
                defaultValue: "heart",
              },
            },
          },
          {
            opcode: "displayClear",
            text: t("displayClear"),
            blockType: BlockType.COMMAND,
          },
          {
            // The 3.x firmware carries a table of built-in images addressed by
            // number; `displayImage` instead takes a 25-pixel bitmap. Neither
            // replaces the other, so both are offered.
            opcode: "displayShowImage",
            text: t("displayShowImage"),
            blockType: BlockType.COMMAND,
            arguments: {
              IMAGE: { type: ArgumentType.NUMBER, defaultValue: 1 },
            },
          },
          {
            opcode: "setPixel",
            text: t("setPixel"),
            blockType: BlockType.COMMAND,
            arguments: {
              X: { type: ArgumentType.NUMBER, defaultValue: 3 },
              Y: { type: ArgumentType.NUMBER, defaultValue: 3 },
              BRIGHTNESS: { type: ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "rotateDisplay",
            text: t("rotateDisplay"),
            blockType: BlockType.COMMAND,
            arguments: {
              ANGLE: {
                type: ArgumentType.STRING,
                menu: "ROTATION_ANGLE",
                defaultValue: "90",
              },
            },
          },
          {
            opcode: "setCenterButtonColor",
            text: t("setCenterButtonColor"),
            blockType: BlockType.COMMAND,
            arguments: {
              COLOR: {
                type: ArgumentType.STRING,
                menu: "CENTER_LED_COLOR",
                defaultValue: "GREEN",
              },
            },
          },
          "---",
          // IMU & Gyro
          {
            opcode: "getAngle",
            text: t("getAngle"),
            blockType: BlockType.REPORTER,
            arguments: {
              AXIS: {
                type: ArgumentType.STRING,
                menu: "AXIS",
                defaultValue: "pitch",
              },
            },
          },
          {
            opcode: "getGyroRate",
            text: t("getGyroRate"),
            blockType: BlockType.REPORTER,
            arguments: {
              AXIS: {
                type: ArgumentType.STRING,
                menu: "AXIS",
                defaultValue: "yaw",
              },
            },
          },
          {
            opcode: "getFilteredGyroRate",
            text: t("getFilteredGyroRate"),
            blockType: BlockType.REPORTER,
            arguments: {
              AXIS: {
                type: ArgumentType.STRING,
                menu: "AXIS",
                defaultValue: "yaw",
              },
            },
          },
          {
            opcode: "getAcceleration",
            text: t("getAcceleration"),
            blockType: BlockType.REPORTER,
            arguments: {
              AXIS: {
                type: ArgumentType.STRING,
                menu: "AXIS_XYZ",
                defaultValue: "x",
              },
            },
          },
          {
            opcode: "getFilteredAcceleration",
            text: t("getFilteredAcceleration"),
            blockType: BlockType.REPORTER,
            arguments: {
              AXIS: {
                type: ArgumentType.STRING,
                menu: "AXIS_XYZ",
                defaultValue: "x",
              },
            },
          },
          {
            opcode: "resetYaw",
            text: t("resetYaw"),
            blockType: BlockType.COMMAND,
          },
          {
            opcode: "presetYaw",
            text: t("presetYaw"),
            blockType: BlockType.COMMAND,
            arguments: {
              ANGLE: { type: ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          "---",
          // 3x3 LED Matrix
          {
            opcode: "setMatrix3x3ColorGrid",
            text: t("setMatrix3x3ColorGrid"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              P1: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P2: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "⚫",
              },
              P3: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P4: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P5: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P6: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P7: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "⚫",
              },
              P8: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              P9: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "⚫",
              },
            },
          },
          {
            opcode: "setMatrix3x3Custom",
            text: t("setMatrix3x3Custom"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              PATTERN: {
                type: ArgumentType.STRING,
                defaultValue: "r8 g6 b4\\ny7 w9 o5\\nm3 v2 .1",
              },
            },
          },
          {
            opcode: "setMatrix3x3SolidColor",
            text: t("setMatrix3x3SolidColor"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              COLOR: {
                type: ArgumentType.STRING,
                menu: "MATRIX_COLOR_EMOJI",
                defaultValue: "🔴",
              },
              BRIGHTNESS: {
                type: ArgumentType.STRING,
                menu: "BRIGHTNESS_1_TO_10",
                defaultValue: "5",
              },
            },
          },
          {
            opcode: "clearMatrix3x3",
            text: t("clearMatrix3x3"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            // The 3x3 colour matrix accessory, one pixel at a time. This is a
            // different device from the hub's own 5x5 display, which is what
            // setPixel addresses — the two were easy to confuse across the old
            // extensions and are deliberately kept apart here.
            opcode: "setLightMatrixPixel",
            text: t("setLightMatrixPixel"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "C",
              },
              X: { type: ArgumentType.NUMBER, defaultValue: 1 },
              Y: { type: ArgumentType.NUMBER, defaultValue: 1 },
              BRIGHTNESS: { type: ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          "---",
          // Gestures
          {
            opcode: "whenGesture",
            blockType: BlockType.HAT,
            text: t("whenGesture"),
            arguments: {
              GESTURE: {
                type: ArgumentType.STRING,
                menu: "GESTURE",
                defaultValue: "tapped",
              },
            },
          },
          {
            opcode: "isGesture",
            blockType: BlockType.BOOLEAN,
            text: t("isGesture"),
            arguments: {
              GESTURE: {
                type: ArgumentType.STRING,
                menu: "GESTURE",
                defaultValue: "tapped",
              },
            },
          },
          {
            opcode: "getOrientation",
            text: t("getOrientation"),
            blockType: BlockType.REPORTER,
          },
          {
            // Which face is up, as a name. Distinct from getOrientation, which
            // reports the hub's orientation state, and from getAngle, which
            // reports a number.
            opcode: "getFaceUp",
            text: t("getFaceUp"),
            blockType: BlockType.REPORTER,
          },
          "---",
          // Sound
          {
            opcode: "playHubSound",
            text: t("playHubSound"),
            blockType: BlockType.COMMAND,
            arguments: {
              SOUND: {
                type: ArgumentType.STRING,
                menu: "HUB_SOUND",
                defaultValue: "startup",
              },
            },
          },
          {
            opcode: "playBeep",
            text: t("playBeep"),
            blockType: BlockType.COMMAND,
            arguments: {
              FREQUENCY: { type: ArgumentType.NUMBER, defaultValue: 440 },
              DURATION: { type: ArgumentType.NUMBER, defaultValue: 500 },
            },
          },
          {
            opcode: "playNote",
            text: t("playNote"),
            blockType: BlockType.COMMAND,
            arguments: {
              NOTE: { type: ArgumentType.NOTE, defaultValue: 60 },
              SECS: { type: ArgumentType.NUMBER, defaultValue: 0.5 },
            },
          },
          {
            opcode: "playWaveBeep",
            text: t("playWaveBeep"),
            blockType: BlockType.COMMAND,
            arguments: {
              WAVEFORM: {
                type: ArgumentType.STRING,
                menu: "WAVEFORM",
                defaultValue: "sin",
              },
              FREQUENCY: { type: ArgumentType.NUMBER, defaultValue: 440 },
              DURATION: { type: ArgumentType.NUMBER, defaultValue: 500 },
            },
          },
          {
            opcode: "setVolume",
            text: t("setVolume"),
            blockType: BlockType.COMMAND,
            arguments: {
              VOLUME: { type: ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "stopSound",
            text: t("stopSound"),
            blockType: BlockType.COMMAND,
          },
          "---",
          // Status & Power
          {
            opcode: "getBatteryLevel",
            text: t("getBatteryLevel"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "getBatteryTemperature",
            text: t("getBatteryTemperature"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "getHubTemperature",
            text: t("getHubTemperature"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "getHubCurrent",
            text: t("getHubCurrent"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "getHubVoltage",
            text: t("getHubVoltage"),
            blockType: BlockType.REPORTER,
          },
          "---",
          // Timer
          {
            opcode: "getTimer",
            text: t("getTimer"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "resetTimer",
            text: t("resetTimer"),
            blockType: BlockType.COMMAND,
          },
          "---",
          // Sensors
          {
            opcode: "getDistance",
            text: t("getDistance"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            // getDistance reports centimetres, because that is what it meant
            // on the 2.x hub it came from and projects depend on it. The BLE
            // extensions reported millimetres; those readers migrate to this
            // block with UNIT already set, so neither kind of project changes
            // what it reads. See spike-legacy-migration.js.
            opcode: "getDistanceIn",
            text: t("getDistanceIn"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              UNIT: {
                type: ArgumentType.STRING,
                menu: "DISTANCE_UNIT",
                defaultValue: "cm",
              },
            },
          },
          {
            opcode: "setDistanceLights",
            text: t("setDistanceLights"),
            blockType: BlockType.COMMAND,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              TL: { type: ArgumentType.NUMBER, defaultValue: 9 },
              TR: { type: ArgumentType.NUMBER, defaultValue: 9 },
              BL: { type: ArgumentType.NUMBER, defaultValue: 9 },
              BR: { type: ArgumentType.NUMBER, defaultValue: 9 },
            },
          },
          {
            opcode: "getColor",
            text: t("getColor"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "getReflection",
            text: t("getReflection"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "getAmbientLight",
            text: t("getAmbientLight"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            // One raw channel of the colour sensor, 0-1024, as the hub sends
            // it: both firmware generations carry red, green and blue in the
            // colour record (SPIKE 3 Python's color_sensor.rgbi() items 0-2).
            opcode: "getColorRGB",
            text: t("getColorRGB"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              CHANNEL: {
                type: ArgumentType.STRING,
                menu: "RGB_CHANNEL",
                defaultValue: "red",
              },
            },
          },
          {
            opcode: "getForce",
            text: t("getForce"),
            blockType: BlockType.REPORTER,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "isForceSensorPressed",
            text: t("isForceSensorPressed"),
            blockType: BlockType.BOOLEAN,
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
            },
          },
          {
            opcode: "whenColor",
            blockType: BlockType.HAT,
            text: t("whenColor"),
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              COLOR: {
                type: ArgumentType.STRING,
                menu: "COLOR",
                defaultValue: "red",
              },
            },
          },
          {
            opcode: "isColor",
            blockType: BlockType.BOOLEAN,
            text: t("isColor"),
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              COLOR: {
                type: ArgumentType.STRING,
                menu: "COLOR",
                defaultValue: "red",
              },
            },
          },
          {
            opcode: "whenForceSensor",
            blockType: BlockType.HAT,
            text: t("whenForceSensor"),
            arguments: {
              PORT: {
                type: ArgumentType.STRING,
                menu: "PORT",
                defaultValue: "A",
              },
              STATE: {
                type: ArgumentType.STRING,
                menu: "FORCE_STATE",
                defaultValue: "pressed",
              },
            },
          },
          "---",
          // Buttons
          {
            opcode: "isButtonPressed",
            text: t("isButtonPressed"),
            blockType: BlockType.BOOLEAN,
            arguments: {
              BUTTON: {
                type: ArgumentType.STRING,
                menu: "BUTTON",
                defaultValue: "center",
              },
            },
          },
          {
            opcode: "whenButtonPressed",
            blockType: BlockType.HAT,
            text: t("whenButtonPressed"),
            arguments: {
              BUTTON: {
                type: ArgumentType.STRING,
                menu: "BUTTON",
                defaultValue: "center",
              },
            },
          },
          "---",
          // File System
          {
            opcode: "writeLogFile",
            text: t("writeLogFile"),
            blockType: BlockType.COMMAND,
            arguments: {
              TEXT: { type: ArgumentType.STRING, defaultValue: "data" },
              FILENAME: { type: ArgumentType.STRING, defaultValue: "log.txt" },
            },
          },
          {
            opcode: "readLogFile",
            text: t("readLogFile"),
            blockType: BlockType.REPORTER,
            arguments: {
              FILENAME: { type: ArgumentType.STRING, defaultValue: "log.txt" },
            },
          },
          {
            opcode: "deleteLogFile",
            text: t("deleteLogFile"),
            blockType: BlockType.COMMAND,
            arguments: {
              FILENAME: { type: ArgumentType.STRING, defaultValue: "log.txt" },
            },
          },
          {
            opcode: "listFiles",
            text: t("listFiles"),
            blockType: BlockType.REPORTER,
          },
          "---",
          // Python REPL
          {
            opcode: "runReplCommand",
            text: t("runReplCommand"),
            blockType: BlockType.COMMAND,
            arguments: {
              CODE: {
                type: ArgumentType.STRING,
                defaultValue: 'print("Hello REPL!")',
              },
            },
          },
          {
            opcode: "getReplOutput",
            text: t("getReplOutput"),
            blockType: BlockType.REPORTER,
          },
          {
            opcode: "clearReplOutput",
            text: t("clearReplOutput"),
            blockType: BlockType.COMMAND,
          },
          {
            opcode: "getReplHistory",
            text: t("getReplHistory"),
            blockType: BlockType.REPORTER,
            arguments: {
              INDEX: { type: ArgumentType.NUMBER, defaultValue: -1 },
            },
          },
          "---",
          // Advanced Python
          {
            opcode: "runPythonCommand",
            text: t("runPythonCommand"),
            blockType: BlockType.COMMAND,
            arguments: {
              CODE: {
                type: ArgumentType.STRING,
                defaultValue: 'print("Hello World")',
              },
            },
          },
          {
            opcode: "runHubCommand",
            text: t("runHubCommand"),
            blockType: BlockType.COMMAND,
            arguments: {
              CODE: { type: ArgumentType.STRING, defaultValue: "hub.status()" },
            },
          },
          {
            opcode: "exitScript",
            text: t("exitScript"),
            blockType: BlockType.COMMAND,
          },
        ],
        menus: {
          PORT: { acceptReporters: true, items: SpikePorts },
          ...(isStartupProbeDeveloperMode()
            ? {
                SPIKE_STARTUP_PROBE: {
                  acceptReporters: false,
                  items: Object.entries(SPIKE_STARTUP_PROBES).map(
                    ([value, probe]) => ({
                      value,
                      text: t(probe.labelKey),
                    })
                  ),
                },
              }
            : {}),
          CONNECTION_MODE: {
            acceptReporters: true,
            items: [
              { value: "auto", text: t("mode.auto") },
              { value: "scratchlink-ble", text: t("mode.scratchlinkBle") },
              { value: "scratchlink-bt", text: t("mode.scratchlinkBt") },
              { value: "web-ble", text: t("mode.webBle") },
              { value: "bridge", text: t("mode.bridge") },
            ],
          },
          DISTANCE_UNIT: {
            acceptReporters: true,
            items: ["cm", "mm", "in", "%"],
          },
          MULTIPLE_PORT: {
            acceptReporters: true,
            items: [
              "A",
              "B",
              "C",
              "D",
              "E",
              "F",
              "A+B",
              "C+D",
              "E+F",
              "A+B+C+D+E+F",
            ],
          },
          MOTOR_UNIT: {
            acceptReporters: false,
            items: [
              menuItem("unit.rotations", "rotations"),
              menuItem("unit.degrees", "degrees"),
              menuItem("unit.seconds", "seconds"),
            ],
          },
          AXIS: { acceptReporters: false, items: ["pitch", "roll", "yaw"] },
          AXIS_XYZ: { acceptReporters: false, items: ["x", "y", "z"] },
          RGB_CHANNEL: {
            acceptReporters: false,
            items: [
              menuItem("color.red", "red"),
              menuItem("color.green", "green"),
              menuItem("color.blue", "blue"),
            ],
          },
          DIRECTION: {
            acceptReporters: false,
            items: [
              { text: "⬆️", value: "1" },
              { text: "⬇️", value: "-1" },
            ],
          },
          DISPLAY_PATTERN: {
            acceptReporters: false,
            items: Object.keys(DisplayPatterns).map((value) =>
              menuItem(`pattern.${value}`, value)
            ),
          },
          ROTATION_ANGLE: {
            acceptReporters: false,
            items: ["90", "-90", "180", "-180"],
          },
          CENTER_LED_COLOR: {
            acceptReporters: false,
            items: Object.keys(CenterLEDColors).map((value) =>
              menuItem(`center.${value.toLowerCase()}`, value)
            ),
          },
          GESTURE: {
            acceptReporters: false,
            items: [
              menuItem("tapped", "tapped"),
              menuItem("doubletapped", "doubletapped"),
              menuItem("shake", "shake"),
              menuItem("freefall", "freefall"),
            ],
          },
          HUB_SOUND: { acceptReporters: false, items: HubSoundFiles },
          WAVEFORM: {
            acceptReporters: false,
            items: ["sin", "square", "triangle", "sawtooth"],
          },
          BUTTON: {
            acceptReporters: false,
            items: [
              menuItem("left", "left"),
              menuItem("button.center", "center"),
              menuItem("right", "right"),
              menuItem("button.connect", "connect"),
            ],
          },
          MOVE_DIRECTION: {
            acceptReporters: false,
            items: [
              menuItem("forward", "forward"),
              menuItem("backward", "backward"),
            ],
          },
          MOVE_UNIT: {
            acceptReporters: false,
            items: [
              "cm",
              "in",
              menuItem("unit.rotations", "rotations"),
              menuItem("unit.degrees", "degrees"),
              menuItem("unit.seconds", "seconds"),
            ],
          },
          STOP_ACTION: {
            acceptReporters: false,
            items: [
              menuItem("action.coast", "coast"),
              menuItem("action.brake", "brake"),
              menuItem("action.hold", "hold"),
            ],
          },
          COLOR: {
            acceptReporters: true,
            items: [
              "red",
              "green",
              "blue",
              "yellow",
              "cyan",
              "magenta",
              "white",
              "black",
            ].map((value) => menuItem(`color.${value}`, value)),
          },
          FORCE_STATE: {
            acceptReporters: false,
            items: [
              menuItem("state.pressed", "pressed"),
              menuItem("state.hardPressed", "hard pressed"),
              menuItem("state.released", "released"),
            ],
          },
          MATRIX_COLOR_EMOJI: {
            acceptReporters: false,
            items: [
              { text: `⚫ ${mt("matrix.off")}`, value: "⚫" },
              { text: `🟣 ${mt("matrix.magenta")}`, value: "🟣" },
              { text: `🟪 ${mt("matrix.violet")}`, value: "🟪" },
              { text: `🔵 ${mt("matrix.blue")}`, value: "🔵" },
              { text: `🔷 ${mt("matrix.turquoise")}`, value: "🔷" },
              { text: `🟢 ${mt("matrix.mint")}`, value: "🟢" },
              { text: `🟩 ${mt("matrix.green")}`, value: "🟩" },
              { text: `🟡 ${mt("matrix.yellow")}`, value: "🟡" },
              { text: `🟠 ${mt("matrix.orange")}`, value: "🟠" },
              { text: `🔴 ${mt("matrix.red")}`, value: "🔴" },
              { text: `⚪ ${mt("matrix.white")}`, value: "⚪" },
            ],
          },
          BRIGHTNESS_1_TO_10: {
            acceptReporters: false,
            items: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
          },
        },
      };
    }

    // ============================================================================
    // TRANSPILATION BLOCKS
    // ============================================================================

    transpileProject() {
      this._transpiler.transpileProject();
      alert(t("codeGenerated"));
    }

    showCode() {
      const code = this._transpiler.getCode();
      if (!code) {
        alert(t("noCodeGenerated"));
        return;
      }

      const modal = document.createElement("div");
      modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border: 2px solid #4C97FF;
        border-radius: 8px;
        max-width: 80%;
        max-height: 80%;
        overflow: auto;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      `;

      const title = document.createElement("h3");
      title.textContent = t("generatedCode");
      title.style.cssText = "margin-top: 0; color: #333;"; // ✅ FIXED: Added color

      const pre = document.createElement("pre");
      pre.style.cssText =
        "background: #f5f5f5; padding: 10px; overflow: auto; max-height: 500px; font-family: monospace; font-size: 12px; color: #000; border: 1px solid #ddd; border-radius: 4px;"; // ✅ FIXED: Added color, border
      pre.textContent = code;

      const closeBtn = document.createElement("button");
      closeBtn.textContent = t("close");
      closeBtn.style.cssText =
        "margin-top: 10px; padding: 8px 16px; background: #4C97FF; color: white; border: none; border-radius: 4px; cursor: pointer;";
      closeBtn.onclick = () => document.body.removeChild(modal);

      modal.appendChild(title);
      modal.appendChild(pre);
      modal.appendChild(closeBtn);

      document.body.appendChild(modal);
    }

    downloadCode() {
      const code = this._transpiler.getCode();
      if (!code) {
        alert(t("generateFirst"));
        return;
      }

      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spike_program.py";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(
        t("downloaded") + " spike_program.py\n\n" + t("uploadInstructions")
      );
    }

    getTranspiledCode() {
      return this._transpiler.getCode() || "";
    }

    uploadScriptToHub(args) {
      const code = this._transpiler.getCode();
      if (!code) {
        alert(t("noCodeGenerated"));
        return;
      }

      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return;
      }

      const filename = Cast.toString(args.NAME).replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      console.log(`📤 Uploading ${filename} to hub...`);

      // Escape the code for Python string
      const escapedCode = code
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");

      // Split into chunks if too large
      const chunkSize = 200;
      const chunks = [];

      for (let i = 0; i < escapedCode.length; i += chunkSize) {
        chunks.push(escapedCode.slice(i, i + chunkSize));
      }

      console.log(`📦 Uploading in ${chunks.length} chunks...`);

      // Upload in chunks
      const uploadCommands = [`f = open("${filename}", "w")`];

      for (const chunk of chunks) {
        uploadCommands.push(`f.write("${chunk}")`);
      }

      uploadCommands.push("f.close()");
      uploadCommands.push(`print("✓ Uploaded ${filename}")`);

      // Send all commands
      let promise = Promise.resolve();
      for (const cmd of uploadCommands) {
        promise = promise
          .then(() => {
            return this._peripheral.sendPythonCommand(cmd);
          })
          .then(() => {
            return new Promise((resolve) => setTimeout(resolve, 50)); // Small delay between chunks
          });
      }

      return promise
        .then(() => {
          alert(t("uploadScriptSuccess", filename));
        })
        .catch((error) => {
          alert(t("uploadScriptFailed", error.message));
        });
    }

    runScriptOnHub(args) {
      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return;
      }

      const filename = Cast.toString(args.NAME).replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      console.log(`▶️ Running ${filename} on hub...`);

      // Execute the script
      const runCommand = `exec(open("${filename}").read())`;

      return this._peripheral
        .sendPythonCommand(runCommand)
        .then(() => {
          console.log(`✓ Script ${filename} started`);
        })
        .catch((error) => {
          alert(t("runScriptFailed", error.message));
        });
    }

    renameScriptOnHub(args) {
      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return;
      }

      const oldName = Cast.toString(args.OLD).replace(/[^a-zA-Z0-9._-]/g, "_");
      const newName = Cast.toString(args.NEW).replace(/[^a-zA-Z0-9._-]/g, "_");

      console.log(`📝 Renaming ${oldName} → ${newName}...`);

      const renameCommand = `import uos; uos.rename("${oldName}", "${newName}"); print("✓ Renamed")`;

      return this._peripheral
        .sendPythonCommand(renameCommand)
        .then(() => {
          alert(t("renameScriptSuccess", oldName, newName));
        })
        .catch((error) => {
          alert(t("renameScriptFailed", error.message));
        });
    }

    deleteScriptOnHub(args) {
      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return;
      }

      const filename = Cast.toString(args.NAME).replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      // Nothing is sent until the user has answered, and only OK deletes.
      return askYesNo(t("confirmDelete", filename)).then((yes) => {
        if (!yes) {
          return;
        }

        console.log("🗑️ Deleting " + filename + "...");

        const deleteCommand =
          'import uos; uos.remove("' + filename + '"); print("✓ Deleted")';

        return this._peripheral
          .sendPythonCommand(deleteCommand)
          .then(() => {
            alert(t("deleteScriptSuccess", filename));
          })
          .catch((error) => {
            alert(t("deleteScriptFailed", error.message));
          });
      });
    }

    listScriptsOnHub() {
      if (!this._peripheral.isConnected()) {
        return t("notConnected");
      }

      // Request list of .py files
      this._peripheral.sendReplCommand(
        'import uos; print(",".join([f for f in uos.listdir() if f.endswith(".py")]))'
      );

      // Return instruction to check REPL output
      return t("checkReplOutput");
    }

    stopRunningScript() {
      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return;
      }

      console.log("⏹️ Stopping script...");

      // Send Ctrl+C to interrupt
      return this._peripheral.sendRaw("\x03").then(() => {
        console.log("✓ Stop signal sent");
      });
    }

    // ============================================================================
    // STREAMING MODE IMPLEMENTATIONS
    // ============================================================================

    // Movement implementations
    setMovementMotors(args) {
      const portA = this._validatePort(args.PORT_A);
      const portB = this._validatePort(args.PORT_B);
      if (!portA || !portB) return;
      this._peripheral._movementMotors = [portA, portB];
      // Tell the hub too: motors.move/start/... drive whatever the hub's own
      // motors pair is, and recording the ports here alone left it unchanged.
      return this._peripheral.sendPythonCommand(this._motorPairPython(false));
    }

    /**
     * One line of hub Python that defines motors = MotorPair(A, B) for the
     * current movement pair. With onlyIfMissing it leaves an existing motors
     * alone, which is what lets every movement command carry it: a project
     * that never ran "set movement motors" still has a pair on the hub. exec
     * keeps the try/except on one REPL line; SPIKE Prime firmware names the
     * module spike and Robot Inventor names it mindstorms.
     */
    _motorPairPython(onlyIfMissing) {
      const [portA, portB] = this._peripheral.movementMotors;
      const define =
        "try:\\n from spike import MotorPair\\n" +
        "except ImportError:\\n from mindstorms import MotorPair\\n" +
        `motors = MotorPair('${portA}', '${portB}')`;
      if (!onlyIfMissing) return `exec("${define}")`;
      const indented = define.replace(/\\n/g, "\\n ");
      return `exec("try:\\n motors\\nexcept NameError:\\n ${indented}")`;
    }

    /** A MotorPair command, preceded by the definition of motors if absent. */
    _sendMotorPairCommand(code) {
      return this._peripheral.sendPythonCommand(
        `${this._motorPairPython(true)}; ${code}`
      );
    }

    /**
     * The hub's counted position for a motor port, or null when the hub has
     * reported none. SPIKE 3 notifications land in _sensors.motorPositions;
     * the 2.x status stream lands in portValues.
     */
    _countedPosition(port) {
      const alt = this._peripheral._sensors.motorPositions[port];
      const reading =
        alt && alt.relativePosition !== undefined
          ? alt.relativePosition
          : this._peripheral.portValues[port]?.relativePosition;
      return typeof reading === "number" && Number.isFinite(reading)
        ? reading
        : null;
    }

    /**
     * Resolve once every movement motor the hub reports on has turned the
     * commanded degrees (within a few), as a word block on a real SPIKE does.
     * The time estimate is the fallback, so a hub that reports no positions,
     * or a robot stalled against a wall, still lets the script go on.
     */
    _waitForMovement(ports, degrees, speed) {
      const target = Math.abs(degrees);
      const degPerSecond = Math.abs(speed) * 6;
      const estimateMs =
        degPerSecond > 0 ? (target / degPerSecond) * 1000 : Infinity;
      const starts = ports
        .map((port) => ({ port, start: this._countedPosition(port) }))
        .filter((entry) => entry.start !== null);
      // Without readings the estimate is the whole wait.
      // With them the move ends when the encoders arrive. The safety net is
      // then NOT a deadline in wall time: a deadline cuts a move short
      // whenever the motor runs slower than the estimate in wall time -- a
      // loaded motor, or a simulated hub whose physics runs slower than real
      // time (the Robot Lab drops simulated time when its worker cannot keep
      // up), where the next block's command then overrode the move mid-way.
      // It is a lack of progress: no encoder moving for STALL_MS (a blocked
      // motor the hub has given up on), with a long absolute cap.
      const STALL_MS = 2000;
      const fallbackMs = starts.length
        ? 120000
        : Math.min(estimateMs + 500, 10000);
      return new Promise((resolve) => {
        let poll = null;
        const done = () => {
          clearTimeout(timeout);
          if (poll !== null) clearInterval(poll);
          resolve();
        };
        const timeout = setTimeout(done, fallbackMs);
        if (!starts.length) return;
        const positions = () =>
          starts.map(({ port }) => this._countedPosition(port));
        const arrived = (now) =>
          starts.every(
            ({ start }, k) =>
              now[k] !== null && Math.abs(now[k] - start) >= target - 5
          );
        let last = positions();
        let lastChange = Date.now();
        poll = setInterval(() => {
          const now = positions();
          if (arrived(now)) return done();
          if (now.some((p, k) => p !== last[k])) {
            last = now;
            lastChange = Date.now();
          } else if (Date.now() - lastChange >= STALL_MS) done();
        }, 20);
      });
    }

    /** The unit names MotorPair.move accepts, from either spelling. */
    _moveUnit(unit) {
      const text = Cast.toString(unit).trim().toLowerCase();
      const plural = {
        rotation: "rotations",
        degree: "degrees",
        second: "seconds",
      };
      return plural[text] || text;
    }

    moveForward(args) {
      const direction = Cast.toString(args.DIRECTION);
      const value = Cast.toNumber(args.VALUE);
      const unit = this._moveUnit(args.UNIT);
      const ports = this._peripheral.movementMotors;
      const speed = this._peripheral.motorSettings[ports[0]].speed;
      const dirMultiplier = direction === "forward" ? 1 : -1;
      let amount = value;
      let sentUnit = unit;
      if (unit === "cm") {
        amount = value / 17.6;
        sentUnit = "rotations";
      } else if (unit === "in") {
        amount = value / 6.93;
        sentUnit = "rotations";
      }
      const sent = this._sendMotorPairCommand(
        `motors.move(${amount * dirMultiplier}, '${sentUnit}', speed=${speed})`
      );
      // Wait for the move to end, as the SPIKE word block does, so the next
      // block does not override it mid-way.
      let wait;
      if (sentUnit === "seconds") {
        wait = new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, value) * 1000)
        );
      } else {
        const degrees = sentUnit === "rotations" ? amount * 360 : amount;
        wait = this._waitForMovement(ports, degrees, speed);
      }
      return Promise.all([sent, wait]).then(() => {});
    }

    steer(args) {
      const steering = Cast.toNumber(args.STEERING);
      const [portA] = this._peripheral.movementMotors;
      const speed = this._peripheral.motorSettings[portA].speed;
      return this._sendMotorPairCommand(
        `motors.start(${steering}, speed=${speed})`
      );
    }

    startTank(args) {
      const leftSpeed = Cast.toNumber(args.LEFT_SPEED);
      const rightSpeed = Cast.toNumber(args.RIGHT_SPEED);
      return this._sendMotorPairCommand(
        `motors.start_tank(${leftSpeed}, ${rightSpeed})`
      );
    }

    setMovementSpeed(args) {
      const speed = Cast.toNumber(args.SPEED);
      const [portA, portB] = this._peripheral.movementMotors;
      this._peripheral.motorSettings[portA].speed = speed;
      this._peripheral.motorSettings[portB].speed = speed;
      return this._sendMotorPairCommand(`motors.set_default_speed(${speed})`);
    }

    stopMovement() {
      return this._sendMotorPairCommand("motors.stop()");
    }

    // Motor implementations
    motorRunFor(args) {
      const direction = args.DIRECTION;
      const value = Cast.toNumber(args.VALUE);
      const unit = args.UNIT;
      const ports = this._validatePorts(Cast.toString(args.PORT));

      let degrees = 0;
      if (unit === "rotations") degrees = value * 360;
      else if (unit === "degrees") degrees = value;
      // If unit is seconds, we use the timed function instead
      else if (unit === "seconds")
        return this._motorRunTimed(ports, direction, value);

      console.log(
        `%c🔄 [SPIKE] MotorRunFor: ${degrees} deg on ${ports}`,
        "color: #44aaff;"
      );

      if (this._peripheral.protocol === "spike3") {
        const speeds = ports.map(
          (port) => this._peripheral.motorSettings[port].speed * direction
        );
        const slowest = speeds.reduce(
          (current, speed) => Math.min(current, Math.abs(speed)),
          Infinity
        );
        return Promise.all(
          ports.map((port, index) =>
            this._peripheral.sendCommand("scratch.motor_run_for_degrees", {
              port,
              speed: speeds[index],
              degrees: Math.floor(degrees),
            })
          )
        ).then(() =>
          this._waitForMovement(ports, Math.floor(degrees), slowest)
        );
      }

      let slowest = 0;
      ports.forEach((port) => {
        const setting = this._peripheral.motorSettings[port];
        const speed = setting.speed * direction;
        slowest =
          slowest === 0 ? Math.abs(speed) : Math.min(slowest, Math.abs(speed));

        // We use Python directly to avoid the JSON-RPC "KP7G" hang
        this._peripheral.sendPythonCommand(
          `import hub; hub.port.${port}.motor.run_for_degrees(${Math.floor(degrees)}, ${speed})`
        );
      });

      // Wait for the move to end, as move forward does: until the encoders
      // have turned the degrees (an estimate from the speed only when the hub
      // sends no positions). A wait estimated in wall time ended early whenever
      // the motor was slower than the estimate -- under load, or on a
      // simulated hub running slower than real time -- and the next block's
      // command then overrode the move part-way.
      return this._waitForMovement(ports, Math.floor(degrees), slowest);
    }

    motorRunToPosition(args) {
      const port = this._validatePort(args.PORT);
      if (!port) return;
      const position = Cast.toNumber(args.POSITION);
      const speed = this._peripheral.motorSettings[port].speed;
      if (this._peripheral.protocol === "spike3") {
        return this._peripheral.sendCommand("scratch.motor_run_to_position", {
          port,
          position,
          speed,
        });
      }
      return this._peripheral.sendPythonCommand(
        `hub.port.${port}.motor.run_to_position(${position}, speed=${speed})`
      );
    }

    _motorRunForDegrees(ports, direction, degrees) {
      const promises = ports.map((port) => {
        const setting = this._peripheral.motorSettings[port];
        const standardCommand = this._peripheral.sendCommand(
          "scratch.motor_run_for_degrees",
          {
            port: port,
            speed: setting.speed * direction,
            degrees: Math.floor(degrees),
            stop: setting.stopMode,
            stall: setting.stallDetection,
          }
        );
        const altCommand = () =>
          this._peripheral.sendPythonCommand(
            `import hub; hub.port.${port}.motor.run_for_degrees(${Math.floor(degrees)}, ${setting.speed * direction})`
          );
        return standardCommand.catch((error) =>
          this._sendPythonFallback(error, altCommand)
        );
      });
      return Promise.all(promises).then(() => {});
    }

    _motorRunTimed(ports, direction, seconds) {
      const promises = ports.map((port) => {
        const setting = this._peripheral.motorSettings[port];
        const standardCommand = this._peripheral.sendCommand(
          "scratch.motor_run_timed",
          {
            port: port,
            speed: setting.speed * direction,
            time: Math.floor(seconds * 1000),
            stop: setting.stopMode,
            stall: setting.stallDetection,
          }
        );
        const altCommand = () =>
          this._peripheral.sendPythonCommand(
            `import hub; hub.port.${port}.motor.run_for_time(${Math.floor(seconds * 1000)}, ${setting.speed * direction})`
          );
        return standardCommand.catch((error) =>
          this._sendPythonFallback(error, altCommand)
        );
      });
      return Promise.all(promises).then(() => {});
    }

    motorStart(args) {
      const direction = args.DIRECTION;
      const ports = this._validatePorts(Cast.toString(args.PORT));
      const promises = ports.map((port) => {
        const setting = this._peripheral.motorSettings[port];
        // Set the third argument to false so it doesn't wait for an ID match
        const standardCommand = this._peripheral.sendCommand(
          "scratch.motor_start",
          {
            port: port,
            speed: setting.speed * direction,
            stall: setting.stallDetection,
          },
          false // needsResponse = false
        );
        const altCommand = () =>
          this._peripheral.sendPythonCommand(
            // The hub module's speed command (percent, regulated), not pwm():
            // pwm is a duty cycle, so a loaded motor would not hold the speed
            // the block asks for (pwm is "start motor at % power").
            `import hub; hub.port.${port}.motor.run_at_speed(${Math.round(setting.speed * direction)})`
          );
        return standardCommand.catch((error) =>
          this._sendPythonFallback(error, altCommand)
        );
      });
      return Promise.all(promises).then(() => {});
    }

    motorStop(args) {
      const ports = this._validatePorts(Cast.toString(args.PORT));
      // Verbose Log for you
      console.log(
        `%c🛑 [SPIKE] Stopping ports: ${ports.join(", ")}`,
        "color: #ff4444; font-weight: bold;"
      );

      const promises = ports.map((port) => {
        // We only send the Python command.
        // We use pwm(0) then brake() to ensure it truly stops.
        return this._peripheral.sendPythonCommand(
          `hub.port.${port}.motor.pwm(0); hub.port.${port}.motor.brake()`
        );
      });

      return Promise.all(promises);
    }

    motorSetSpeed(args) {
      const speed = Cast.toNumber(args.SPEED);
      const ports = this._validatePorts(Cast.toString(args.PORT));
      ports.forEach((port) => {
        this._peripheral.motorSettings[port].speed = speed;
      });
    }

    motorSetStopAction(args) {
      const port = this._validatePort(args.PORT);
      if (!port) return;
      const action = Cast.toString(args.ACTION);
      const stopModeMap = { coast: 0, brake: 1, hold: 2 };
      this._peripheral.motorSettings[port].stopMode = stopModeMap[action] || 1;
      return this._peripheral.sendPythonCommand(
        `hub.port.${port}.motor.set_stop_action('${action}')`
      );
    }

    getPosition(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      return this._peripheral.portValues[port]?.position ?? 0;
    }

    getRelativePosition(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const altData = this._peripheral._sensors.motorPositions[port];
      if (altData) return altData.relativePosition;
      return this._peripheral.portValues[port]?.relativePosition ?? 0;
    }

    getAbsolutePosition(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const altData = this._peripheral._sensors.motorPositions[port];
      if (altData) return altData.absolutePosition;
      return this._peripheral.portValues[port]?.absolutePosition ?? 0;
    }

    getSpeed(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const altData = this._peripheral._sensors.motorPositions[port];
      if (altData) return Math.round(altData.speed * 9.3);
      const speedPercent = this._peripheral.portValues[port]?.speed ?? 0;
      return Math.round(speedPercent * 9.3);
    }

    resetMotorPosition(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const position = Cast.toNumber(args.POSITION);
      return this._peripheral.sendPythonCommand(
        `import hub; hub.port.${port}.motor.preset(${position})`
      );
    }

    // Display implementations
    displayText(args) {
      const text = Cast.toString(args.TEXT);
      const standardCommand = this._peripheral.sendCommand(
        "scratch.display_text",
        { text: text }
      );
      const altCommand = () =>
        this._peripheral.sendPythonCommand(
          `import hub; hub.display.show(${pyStringLiteral(text)})`
        );
      return standardCommand.catch((error) =>
        this._sendPythonFallback(error, altCommand)
      );
    }

    displayImage(args) {
      const matrix = Cast.toString(args.MATRIX);
      // Ensure we have exactly 25 digits, defaulting to 0
      const symbol = (matrix.replace(/\D/g, "") + "0".repeat(25)).slice(0, 25);

      // SPIKE Prime Python uses 0-9 for brightness.
      // We'll map '1' from Scratch to '9' (Full Bright) for visibility.
      const formatted = symbol
        .split("")
        .map((char, index) => {
          let pixel = char === "1" ? "9" : "0";
          return (index + 1) % 5 === 0 && index < 24 ? pixel + ":" : pixel;
        })
        .join("");

      if (this._peripheral.protocol === "spike3") {
        return this._peripheral.sendCommand("scratch.display_pattern", {
          pixels: symbol,
        });
      }
      return this._peripheral.sendPythonCommand(
        `import hub; hub.display.show(hub.Image("${formatted}"))`
      );
    }

    displayImage_broken(args) {
      const matrix = Cast.toString(args.MATRIX);
      // Use 0 instead of _ for off pixels
      const symbol = (matrix.replace(/\D/g, "") + "0".repeat(25)).slice(0, 25);
      const brightness = "9"; // Max brightness for visibility

      const altImage = symbol
        .replace(/1/g, brightness)
        .replace(/0/g, "0") // FIX: Change "_" to "0"
        .match(/.{5}/g)
        .join(":");

      console.log(
        `%c🖼️ [SPIKE] Displaying Pattern: ${altImage}`,
        "color: #ffaa00;"
      );

      // Send ONLY the Python command to avoid JSON collision
      return this._peripheral.sendPythonCommand(
        `hub.display.show(hub.Image("${altImage}"))`
      );
    }

    displayPattern(args) {
      const pattern = Cast.toString(args.PATTERN);
      const patternData = DisplayPatterns[pattern];
      if (patternData) return this.displayImage({ MATRIX: patternData });
      return Promise.resolve();
    }

    displayClear() {
      const standardCommand = this._peripheral.sendCommand(
        "scratch.display_clear",
        {}
      );
      const altCommand = () =>
        this._peripheral.sendPythonCommand('import hub; hub.display.show(" ")');
      return standardCommand.catch((error) =>
        this._sendPythonFallback(error, altCommand)
      );
    }

    setPixel(args) {
      const x = Cast.toNumber(args.X) - 1;
      const y = Cast.toNumber(args.Y) - 1;
      const brightness = Cast.toNumber(args.BRIGHTNESS);
      if (x < 0 || x > 4 || y < 0 || y > 4) return Promise.resolve();
      const standardCommand = this._peripheral.sendCommand(
        "scratch.display_set_pixel",
        { x: x, y: y, brightness: Math.round((brightness * 9) / 100) }
      );
      const altCommand = () =>
        this._peripheral.sendPythonCommand(
          `import hub; hub.display.pixel(${x}, ${y}, ${Math.round((brightness * 9) / 100)})`
        );
      return standardCommand.catch((error) =>
        this._sendPythonFallback(error, altCommand)
      );
    }

    rotateDisplay(args) {
      const angle = Cast.toString(args.ANGLE);
      // Clear first, then rotate
      return this._peripheral.sendPythonCommand(
        `import hub; hub.display.show(" "); hub.display.rotation(${angle})`
      );
    }

    setCenterButtonColor(args) {
      const colorName = Cast.toString(args.COLOR);
      const colorValue = CenterLEDColors[colorName] || 0;
      const standardCommand = this._peripheral.sendCommand(
        "scratch.center_button_lights",
        { color: colorValue }
      );
      const altCommand = () =>
        this._peripheral.sendPythonCommand(
          `import hub; hub.led(${colorValue})`
        );
      return standardCommand.catch((error) =>
        this._sendPythonFallback(error, altCommand)
      );
    }

    // IMU & Gyro
    getAngle(args) {
      const axis = Cast.toString(args.AXIS);
      return this._peripheral.angle[axis] || 0;
    }
    // The AXIS menu names a rotation (yaw, pitch, roll); both hubs report
    // the gyro per sensor axis (x, y, z). Yaw is the turn about z, the axis
    // that points up out of a flat hub; pitch is about y and roll about x.
    // Reading gyro[axis] with the menu's word found no such key, so these
    // blocks reported 0 whatever the hub sent.
    _gyroAxis(axis) {
      const name = Cast.toString(axis).toLowerCase();
      return { yaw: "z", pitch: "y", roll: "x" }[name] || name;
    }
    getGyroRate(args) {
      return this._peripheral.gyro[this._gyroAxis(args.AXIS)] || 0;
    }
    getFilteredGyroRate(args) {
      return this._peripheral.gyroFiltered[this._gyroAxis(args.AXIS)] || 0;
    }
    getAcceleration(args) {
      const axis = Cast.toString(args.AXIS);
      return this._peripheral.acceleration[axis] || 0;
    }
    getFilteredAcceleration(args) {
      const axis = Cast.toString(args.AXIS);
      return this._peripheral.accelerationFiltered[axis] || 0;
    }
    resetYaw() {
      this._peripheral._timer.start = Date.now();
      return this._peripheral.sendPythonCommand(
        "import hub; hub.motion.reset_yaw()"
      );
    }
    presetYaw(args) {
      const angle = Cast.toNumber(args.ANGLE);
      return this._peripheral.sendPythonCommand(
        `import hub; hub.motion.preset_yaw(${angle})`
      );
    }

    // 3x3 LED Matrix
    setMatrix3x3ColorGrid(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const pixels = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"].map(
        (pixel) => {
          const emoji = Cast.toString(args[pixel]);
          const colorId = ColorEmojiMap[emoji] || 0;
          return 5 * 16 + colorId;
        }
      );
      const byteString = pixels
        .map((b) => `\\x${b.toString(16).padStart(2, "0")}`)
        .join("");
      return this._peripheral.sendPythonCommand(
        `import hub; matrix = hub.port.${port}.device; matrix.mode(2); matrix.mode(2, b"${byteString}")`
      );
    }

    setMatrix3x3Custom(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const pattern = Cast.toString(args.PATTERN);
      const colorCodes = {
        ".": 0,
        m: 1,
        v: 2,
        b: 3,
        t: 4,
        n: 5,
        g: 6,
        y: 7,
        o: 8,
        r: 9,
        w: 10,
      };
      try {
        const lines = pattern.split(/\n|\|/);
        const pixels = [];
        for (const line of lines) {
          const pixelCodes = line.trim().split(/\s+/);
          for (const code of pixelCodes) {
            if (code.length >= 2) {
              const colorChar = code.charAt(0).toLowerCase();
              const brightnessStr = code.substring(1);
              const colorId =
                colorCodes[colorChar] !== undefined ? colorCodes[colorChar] : 0;
              const brightness = Math.max(
                1,
                Math.min(10, parseInt(brightnessStr) || 1)
              );
              pixels.push(brightness * 16 + colorId);
            }
          }
        }
        while (pixels.length < 9) pixels.push(0x01);
        pixels.splice(9);
        const byteString = pixels
          .map((b) => `\\x${b.toString(16).padStart(2, "0")}`)
          .join("");
        return this._peripheral.sendPythonCommand(
          `import hub; matrix = hub.port.${port}.device; matrix.mode(2); matrix.mode(2, b"${byteString}")`
        );
      } catch (error) {
        return this._peripheral.sendPythonCommand(
          `import hub; matrix = hub.port.${port}.device; matrix.mode(2); matrix.mode(2, b"\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01")`
        );
      }
    }

    setMatrix3x3SolidColor(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const colorEmoji = Cast.toString(args.COLOR);
      const brightness = MathUtil.clamp(Cast.toNumber(args.BRIGHTNESS), 1, 10);
      const colorId = ColorEmojiMap[colorEmoji] || 0;
      const value = brightness * 16 + colorId;
      const pixels = Array(9).fill(value);
      const byteString = pixels
        .map((b) => `\\x${b.toString(16).padStart(2, "0")}`)
        .join("");
      return this._peripheral.sendPythonCommand(
        `import hub; matrix = hub.port.${port}.device; matrix.mode(2); matrix.mode(2, b"${byteString}")`
      );
    }

    clearMatrix3x3(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      return this._peripheral.sendPythonCommand(
        `import hub; matrix = hub.port.${port}.device; matrix.mode(2); matrix.mode(2, b"\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01\\x01")`
      );
    }

    // Gestures
    whenGesture(args) {
      return this.isGesture(args);
    }
    isGesture(args) {
      const gesture = Cast.toString(args.GESTURE);
      return this._peripheral.gestures[gesture] || false;
    }
    getOrientation() {
      const orientationNames = ["up", "front", "right", "down", "back", "left"];
      return orientationNames[this._peripheral.orientation] || "unknown";
    }

    // Sound
    playHubSound(args) {
      const sound = Cast.toString(args.SOUND);
      return this._peripheral.sendPythonCommand(
        `import hub; hub.sound.play("/sounds/${sound}")`
      );
    }
    playBeep(args) {
      const frequency = Cast.toNumber(args.FREQUENCY);
      const duration = Cast.toNumber(args.DURATION);
      const standardCommand = this._peripheral.sendCommand(
        "scratch.sound_beep",
        { frequency: frequency, duration: duration }
      );
      const altCommand = () =>
        this._peripheral.sendPythonCommand(
          `import hub; hub.sound.beep(${frequency}, ${duration}, hub.sound.SOUND_SIN)`
        );
      return standardCommand.catch((error) =>
        this._sendPythonFallback(error, altCommand)
      );
    }
    playNote(args) {
      const note = Cast.toNumber(args.NOTE);
      const secs = Cast.toNumber(args.SECS);
      const freq = Math.round(this._noteToFrequency(note));
      const ms = Math.round(secs * 1000);

      // Use the most compatible 3-parameter syntax
      return this._peripheral.sendPythonCommand(
        `import hub; hub.sound.beep(${freq}, ${ms}, hub.sound.SOUND_SIN)`
      );
    }
    playWaveBeep(args) {
      const waveform = Cast.toString(args.WAVEFORM);
      const frequency = Cast.toNumber(args.FREQUENCY);
      const duration = Cast.toNumber(args.DURATION);
      const waveformCode = SoundWaveforms[waveform] || SoundWaveforms.sin;
      return this._peripheral.sendPythonCommand(
        `import hub; hub.sound.beep(${frequency}, ${duration}, ${waveformCode})`
      );
    }
    setVolume(args) {
      const volume = Cast.toNumber(args.VOLUME);
      this._peripheral._volume = MathUtil.clamp(volume, 0, 100);
      return this._peripheral.sendPythonCommand(`hub.sound.volume(${volume})`);
    }
    stopSound() {
      return this._peripheral.stopSound();
    }

    // Status & Temperature & Power
    getBatteryLevel() {
      return this._peripheral.battery || 100;
    }
    // The `|| 25` here was reporting room temperature for a hub that had
    // never sent one — a fabricated reading is worse than a blank, because it
    // looks like a measurement. The 3.x device notifications carry no
    // temperature or power channel at all, so on that firmware these are
    // blank rather than plausible.
    getBatteryTemperature() {
      if (!this._needs("hub-temperature")) return "";
      return this._peripheral.temperature || 25;
    }
    getHubTemperature() {
      if (!this._needs("hub-temperature")) return "";
      return this._peripheral.hubTemp || 25;
    }
    getHubCurrent() {
      if (!this._needs("hub-power")) return "";
      return this._peripheral.power.current || 0;
    }
    getHubVoltage() {
      if (!this._needs("hub-power")) return "";
      return this._peripheral.power.voltage || 0;
    }

    // Timer
    getTimer() {
      return this._peripheral.timer;
    }
    resetTimer() {
      this._peripheral._timer.start = Date.now();
      this._peripheral._timer.current = 0;
    }

    // Sensors
    getDistance(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "distance") return portData.distance;
      return 0;
    }
    setDistanceLights(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const tl = MathUtil.clamp(Cast.toNumber(args.TL), 0, 9);
      const tr = MathUtil.clamp(Cast.toNumber(args.TR), 0, 9);
      const bl = MathUtil.clamp(Cast.toNumber(args.BL), 0, 9);
      const br = MathUtil.clamp(Cast.toNumber(args.BR), 0, 9);
      return this._peripheral.sendPythonCommand(
        `import hub; dist_sensor = hub.port.${port}.device; dist_sensor.mode(5, bytes([${tl}, ${tr}, ${bl}, ${br}]))`
      );
    }
    getColor(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "color") {
        const colorNames = [
          "black",
          "magenta",
          "purple",
          "blue",
          "azure",
          "turquoise",
          "green",
          "yellow",
          "orange",
          "red",
          "white",
        ];
        return colorNames[portData.color] || "none";
      }
      return "none";
    }
    getReflection(args) {
      if (!this._needs("reflection")) return "";
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "color")
        return portData.reflection || 0;
      return 0;
    }
    getAmbientLight(args) {
      if (!this._needs("ambient")) return "";
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "color") return portData.ambient || 0;
      return 0;
    }
    getColorRGB(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const channel = Cast.toString(args.CHANNEL).toLowerCase();
      if (!["red", "green", "blue"].includes(channel)) return 0;
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "color") return portData[channel] || 0;
      return 0;
    }
    getForce(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "force") return portData.force || 0;
      return 0;
    }
    isForceSensorPressed(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "force")
        return portData.pressed || false;
      return false;
    }
    whenColor(args) {
      return this.isColor(args);
    }
    isColor(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const color = Cast.toString(args.COLOR);
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "color") {
        const colorNames = [
          "black",
          "magenta",
          "purple",
          "blue",
          "azure",
          "turquoise",
          "green",
          "yellow",
          "orange",
          "red",
          "white",
        ];
        return colorNames[portData.color] === color;
      }
      return false;
    }
    whenForceSensor(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const state = Cast.toString(args.STATE);
      const portData = this._peripheral.portValues[port];
      if (portData && portData.type === "force") {
        switch (state) {
          case "pressed":
            return portData.pressed;
          case "hard pressed":
            return portData.force > 8;
          case "released":
            return !portData.pressed;
        }
      }
      return false;
    }

    // Buttons
    isButtonPressed(args) {
      const button = Cast.toString(args.BUTTON);
      const buttonIndex = { left: 0, center: 1, right: 2 }[button];
      if (buttonIndex !== undefined) {
        return this._peripheral._sensors.buttons[buttonIndex] === 1;
      }
      return false;
    }
    whenButtonPressed(args) {
      return this.isButtonPressed(args);
    }

    // File System
    writeLogFile(args) {
      const filename = Cast.toString(args.FILENAME).replace(
        /[^a-zA-Z0-9._-]/g,
        ""
      );
      const text = Cast.toString(args.TEXT).replace(/"/g, '\\"');
      return this._peripheral.sendPythonCommand(
        `with open("${filename}", "a") as f: f.write("${text}\\n")`
      );
    }

    readLogFile(args) {
      const filename = Cast.toString(args.FILENAME).replace(
        /[^a-zA-Z0-9._-]/g,
        ""
      );

      // We send a direct print command to the REPL
      return this._peripheral.sendPythonCommand(
        `with open("${filename}", "r") as f: print(">>> LOG_START\\n" + f.read() + "\\n>>> LOG_END")`
      );
    }

    deleteLogFile(args) {
      const filename = Cast.toString(args.FILENAME).replace(
        /[^a-zA-Z0-9._-]/g,
        ""
      );
      return this._peripheral.sendPythonCommand(
        `import uos; uos.remove("${filename}")`
      );
    }

    listFiles() {
      return this._peripheral.sendReplCommand(
        'import uos; print(", ".join(uos.listdir()))'
      );
    }

    // Python REPL
    runReplCommand(args) {
      const code = Cast.toString(args.CODE);
      return this._peripheral.sendReplCommand(code);
    }
    getReplOutput() {
      return this._peripheral.replOutput || "";
    }
    clearReplOutput() {
      this._peripheral._replOutput = "";
    }
    getReplHistory(args) {
      const index = Cast.toNumber(args.INDEX);
      const history = this._peripheral.replHistory;
      if (index === -1) {
        return history[history.length - 1] || "";
      } else if (index >= 0 && index < history.length) {
        return history[index] || "";
      }
      return "";
    }

    // Advanced Python
    runPythonCommand(args) {
      const code = Cast.toString(args.CODE);
      return this._peripheral.sendPythonCommand(code);
    }
    runHubCommand(args) {
      const code = Cast.toString(args.CODE);
      const pythonCode = `import hub; ${code}`;
      return this._peripheral.sendPythonCommand(pythonCode);
    }
    exitScript() {
      return this._peripheral.sendPythonCommand("raise SystemExit");
    }

    runStartupProbe(args) {
      if (!isStartupProbeDeveloperMode()) {
        return Promise.reject(
          new Error("SPIKE startup probes are available only in developer mode")
        );
      }
      const probeId = Cast.toString(args.PROBE);
      const slot = Cast.toNumber(args.SLOT);
      const probe = SPIKE_STARTUP_PROBES[probeId];
      if (!probe || !Number.isInteger(slot) || slot < 0 || slot > 19) {
        const message = t("startupProbeInvalid");
        const error = new Error(message);
        alert(t("startupProbeInvalid"));
        return Promise.reject(error);
      }
      if (!this._peripheral.isConnected()) {
        const message = t("notConnected");
        const error = new Error(message);
        alert(t("notConnected"));
        return Promise.reject(error);
      }
      if (this._peripheral.protocol !== "spike3") {
        const message = t("controllerUnsupported");
        const error = new Error(message);
        alert(t("controllerUnsupported"));
        return Promise.reject(error);
      }

      return askYesNo(
        t(
          "startupProbeConfirmOverwrite",
          slot,
          probeId,
          t(probe.labelKey),
          probe.fileName
        )
      ).then((confirmed) => {
        if (!confirmed) return undefined;
        return this._peripheral.active
          .runStartupProbe(probeId, slot)
          .then((result) => {
            alert(
              t(
                "startupProbeFinished",
                probeId,
                t(`diag.startupProbeOutcome.${result.outcome}`)
              )
            );
            return result;
          })
          .catch((error) => {
            alert(t("startupProbeExecutionFailed", error.message));
            throw error;
          });
      });
    }

    // ========================================================================
    // CONNECTION
    //
    // The status button remains the ordinary way to connect. These exist
    // because the four extensions folded in here let a project connect from
    // inside a script, and dropping that would be losing a feature even
    // though the palette looks fuller without it.
    // ========================================================================

    installHubController(args) {
      if (!this._peripheral.isConnected()) {
        alert(t("notConnected"));
        return Promise.reject(new Error(t("notConnected")));
      }
      if (this._peripheral.protocol !== "spike3") {
        const error = new Error(t("controllerUnsupported"));
        error.code = "ERR_UNSUPPORTED_HUB_COMMAND";
        alert(t("operationFailed", error.message));
        return Promise.reject(error);
      }
      const slot = Math.trunc(Cast.toNumber(args.SLOT));
      if (slot < 0 || slot > 19) {
        const error = new Error(t("controllerInvalidSlot"));
        alert(t("operationFailed", error.message));
        return Promise.reject(error);
      }

      // Program slots cannot be inspected through the published BLE protocol.
      // This confirmation is required every time before ClearSlotRequest is sent.
      return askYesNo(t("controllerConfirmOverwrite", slot)).then((yes) => {
        if (!yes) return;
        return this._peripheral.active
          .installController(slot)
          .then((result) => {
            alert(t("controllerReady"));
            return result;
          })
          .catch((error) => {
            alert(t("controllerFailed", error.message));
            throw error;
          });
      });
    }

    checkHubController() {
      if (!this._peripheral.isConnected()) {
        const error = new Error(t("notConnected"));
        alert(t("operationFailed", error.message));
        return Promise.reject(error);
      }
      if (this._peripheral.protocol !== "spike3") {
        const error = new Error(t("controllerUnsupported"));
        error.code = "ERR_UNSUPPORTED_HUB_COMMAND";
        alert(t("operationFailed", error.message));
        return Promise.reject(error);
      }
      return this._peripheral.active
        .probeController()
        .then((result) => {
          alert(t("controllerReady"));
          return result;
        })
        .catch((error) => {
          alert(t("controllerFailed", error.message));
          throw error;
        });
    }

    connectHub() {
      return this._peripheral.scan();
    }

    connectHubAt(args) {
      this._peripheral.setBridgeURL(Cast.toString(args.URL));
      this._peripheral.setMode("bridge");
      return this._peripheral.scan();
    }

    disconnectHub() {
      this._peripheral.disconnect();
    }

    isConnected() {
      return this._peripheral.isConnected();
    }

    /**
     * What the hub said it is — never a guess from the advertised name, which
     * the user can rename. Empty until the hub has answered.
     */
    getHubType() {
      return this._peripheral.hubDescription;
    }

    getFirmwareVersion() {
      return this._peripheral.firmwareVersion;
    }

    /**
     * The route in use once connected, or the route that would be tried. The
     * difference matters: before connecting, "auto" is a policy; after, it is
     * a fact.
     */
    getConnectionMode() {
      return this._peripheral.resolvedMode || this._peripheral.mode;
    }

    getCommunicationDiagnostics() {
      return JSON.stringify(this._peripheral.getCommunicationDiagnostics());
    }

    openCommunicationDiagnosticsLog() {
      if (typeof document === "undefined" || !document.body) {
        throw new Error(t("diagnosticsDialogUnavailable"));
      }
      if (this._diagnosticsDialog) {
        this._diagnosticsDialog.focus();
        return;
      }

      const diagnosticsJson = this.getCommunicationDiagnostics();
      const formattedJson = JSON.stringify(
        JSON.parse(diagnosticsJson),
        null,
        2
      );
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", t("diagnosticsDialogTitle"));
      overlay.tabIndex = -1;
      Object.assign(overlay.style, {
        alignItems: "center",
        background: "rgba(0, 0, 0, 0.65)",
        boxSizing: "border-box",
        display: "flex",
        inset: "0",
        justifyContent: "center",
        padding: "20px",
        position: "fixed",
        zIndex: "100000",
      });

      const panel = document.createElement("section");
      Object.assign(panel.style, {
        background: "#ffffff",
        border: "1px solid #9ca3af",
        borderRadius: "8px",
        boxSizing: "border-box",
        color: "#111827",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        height: "min(900px, 90vh)",
        maxWidth: "1000px",
        padding: "16px",
        width: "100%",
      });

      const header = document.createElement("div");
      Object.assign(header.style, {
        alignItems: "center",
        display: "flex",
        flex: "0 0 auto",
        gap: "12px",
        justifyContent: "space-between",
      });

      const title = document.createElement("h2");
      title.textContent = t("diagnosticsDialogTitle");
      Object.assign(title.style, {
        fontSize: "20px",
        margin: "0",
      });

      const makeButton = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        Object.assign(button.style, {
          background: "#f3f4f6",
          border: "1px solid #9ca3af",
          borderRadius: "4px",
          color: "#111827",
          cursor: "pointer",
          font: "inherit",
          padding: "8px 12px",
        });
        return button;
      };

      const closeButton = makeButton(t("close"));
      closeButton.setAttribute("aria-label", t("close"));

      const textarea = document.createElement("textarea");
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.value = formattedJson;
      textarea.setAttribute("aria-label", t("diagnosticsDialogTitle"));
      Object.assign(textarea.style, {
        backgroundColor: "#f9fafb",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        boxSizing: "border-box",
        color: "#111827",
        colorScheme: "light",
        flex: "1 1 auto",
        fontFamily: "Consolas, Monaco, monospace",
        fontSize: "13px",
        lineHeight: "1.5",
        minHeight: "0",
        overflow: "auto",
        resize: "vertical",
        scrollbarColor: "#9ca3af #f9fafb",
        scrollbarWidth: "thin",
        whiteSpace: "pre",
        width: "100%",
      });

      const actions = document.createElement("div");
      Object.assign(actions.style, {
        display: "flex",
        flex: "0 0 auto",
        flexWrap: "wrap",
        gap: "8px",
      });
      const copyButton = makeButton(t("diagnosticsCopyJson"));
      const saveButton = makeButton(t("diagnosticsSaveJson"));
      const status = document.createElement("div");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      Object.assign(status.style, {
        flex: "0 0 auto",
        minHeight: "1.4em",
      });

      const closeDialog = () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (this._diagnosticsDialog === overlay) {
          this._diagnosticsDialog = null;
        }
      };

      closeButton.addEventListener("click", closeDialog);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDialog();
        }
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
      });
      copyButton.addEventListener("click", async () => {
        const fullJson = textarea.value;
        try {
          if (
            typeof navigator !== "undefined" &&
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
          ) {
            await navigator.clipboard.writeText(fullJson);
            status.textContent = t("diagnosticsJsonCopied");
            return;
          }
        } catch (error) {
          // The selected textarea remains available for manual copying below.
        }

        textarea.focus();
        textarea.select();
        if (typeof textarea.setSelectionRange === "function") {
          textarea.setSelectionRange(0, fullJson.length);
        }
        let copied = false;
        try {
          copied =
            typeof document.execCommand === "function" &&
            document.execCommand("copy");
        } catch (error) {
          copied = false;
        }
        status.textContent = copied
          ? t("diagnosticsJsonCopied")
          : t("diagnosticsManualCopy");
      });
      saveButton.addEventListener("click", () => {
        let objectUrl = null;
        try {
          const blob = new Blob([textarea.value], {
            type: "application/json;charset=utf-8",
          });
          objectUrl = URL.createObjectURL(blob);
          const download = document.createElement("a");
          download.href = objectUrl;
          download.download = "spikeprime-communication-diagnostics.json";
          download.style.display = "none";
          document.body.appendChild(download);
          download.click();
          document.body.removeChild(download);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          status.textContent = t("diagnosticsJsonSaved");
        } catch (error) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          status.textContent = t("diagnosticsJsonSaveFailed");
        }
      });

      header.appendChild(title);
      header.appendChild(closeButton);
      actions.appendChild(copyButton);
      actions.appendChild(saveButton);
      panel.appendChild(header);
      panel.appendChild(textarea);
      panel.appendChild(actions);
      panel.appendChild(status);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      this._diagnosticsDialog = overlay;
      closeButton.focus();
    }

    getCommunicationDiagnosticsSummary() {
      const diagnostics = this._peripheral.getCommunicationDiagnostics();
      const unavailable = t("diag.unavailable");
      const notApplicable = t("diag.notApplicable");
      const notificationStatus = diagnostics.notificationRequest?.status;
      const notificationLabel =
        diagnostics.protocol === "spike3"
          ? t(`diag.notification.${notificationStatus}`)
          : notApplicable;
      const imuReceived = diagnostics.imuReceived === true;
      const angles = diagnostics.angles || {};
      const angleSummary = imuReceived
        ? `${t("diag.pitch")} ${angles.pitch}°, ${t("diag.roll")} ${angles.roll}°, ${t("diag.yaw")} ${angles.yaw}°`
        : unavailable;
      const motorPorts = diagnostics.motorPorts || {};
      const motorSummary = Object.entries(motorPorts)
        .map(
          ([port, values]) =>
            `${port}: ${t("diag.motorPosition")} ${values.relativePosition}°, ${t("diag.motorAbsolutePosition")} ${values.absolutePosition}°, ${t("diag.motorSpeed")} ${values.speed}`
        )
        .join("; ");
      const formatTimestamp = (timestamp) =>
        timestamp === null || timestamp === undefined
          ? unavailable
          : new Date(timestamp).toLocaleString();
      const localizeStage = (stage) =>
        stage ? t(`diag.controllerStage.${stage}`) : unavailable;
      const attempt = diagnostics.controllerInstallAttempt;
      const lastWrite = diagnostics.lastWrite;
      const lastDisconnect = diagnostics.lastDisconnect;
      const recentEvents = (diagnostics.recentEvents || [])
        .slice(-8)
        .map((event) => {
          const details =
            event.message ||
            event.stage ||
            event.reason ||
            event.action ||
            event.origin ||
            event.messageName ||
            "";
          return `${formatTimestamp(event.timestamp)} ${event.type}${details ? `: ${details}` : ""}`;
        })
        .join("\n");
      const transportError = diagnostics.lastTransportError;
      const transportErrorSummary = transportError
        ? `${transportError.name}: ${transportError.message}${transportError.stack ? `\n${transportError.stack}` : ""}`
        : "";
      return [
        `${t("diag.connection")}: ${diagnostics.connected ? t("diag.connected") : t("diag.disconnected")}`,
        `${t("diag.firmware")}: ${diagnostics.firmwareVersion || diagnostics.lastFirmwareVersion || unavailable}`,
        `${t("diag.notification")}: ${notificationLabel}`,
        `${t("diag.controller")}: ${diagnostics.protocol === "spike3" ? t(`diag.controllerStatus.${diagnostics.controllerStatus || "not-installed"}`) : notApplicable}`,
        `${t("diag.controllerVersion")}: ${diagnostics.controllerVersion || diagnostics.lastKnownControllerVersion || unavailable}`,
        `${t("diag.lastControllerStage")}: ${localizeStage(attempt?.stage)}${attempt?.outcome ? ` (${t(`diag.controllerOutcome.${attempt.outcome}`)})` : ""}`,
        `${t("diag.lastSuccessfulControllerStage")}: ${localizeStage(diagnostics.lastSuccessfulControllerStage?.stage)}`,
        `${t("diag.lastDisconnectOrigin")}: ${lastDisconnect ? `${t(`diag.disconnectOrigin.${lastDisconnect.origin}`)} (${lastDisconnect.origin}) — ${formatTimestamp(lastDisconnect.timestamp)}` : unavailable}`,
        `${t("diag.lastWrite")}: ${lastWrite ? `${lastWrite.messageName} (0x${lastWrite.messageType.toString(16)}), ${t(`diag.writeStatus.${lastWrite.status}`)}` : unavailable}`,
        `${t("diag.imuCount")}: ${diagnostics.imuNotificationCount ?? notApplicable}`,
        `${t("diag.lastImu")}: ${formatTimestamp(diagnostics.lastImuReceivedAt)}`,
        `${t("diag.angles")}: ${angleSummary}`,
        `${t("diag.motorPorts")}: ${motorSummary || t("diag.noMotorPorts")}`,
        `${t("diag.cobsErrors")}: ${diagnostics.cobsDecodeFailureCount ?? notApplicable}`,
        `${t("diag.unsupportedRecords")}: ${diagnostics.unsupportedRecordCount ?? notApplicable}`,
        `${t("diag.lastConsoleOutput")}: ${diagnostics.recentConsoleOutput || unavailable}`,
        `${t("diag.lastError")}: ${diagnostics.lastCommunicationError ? summarizeCommunicationError(diagnostics.lastCommunicationError) : t("diag.none")}`,
        ...(diagnostics.lastCommunicationError
          ? [
              `${t("diag.technicalDetail")}: ${diagnostics.lastCommunicationError}`,
            ]
          : []),
        ...(transportErrorSummary
          ? [`${t("diag.lastWriteError")}: ${transportErrorSummary}`]
          : []),
        `${t("diag.recentEvents")}:\n${recentEvents || t("diag.none")}`,
      ].join("\n");
    }

    _sendPythonFallback(error, fallbackCommand) {
      if (this._peripheral.protocol === "spike3") {
        throw error;
      }
      return fallbackCommand();
    }

    setConnectionMode(args) {
      this._peripheral.setMode(Cast.toString(args.MODE));
    }

    /**
     * Streaming is the 3.x hub pushing sensor records on an interval. Turning
     * it off freezes the sensor reporters at their last value, which is what
     * `legospikeprimeBLE` offered it for. The 2.x hub streams through its
     * Python sensor loop instead and has no equivalent switch, so this reports
     * unsupported there rather than silently doing nothing.
     */
    enableStreamingMode() {
      if (!this._peripheral.supports("streaming")) return;
      return this._peripheral.active.setDeviceNotifications(true);
    }

    disableStreamingMode() {
      if (!this._peripheral.supports("streaming")) return;
      return this._peripheral.active.setDeviceNotifications(false);
    }

    // ========================================================================
    // MOTORS (blocks carried over from the BLE extensions)
    // ========================================================================

    /**
     * Set the speed and start turning in one step.
     *
     * Native command first, Python second — the same chain every other motor
     * block here uses. On a 3.x hub the native path is the JSON tunnel command
     * both BLE extensions sent; on a 2.x hub it is the JSON-RPC verb; if
     * neither verb is known, the generated MicroPython still works.
     */
    startMotor(args) {
      const ports = this._validatePorts(Cast.toString(args.PORT));
      const speed = MathUtil.clamp(Cast.toNumber(args.SPEED), -100, 100);
      const promises = ports.map((port) => {
        this._peripheral.motorSettings[port].speed = Math.abs(speed);
        return this._peripheral
          .sendCommand("scratch.motor_start", { port: port, speed: speed })
          .catch(() =>
            this._peripheral.sendPythonCommand(
              `import hub; hub.port.${port}.motor.run_at_speed(${Math.round(speed * 9.3)})`
            )
          );
      });
      return Promise.all(promises).then(() => {});
    }

    /** Start at a bounded unregulated duty cycle through the controller. */
    motorStartPower(args) {
      const ports = this._validatePorts(Cast.toString(args.PORT));
      const power = MathUtil.clamp(Cast.toNumber(args.POWER), -100, 100);
      const dutyCycle = Math.round(power * 100);
      const promises = ports.map((port) =>
        this._peripheral
          .sendCommand("scratch.motor_power", { port, power: dutyCycle })
          .catch((error) =>
            this._sendPythonFallback(error, () =>
              this._peripheral.sendPythonCommand(
                `import hub; hub.port.${port}.motor.pwm(${Math.round(power)})`
              )
            )
          )
      );
      return Promise.all(promises).then(() => {});
    }

    /** Stop with an explicitly named stop action. */
    stopMotor(args) {
      const ports = this._validatePorts(Cast.toString(args.PORT));
      const action = Cast.toString(args.ACTION).trim().toLowerCase();
      const call =
        action === "coast"
          ? "float()"
          : action === "hold"
            ? "hold()"
            : "brake()";
      const promises = ports.map((port) =>
        this._peripheral
          .sendCommand("scratch.motor_stop", { port: port, stop: action })
          .catch(() =>
            this._peripheral.sendPythonCommand(
              `import hub; hub.port.${port}.motor.pwm(0); hub.port.${port}.motor.${call}`
            )
          )
      );
      return Promise.all(promises).then(() => {});
    }

    /** Steer and set the pair speed together. */
    motorPairMove(args) {
      const steering = MathUtil.clamp(Cast.toNumber(args.STEERING), -100, 100);
      const speed = MathUtil.clamp(Cast.toNumber(args.SPEED), -100, 100);
      const [left, right] = this._peripheral.movementMotors;
      // Steering biases one wheel against the other: at +100 the inner wheel
      // reverses, which is what turns the model on the spot.
      const leftSpeed = Math.round(
        speed * (steering > 0 ? 1 : 1 + steering / 50) * 9.3
      );
      const rightSpeed = Math.round(
        speed * (steering < 0 ? 1 : 1 - steering / 50) * 9.3
      );
      return this._peripheral
        .sendPythonCommand(
          `import hub; hub.port.${left}.motor.run_at_speed(${leftSpeed}); ` +
            `hub.port.${right}.motor.run_at_speed(${rightSpeed})`
        )
        .then(() => {});
    }

    // ========================================================================
    // DISPLAY
    // ========================================================================

    /** One of the hub's built-in images, addressed by number. */
    displayShowImage(args) {
      const image = Math.max(1, Math.round(Cast.toNumber(args.IMAGE)));
      return this._peripheral.sendPythonCommand(
        `import hub; hub.display.show(hub.Image(hub.Image.ALL_IMAGES[${image - 1}]) ` +
          `if ${image} <= len(hub.Image.ALL_IMAGES) else hub.Image.HAPPY)`
      );
    }

    /**
     * One pixel of a 3x3 colour matrix accessory on a port. Not the hub's own
     * 5x5 display — that is setPixel.
     */
    setLightMatrixPixel(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const x = MathUtil.clamp(Math.round(Cast.toNumber(args.X)), 0, 2);
      const y = MathUtil.clamp(Math.round(Cast.toNumber(args.Y)), 0, 2);
      const brightness = MathUtil.clamp(
        Math.round(Cast.toNumber(args.BRIGHTNESS)),
        0,
        100
      );
      const index = y * 3 + x;
      const level = Math.round((brightness / 100) * 10);
      return this._peripheral.sendPythonCommand(
        `import hub; _m = hub.port.${port}.device; _p = list(_m.get(5) or [0]*9); ` +
          `_p[${index}] = ${level}; _m.mode(5, bytes(_p))`
      );
    }

    // ========================================================================
    // SENSORS
    // ========================================================================

    /** Which face of the hub points up, as a name. */
    getFaceUp() {
      // Only the 3.x IMU record carries a face index. The 2.x REPL reports an
      // orientation state instead, which getOrientation gives; answering
      // "top" here would be inventing one.
      if (!this._needs("face-up")) return "";
      return this._peripheral.faceUp;
    }

    /**
     * The distance sensor in a unit the project names.
     *
     * The driver holds centimetres (and, on 3.x, the raw millimetres it was
     * given), so every unit here is a conversion of a measured figure rather
     * than a re-reading of the sensor.
     */
    getDistanceIn(args) {
      const port = Cast.toString(args.PORT).trim().toUpperCase();
      const portData = this._peripheral.portValues[port];
      if (!portData || portData.type !== "distance") return 0;
      const cm = Cast.toNumber(portData.distance);
      switch (Cast.toString(args.UNIT).trim().toLowerCase()) {
        case "mm":
          // Prefer the figure the 3.x hub actually sent over cm*10, so a
          // millimetre reader gets the sensor's own resolution back.
          return portData.distanceMM === undefined
            ? cm * 10
            : portData.distanceMM;
        case "in":
          return cm / 2.54;
        case "%":
          // The SPIKE distance sensor's useful range is 0-200 cm; the percent
          // form is what the official app shows.
          return MathUtil.clamp((cm / 200) * 100, 0, 100);
        default:
          return cm;
      }
    }

    // Utility

    /**
     * What a reporter returns when the connected firmware has no such reading.
     *
     * Empty, not zero. "0 %% reflected light" is a measurement and a learner
     * will act on it; blank is visibly the absence of one. The palette does not
     * hide blocks the hub cannot do — a block set that reshuffles on connect is
     * harder to learn from than one that stays put and explains itself — so
     * this is what "explains itself" amounts to for a reporter.
     *
     * Boolean blocks have no room for a third answer and report false.
     * docs/SPIKE-CONSOLIDATION.md carries the per-firmware table.
     */
    _needs(capability) {
      return this._peripheral.supports(capability);
    }

    _noteToFrequency(note) {
      return Math.pow(2, (note - 69 + 12) / 12) * 440;
    }
    /**
     * One motor port, A to F, or "" when the argument names none. A block
     * whose port menu arrives empty (a project that stored the port where the
     * editor does not read it) or holding a reporter's odd value does
     * nothing, as a multi-port block already does with no valid port
     * (_validatePorts), rather than throwing on motorSettings[port].
     */
    _validatePort(value) {
      const port = Cast.toString(value).trim().toUpperCase();
      if (/^[A-F]$/.test(port)) return port;
      console.warn(
        `[SPIKE] no motor port "${Cast.toString(value)}": the block does nothing`
      );
      return "";
    }

    _validatePorts(text) {
      return text
        .toUpperCase()
        .replace(/[^ABCDEF]/g, "")
        .split("")
        .filter((x, i, self) => self.indexOf(x) === i)
        .sort();
    }
  }

  Scratch.extensions.register(new SpikePrimeExtension());
})(Scratch);
