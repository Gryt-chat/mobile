package chat.gryt.syncedseed

import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/* The seed in Block Store (GRYT-1879): Google restores it on a new phone once the old screen lock
   is entered. It's only backed up to the cloud where that backup is end-to-end encrypted. */
class SyncedSeedModule : Module() {
  private val key = "chat.gryt.identity.seed"
  private val client get() = Blockstore.getClient(appContext.reactContext ?: throw Exceptions.ReactContextLost())

  override fun definition() = ModuleDefinition {
    Name("SyncedSeed")

    AsyncFunction("read") { promise: Promise ->
      client.retrieveBytes(RetrieveBytesRequest.Builder().setKeys(listOf(key)).build())
        .addOnSuccessListener { r -> promise.resolve(r.blockstoreDataMap[key]?.bytes?.toString(Charsets.UTF_8)) }
        .addOnFailureListener { promise.resolve(null) }
    }

    AsyncFunction("write") { value: String, promise: Promise ->
      client.isEndToEndEncryptionAvailable
        .addOnSuccessListener { e2e ->
          val data = StoreBytesData.Builder().setKey(key).setBytes(value.toByteArray(Charsets.UTF_8)).setShouldBackupToCloud(e2e).build()
          client.storeBytes(data)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { promise.resolve(false) }
        }
        .addOnFailureListener { promise.resolve(false) }
    }
  }
}
