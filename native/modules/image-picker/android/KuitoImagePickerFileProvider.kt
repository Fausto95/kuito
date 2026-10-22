package dev.kuito.runtime.modules.imagepicker

import androidx.core.content.FileProvider

/**
 * Gives the camera app a `content://` URI to write its capture to, in the
 * app's cache (res/xml/kuito_image_picker_paths.xml). Its own class, so it
 * never clashes with another library's FileProvider in the manifest.
 */
class KuitoImagePickerFileProvider : FileProvider()
