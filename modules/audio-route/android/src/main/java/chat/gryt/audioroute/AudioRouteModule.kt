package chat.gryt.audioroute

import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Where a call comes out, on Android.
 *
 * The other half of `modules/audio-route`, whose iOS side has existed since the
 * voice sheet did. `requireOptionalNativeModule` returned null here, so every
 * function in `index.ts` answered "there is no choice to offer" — the picker
 * drew nothing and a call went wherever Android decided. GRYT-561.
 *
 * The shape is the iOS one, deliberately: `speaker` and `receiver` are ours,
 * everything else is an accessory under its own id. `index.ts` describes that
 * contract and neither platform gets to invent its own.
 *
 * **Two implementations, split at API 31.** From S onwards there is a real
 * communication-device API — ask for the list, set one, clear it — and it is
 * the one that behaves. Below that the only levers are `isSpeakerphoneOn` and
 * the SCO calls, which are a different model wearing the same words: there is
 * no list, so it is assembled from what the system says is plugged in, and
 * "selecting" is a set of side effects rather than a choice. The old path is
 * kept because `minSdkVersion` is 24, not because it is good.
 */
class AudioRouteModule : Module() {
  private val audio: AudioManager
    get() = requireNotNull(
      appContext.reactContext?.getSystemService(android.content.Context.AUDIO_SERVICE)
        as? AudioManager,
    ) { "No AudioManager: the module was used before the activity existed." }

  private var callback: AudioDeviceCallback? = null

  override fun definition() = ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange")

    Function("outputs") { outputs() }

    Function("current") { current() }

    Function("select") { id: String -> select(id) }

    OnStartObserving {
      val handler = Handler(Looper.getMainLooper())
      val added = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(devices: Array<out AudioDeviceInfo>?) = announce()
        override fun onAudioDevicesRemoved(devices: Array<out AudioDeviceInfo>?) = announce()
      }
      callback = added
      audio.registerAudioDeviceCallback(added, handler)
    }

    OnStopObserving {
      callback?.let { audio.unregisterAudioDeviceCallback(it) }
      callback = null
    }
  }

  private fun announce() {
    sendEvent("onRouteChange", mapOf("current" to current()))
  }

  /**
   * Everything that could be picked right now.
   *
   * The speaker is always there. The earpiece is not: a tablet does not have
   * one, and asking the device list is how that is answered without asking what
   * kind of device this is — the same reasoning the iOS side uses for
   * `builtInMic`.
   */
  private fun outputs(): List<Map<String, Any>> {
    val result = mutableListOf<Map<String, Any>>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      for (device in audio.availableCommunicationDevices) {
        result.add(
          mapOf(
            "id" to idOf(device),
            "name" to nameOf(device),
            "kind" to kindOf(device.type),
          ),
        )
      }
      return result
    }

    result.add(mapOf("id" to "speaker", "name" to "Speaker", "kind" to "speaker"))

    val devices = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    if (devices.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }) {
      result.add(mapOf("id" to "receiver", "name" to "Phone", "kind" to "receiver"))
    }
    for (device in devices) {
      if (device.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) continue
      if (device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) continue
      result.add(
        mapOf(
          "id" to idOf(device),
          "name" to nameOf(device),
          "kind" to kindOf(device.type),
        ),
      )
    }
    return result
  }

  /** What is playing, or null when the system has not committed to anything. */
  private fun current(): Map<String, Any>? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = audio.communicationDevice ?: return null
      return mapOf(
        "id" to idOf(device),
        "name" to nameOf(device),
        "kind" to kindOf(device.type),
      )
    }

    /* No equivalent question below S, so this is inference rather than an
     * answer: what the system would use, in the order it would use it. */
    @Suppress("DEPRECATION")
    return when {
      audio.isBluetoothScoOn ->
        mapOf("id" to "bluetooth", "name" to "Bluetooth", "kind" to "bluetooth")
      audio.isSpeakerphoneOn ->
        mapOf("id" to "speaker", "name" to "Speaker", "kind" to "speaker")
      audio.isWiredHeadsetOn ->
        mapOf("id" to "headphones", "name" to "Headphones", "kind" to "headphones")
      else -> mapOf("id" to "receiver", "name" to "Phone", "kind" to "receiver")
    }
  }

  private fun select(id: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = audio.availableCommunicationDevices.firstOrNull { idOf(it) == id }
      if (device == null) {
        /* Asked for something that has since been unplugged. Clearing puts the
         * system back in charge rather than leaving the call on a device that
         * is gone. */
        audio.clearCommunicationDevice()
        return
      }
      audio.setCommunicationDevice(device)
      announce()
      return
    }

    @Suppress("DEPRECATION")
    when (id) {
      "speaker" -> {
        audio.stopBluetoothSco()
        audio.isBluetoothScoOn = false
        audio.isSpeakerphoneOn = true
      }
      "receiver" -> {
        audio.stopBluetoothSco()
        audio.isBluetoothScoOn = false
        audio.isSpeakerphoneOn = false
      }
      else -> {
        /* Anything else below S is bluetooth or a wire. A wire needs nothing —
         * plugging it in is the selection — and bluetooth needs SCO started,
         * which is asynchronous and reports through the same device callback
         * that `onRouteChange` already listens to. */
        audio.isSpeakerphoneOn = false
        audio.startBluetoothSco()
        audio.isBluetoothScoOn = true
      }
    }
    announce()
  }

  /**
   * The id `select` will be given back.
   *
   * The two built-ins keep the names the contract fixes; everything else is
   * the system's own device id, which is stable for as long as the device is
   * connected and is exactly as long as it can be selected.
   */
  private fun idOf(device: AudioDeviceInfo): String = when (device.type) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
    else -> device.id.toString()
  }

  private fun nameOf(device: AudioDeviceInfo): String = when (device.type) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone"
    /* `productName` is the headset's own name where it has one — "WH-1000XM4"
     * rather than "Bluetooth". It is never empty in practice but it is a
     * `CharSequence` and worth not trusting. */
    else -> device.productName?.toString()?.takeIf { it.isNotBlank() } ?: fallbackName(device.type)
  }

  private fun fallbackName(type: Int): String = when (kindOf(type)) {
    "bluetooth" -> "Bluetooth"
    "headphones" -> "Headphones"
    "car" -> "Car"
    else -> "Other"
  }

  /**
   * The kinds `index.ts` declares, and nothing else.
   *
   * `airplay` is on that list and is deliberately unreachable here: it is an
   * Apple thing, and a kind the phone can never report is better than
   * pretending Chromecast is the same idea.
   */
  private fun kindOf(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    -> "headphones"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    -> "bluetooth"
    else -> when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && type == AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && type == AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bluetooth"
      else -> "other"
    }
  }
}
