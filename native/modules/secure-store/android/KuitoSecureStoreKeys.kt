package dev.kuito.runtime.modules.securestore

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64
import dev.kuito.link.SecureStoreRequest

/**
 * SecureStore's three AES-256-GCM keys in the Android Keystore, one per kind
 * of protection. The key material never leaves the Keystore (hardware-backed
 * where the device has it); each secret records which key sealed it.
 */
internal object KuitoSecureStoreKeys {
    const val TRANSFORMATION = "AES/GCM/NoPadding"

    /** Usable after the first unlock since boot: app data is credential-encrypted until then. */
    private const val PLAIN = "kuito.securestore"
    /** Usable only while the device is unlocked (Android 9 and later). */
    private const val UNLOCKED = "kuito.securestore.unlocked"
    /** Each use needs a strong biometric, and a new enrollment invalidates it (Android 11 and later). */
    const val AUTHENTICATED = "kuito.securestore.authenticated"

    private val keystore by lazy { KeyStore.getInstance("AndroidKeyStore").apply { load(null) } }

    fun alias(request: SecureStoreRequest) = when {
        request.requireAuthentication -> AUTHENTICATED
        request.accessible.unlockedDeviceRequired && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P -> UNLOCKED
        else -> PLAIN
    }

    fun existing(alias: String) = keystore.getKey(alias, null) as? SecretKey

    @Synchronized
    fun key(alias: String): SecretKey = existing(alias) ?: generate(alias)

    fun discard(alias: String) = keystore.deleteEntry(alias)

    fun iv(encoded: String) = GCMParameterSpec(128, Base64.decode(encoded, Base64.NO_WRAP))

    private fun generate(alias: String): SecretKey {
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)

        if (alias == UNLOCKED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) spec.setUnlockedDeviceRequired(true)
        if (alias == AUTHENTICATED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true)
        }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply { init(spec.build()) }
            .generateKey()
    }
}
