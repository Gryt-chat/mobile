package chat.gryt.callservice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallServiceModule : Module() {
  private val context: Context? get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("CallService")

    Function("start") { context?.let { begin(it) } }
    Function("stop") { context?.let { it.stopService(Intent(it, CallService::class.java)) } }
  }

  private fun begin(ctx: Context) {
    val intent = Intent(ctx, CallService::class.java)
    // Android refuses a microphone service started from the background: the call keeps going without it.
    try {
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
    } catch (e: Exception) {
      Log.w("CallService", "could not start: ${e.message}")
    }
  }
}
