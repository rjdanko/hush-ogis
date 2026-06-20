package expo.modules.silencesignals

import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

// Tracks how long the screen has been off via a registered broadcast
// receiver rather than polling, so getSignals() is cheap to call frequently.
private object ScreenStateTracker {
  // Plain assignment reads/writes only (no compound read-modify-write), so
  // @Volatile alone is sufficient for cross-thread visibility. If this ever
  // grows a compound update (e.g. increment/accumulate), switch to proper
  // synchronization (e.g. a lock or AtomicLong) instead.
  @Volatile private var screenOffSince: Long? = null

  fun onScreenOff() { screenOffSince = System.currentTimeMillis() }
  fun onScreenOn() { screenOffSince = null }
  fun screenOffDurationMs(): Long {
    val since = screenOffSince ?: return 0
    return System.currentTimeMillis() - since
  }
}

class SilenceSignalsModule : Module() {
  private val screenStateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        Intent.ACTION_SCREEN_OFF -> ScreenStateTracker.onScreenOff()
        Intent.ACTION_SCREEN_ON -> ScreenStateTracker.onScreenOn()
      }
    }
  }
  private var isReceiverRegistered = false

  override fun definition() = ModuleDefinition {
    Name("SilenceSignals")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      context.registerReceiver(screenStateReceiver, filter)
      isReceiverRegistered = true
    }

    OnDestroy {
      if (isReceiverRegistered) {
        appContext.reactContext?.unregisterReceiver(screenStateReceiver)
        isReceiverRegistered = false
      }
    }

    AsyncFunction("getSignals") {
      val context = appContext.reactContext ?: throw IllegalStateException("no react context")

      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val interruptionFilter = notificationManager.currentInterruptionFilter

      val isForeground = if (hasUsageAccess(context)) isAnyAppForeground(context) else false

      mapOf(
        "screenOffMs" to ScreenStateTracker.screenOffDurationMs(),
        "interruptionFilter" to interruptionFilter,
        "isForeground" to isForeground
      )
    }

    AsyncFunction("hasUsageAccessPermission") {
      hasUsageAccess(appContext.reactContext ?: throw IllegalStateException("no react context"))
    }

    // Intentionally a synchronous Function (not AsyncFunction): there is no
    // promise to reject, so a missing react context silently no-ops rather
    // than throwing — that's the only sane behavior here.
    Function("openUsageAccessSettings") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }
  }

  private fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun isAnyAppForeground(context: Context): Boolean {
    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val end = System.currentTimeMillis()
    // A 30s trailing window is enough to catch recent foreground activity
    // without polling continuously; an empty event window (no events found)
    // defaults to false (not foreground) as the safe assumption.
    val start = end - TimeUnit.SECONDS.toMillis(30)
    val events = usageStatsManager.queryEvents(start, end)
    val event = UsageEvents.Event()
    var lastWasForeground = false
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        UsageEvents.Event.MOVE_TO_FOREGROUND -> lastWasForeground = true
        UsageEvents.Event.MOVE_TO_BACKGROUND -> lastWasForeground = false
      }
    }
    return lastWasForeground
  }
}
