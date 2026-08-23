package chat.gryt.shareintent

import android.content.ClipDescription
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A share handed to Gryt by another app.
 *
 * Android delivers this as an `Intent` — `ACTION_SEND` with one `EXTRA_STREAM`,
 * or `ACTION_SEND_MULTIPLE` with several, or `EXTRA_TEXT` for a link. None of
 * that reaches JavaScript on its own: `Linking` only sees a URL, and a share is
 * not a URL. So this reads the Intent and flattens it into the same shape the
 * iOS side produces.
 *
 * **A share is consumed once.** The launch Intent stays on the Activity for as
 * long as the Activity lives, so reading it without clearing it means the same
 * picture is offered again on every foreground until the app is killed —
 * indistinguishable, from the inside, from somebody sharing the same picture
 * repeatedly. `consumed` is what stops that.
 */
class ShareIntentModule : Module() {
  /**
   * The Intent to read, when it arrived while the app was already running.
   *
   * `onNewIntent` does not replace what `getIntent()` returns unless somebody
   * calls `setIntent`, and relying on the host Activity to have done that is
   * relying on a detail of a class this module does not own. Holding it here is
   * one field and no assumptions.
   */
  private var pending: Intent? = null
  private var consumed = false

  override fun definition() = ModuleDefinition {
    Name("ShareIntent")

    Events("onShare")

    /**
     * The share waiting to be dealt with, or null.
     *
     * Null is the ordinary answer. Every cold start reads its launch Intent
     * through here whether or not it was a share, and almost none of them were.
     */
    Function("consume") { ->
      val intent = pending ?: appContext.currentActivity?.intent
      if (intent == null || consumed) return@Function null

      val share = read(intent)
      /* Marked whether or not there was anything in it — an ordinary launch is
         consumed too, so a later foreground does not re-read an Intent that has
         already been looked at. */
      consumed = true
      pending = null
      share
    }

    OnNewIntent { intent ->
      /* A second share while the app is already up. The Activity is coming to
         the front either way, so the event is not what brings the sheet up —
         it is what tells JavaScript there is something new behind the
         foreground it was about to see anyway. */
      if (!isShare(intent)) return@OnNewIntent
      pending = intent
      consumed = false
      sendEvent("onShare", mapOf("waiting" to true))
    }
  }

  private fun isShare(intent: Intent): Boolean =
    intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE

  private fun read(intent: Intent): Map<String, Any?>? {
    if (!isShare(intent)) return null

    val uris = mutableListOf<Uri>()
    if (intent.action == Intent.ACTION_SEND) {
      streamOf(intent)?.let { uris.add(it) }
    } else {
      streamsOf(intent)?.let { uris.addAll(it) }
    }

    /* `EXTRA_TEXT` is the link or the note. It also arrives *alongside* files
       from apps that add "Shared from …", which is why both halves are read
       rather than one being treated as the other's absence. */
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

    val files = uris.map { describe(it, intent.type) }
    if (files.isEmpty() && text.isNullOrBlank() && subject.isNullOrBlank()) return null

    return mapOf(
      /* The subject only when there is no body. Several mail and browser apps
         send the page title as the subject and the URL as the text, and showing
         both would put the title in the message twice. */
      "text" to (if (!text.isNullOrBlank()) text else subject),
      "files" to files,
    )
  }

  @Suppress("DEPRECATION")
  private fun streamOf(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

  @Suppress("DEPRECATION")
  private fun streamsOf(intent: Intent): List<Uri>? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
    }

  /**
   * A name and a type for one `content://` uri.
   *
   * Both are worth the query. The uri itself usually carries neither — an
   * Android media uri is an opaque row id — and without them the upload is
   * stored as `application/octet-stream` under a made-up name. The JavaScript
   * side guesses when this comes back empty, but a real answer beats a guess.
   *
   * Failures here are ordinary rather than exceptional: the sending app grants
   * read permission on the uri only, and asking a provider that has gone away
   * throws. A file with no name is still a file worth sending.
   */
  private fun describe(uri: Uri, fallbackType: String?): Map<String, Any?> {
    val resolver = appContext.reactContext?.contentResolver
    var name: String? = null

    try {
      resolver?.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (column >= 0 && cursor.moveToFirst()) name = cursor.getString(column)
      }
    } catch (_: Exception) {
      // Left null. The name is a nicety; the uri is the file.
    }

    val mime = try {
      resolver?.getType(uri)
    } catch (_: Exception) {
      null
    }

    return mapOf(
      "uri" to uri.toString(),
      "name" to name,
      // The Intent's own type is the fallback, but only when it names one thing.
      // A multi-share sets it to a wildcard like "image/" plus a star, which is
      // not a mime type anything can store. (Written out because Kotlin nests
      // block comments, so the literal wildcard opens one that never closes.)
      "mime" to (mime ?: fallbackType?.takeUnless { it.contains('*') || it == ClipDescription.MIMETYPE_TEXT_PLAIN }),
    )
  }
}
