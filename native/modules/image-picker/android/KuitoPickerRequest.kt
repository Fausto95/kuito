package dev.kuito.runtime.modules.imagepicker

import dev.kuito.link.MediaPickerRequest
import dev.kuito.link.PickerMediaType

val MediaPickerRequest.images get() = PickerMediaType.IMAGES in mediaTypes
val MediaPickerRequest.videos get() = PickerMediaType.VIDEOS in mediaTypes
